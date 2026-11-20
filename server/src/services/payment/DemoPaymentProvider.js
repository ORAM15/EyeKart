/**
 * EyeKart Phase 4 Demo Payment Provider
 * Provides deterministic simulation of Safaricom M-PESA STK Push.
 * Clearly designated as DEMO PAYMENT — never contacts live external gateways.
 * 
 * Complies with strict payment state machine:
 * - initiatePayment() creates attempt in INITIATED and transitions to PENDING (never directly to SUCCESS)
 * - confirmDemoPayment() simulates user PIN entry / confirmation to transition PENDING -> SUCCESS or FAILED
 * - allocateStock() is invoked upon transition to SUCCESS
 * - releaseStock() is invoked upon transition to CANCELLED or EXPIRED
 */
const { PaymentProvider, PAYMENT_STATES, isValidPaymentTransition } = require('./PaymentProvider');
const DarajaClient = require('./DarajaClient');
const { query, getClient } = require('../../db/pool');
const { logAuditEvent } = require('../auditService');
const { allocateStock, releaseStock } = require('../inventoryService');

// An INITIATED attempt means the row was inserted but the transition to
// PENDING has not completed yet. A demo transition takes milliseconds, so
// an INITIATED row older than this was orphaned by a crashed request and
// may be superseded by a retry.
const STALE_INITIATED_MS = 5 * 60 * 1000;

class DemoPaymentProvider extends PaymentProvider {
  constructor() {
    super('DEMO', 'DEMO');
  }

  /**
   * Initiate a deterministic demo payment attempt
   * Returns attempt in PENDING state with a simulated checkoutRequestId
   */
  async initiatePayment({
    orderId,
    phone,
    amount = null,
    currency = 'KES',
    idempotencyKey = null,
    simulateOutcome = null,
    actorId = null,
    actorRole = null,
    ipAddress = null
  }) {
    // 1. Strict currency check: M-PESA only transacts in KES
    if (currency && currency.toUpperCase() !== 'KES') {
      const err = new Error(`M-PESA only supports 'KES' currency. Provided: '${currency}'.`);
      err.code = 'INVALID_CURRENCY';
      err.statusCode = 400;
      throw err;
    }

    // 2-5. Order fetch + ownership + idempotency + active-attempt guard + insert,
    // all inside one transaction holding a row lock on the order. The lock
    // serializes concurrent initiations for the same order, so the
    // check-then-insert below cannot race. Ownership is verified BEFORE any
    // duplicate/active attempt is returned, and the idempotency lookup is
    // scoped to this order and this provider: a key belonging to another
    // order, or to another provider's attempt, is a generic 409 conflict,
    // never the other attempt row. The lookup runs before the
    // ORDER_ALREADY_PAID check so a client retrying its original request
    // after the order was paid can still recover its attempt. Mirrors
    // MpesaDarajaProvider.initiatePayment (PR #14).
    const client = await getClient();
    let order;
    let attempt;
    let isDuplicate = false;
    let authoritativeAmount;
    let formattedPhone;
    try {
      await client.query('BEGIN');

      // 2. Fetch authoritative order, locked for the duration of this txn.
      const orderRes = await client.query(
        `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1 FOR UPDATE`,
        [orderId]
      );
      if (orderRes.rows.length === 0) {
        const err = new Error(`Order '${orderId}' not found.`);
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }
      order = orderRes.rows[0];

      // Ownership check FIRST: customer cannot pay for another customer's
      // order, and must not learn anything about another order's attempts.
      if (actorId && order.user_id !== actorId && actorRole !== 'ADMIN') {
        const err = new Error('Access denied. You can only initiate payment for your own orders.');
        err.code = 'FORBIDDEN_ORDER_ACCESS';
        err.statusCode = 403;
        throw err;
      }

      if (order.status === 'CANCELLED') {
        const err = new Error('Cannot initiate payment for a cancelled order.');
        err.statusCode = 400;
        err.code = 'ORDER_CANCELLED';
        throw err;
      }

      if (order.status === 'EXPIRED') {
        const err = new Error('Cannot initiate payment for an expired order.');
        err.statusCode = 400;
        err.code = 'ORDER_EXPIRED';
        throw err;
      }

      // 3. Idempotency verification, scoped to this order AND this
      // provider, resolved BEFORE the terminal payment-state check below:
      // if a callback already marked the order paid, a client retrying its
      // original request (e.g. because the first response was lost) must
      // recover the existing attempt instead of hitting ORDER_ALREADY_PAID.
      // A prior attempt is only a replay when it belongs to THIS order and
      // was created through THIS provider; a key already used for a
      // different order, or for a different provider's attempt (e.g. a
      // Daraja attempt), is a conflict, and the row is never returned.
      if (idempotencyKey) {
        const existing = await client.query(
          `SELECT * FROM payment_attempts WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const prior = existing.rows[0];
          if (prior.order_id !== order.id) {
            const err = new Error('This idempotency key has already been used for a different order. Retry with a new key.');
            err.code = 'IDEMPOTENCY_KEY_CONFLICT';
            err.statusCode = 409;
            throw err;
          }
          if (prior.provider !== this.name) {
            const err = new Error(`This idempotency key has already been used for a ${prior.provider} payment attempt. Retry with a new key.`);
            err.code = 'IDEMPOTENCY_KEY_CONFLICT';
            err.statusCode = 409;
            throw err;
          }
          attempt = prior;
          isDuplicate = true;
        }
      }

      // A replay (isDuplicate) skips the checks below: the original
      // request was already validated when the attempt was created, and a
      // retry must recover the attempt even though the order is now paid.
      if (!isDuplicate) {
        if (order.payment_status === 'SUCCESS') {
          const err = new Error('Order is already fully paid.');
          err.statusCode = 400;
          err.code = 'ORDER_ALREADY_PAID';
          throw err;
        }

        // 4. Server-authoritative amount check: Client cannot tamper with order total
        authoritativeAmount = Number(order.total);
        if (amount !== null && amount !== undefined) {
          const requestedAmount = Number(amount);
          if (Math.abs(requestedAmount - authoritativeAmount) > 0.01) {
            const err = new Error(`Amount mismatch. Authoritative order total is KES ${authoritativeAmount.toFixed(2)}, but requested amount was KES ${requestedAmount.toFixed(2)}.`);
            err.code = 'AMOUNT_MISMATCH';
            err.statusCode = 400;
            throw err;
          }
        }

        // Phone normalization (254XXXXXXXXX)
        formattedPhone = DarajaClient.formatPhoneNumber(phone || order.phone);
      }

      // 5. Active-attempt guard: a PENDING (simulated prompt awaiting PIN
      // confirmation) or in-flight INITIATED attempt for this order,
      // created through THIS provider, is returned instead of creating a
      // second demo attempt. Attempts from another provider (e.g. a pending
      // Daraja attempt) must NOT block a demo initiation, and vice versa.
      // This also covers keyless retries and concurrent requests using
      // different keys, which the idempotency key alone cannot catch.
      if (!isDuplicate) {
        const activeRes = await client.query(
          `SELECT * FROM payment_attempts
           WHERE order_id = $1 AND provider = $2 AND status IN ('PENDING', 'INITIATED')
           ORDER BY created_at DESC LIMIT 1`,
          [order.id, this.name]
        );
        if (activeRes.rows.length > 0) {
          const active = activeRes.rows[0];
          if (active.status === 'PENDING') {
            attempt = active;
            isDuplicate = true;
          } else if (Date.now() - new Date(active.created_at).getTime() > STALE_INITIATED_MS) {
            // Orphaned INITIATED row: its creator crashed before the
            // transition to PENDING. Mark it failed so this retry can
            // proceed; the admin expire-stale job would otherwise clean it
            // up within 30 min.
            await client.query(
              `UPDATE payment_attempts
               SET status = 'FAILED',
                   failure_reason = 'Superseded: stale initiated attempt with no dispatched STK push',
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [active.id]
            );
          } else {
            // Transition genuinely in flight: return it, do not duplicate.
            attempt = active;
            isDuplicate = true;
          }
        }
      }

      // 6. Record payment attempt with INITIATED status (unless replaying).
      // Backstop: uq_payment_attempts_order_idemp (unique on
      // (order_id, idempotency_key) where key IS NOT NULL) rejects a
      // same-key race that slipped past the lookup above; on violation we
      // return the winning attempt instead of failing the request.
      if (!isDuplicate) {
        // Generate demo checkout identifiers (inside the txn, so a replay
        // never mints new ones).
        const checkoutRequestId = `ws_CO_DEMO_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}`;
        const merchantRequestId = `mr_DEMO_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        try {
          const insertRes = await client.query(
            `INSERT INTO payment_attempts (
              order_id, provider, payment_rail, amount, currency, status, idempotency_key, phone_number, checkout_request_id, merchant_request_id, metadata
            ) VALUES ($1, 'DEMO', 'Safaricom Daraja 2.0 (Demo Rail)', $2, 'KES', 'INITIATED', $3, $4, $5, $6, $7)
            RETURNING *`,
            [
              order.id,
              authoritativeAmount,
              idempotencyKey || null,
              formattedPhone,
              checkoutRequestId,
              merchantRequestId,
              JSON.stringify({
                phone: formattedPhone,
                isDemo: true,
                simulationNote: 'Deterministic simulated STK Push',
                simulateOutcome: simulateOutcome || null,
                initiatedAt: new Date().toISOString()
              })
            ]
          );
          attempt = insertRes.rows[0];
        } catch (insertErr) {
          if (insertErr.code === '23505' && idempotencyKey) {
            await client.query('ROLLBACK').catch(() => {});
            // Same-provider winner only: a Daraja attempt sharing this key
            // and order would also violate the (order_id, idempotency_key)
            // unique constraint, but returning it would hand the demo
            // client a Daraja checkout ID with no simulated prompt.
            const winner = await query(
              `SELECT * FROM payment_attempts WHERE idempotency_key = $1 AND order_id = $2 AND provider = $3`,
              [idempotencyKey, order.id, this.name]
            );
            if (winner.rows.length > 0) {
              return {
                isDuplicate: true,
                attempt: winner.rows[0],
                checkoutRequestId: winner.rows[0].checkout_request_id || null,
                merchantRequestId: winner.rows[0].merchant_request_id || null,
                status: winner.rows[0].status
              };
            }
            const conflictErr = new Error('This idempotency key has already been used for a different provider\'s payment attempt. Retry with a new key.');
            conflictErr.code = 'IDEMPOTENCY_KEY_CONFLICT';
            conflictErr.statusCode = 409;
            throw conflictErr;
          }
          throw insertErr;
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Replay / active-attempt return: no new demo attempt is created.
    // The route layer projects only safe fields from this attempt.
    if (isDuplicate) {
      return {
        isDuplicate: true,
        attempt,
        checkoutRequestId: attempt.checkout_request_id || null,
        merchantRequestId: attempt.merchant_request_id || null,
        status: attempt.status
      };
    }

    // Update order status to PAYMENT_PENDING
    await query(
      `UPDATE orders SET status = 'PAYMENT_PENDING', payment_status = 'INITIATED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [order.id]
    );

    await logAuditEvent({
      actorId: actorId || order.user_id,
      actorRole: actorRole || 'CUSTOMER',
      ipAddress,
      action: 'PAYMENT_INITIATED',
      entity: 'Order',
      entityId: order.id,
      metadata: { attemptId: attempt.id, amount: authoritativeAmount, provider: 'DEMO', checkoutRequestId: attempt.checkout_request_id }
    });

    // 7. Transition to PENDING state (STK push prompt on handset)
    const pendingAttempt = await this.transitionAttempt(attempt.id, PAYMENT_STATES.PENDING, {
      actorId,
      ipAddress
    });

    return {
      success: true,
      provider: 'DEMO',
      isDemo: true,
      status: PAYMENT_STATES.PENDING,
      checkoutRequestId: attempt.checkout_request_id,
      merchantRequestId: attempt.merchant_request_id,
      customerMessage: 'Simulated STK Push prompt sent to handset. Awaiting PIN confirmation.',
      attempt: pendingAttempt
    };
  }

  /**
   * Confirm or simulate completion of a demo payment
   */
  async confirmDemoPayment({
    attemptId = null,
    checkoutRequestId = null,
    outcome = 'SUCCESS',
    failureReason = null,
    actorId = null,
    ipAddress = null
  }) {
    let queryClause = 'WHERE id = $1';
    let queryVal = attemptId;

    if (!attemptId && checkoutRequestId) {
      queryClause = 'WHERE checkout_request_id = $1';
      queryVal = checkoutRequestId;
    }

    const res = await query(`SELECT * FROM payment_attempts ${queryClause}`, [queryVal]);
    if (res.rows.length === 0) {
      const err = new Error('Payment attempt not found.');
      err.statusCode = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }
    const attempt = res.rows[0];

    if (attempt.status === PAYMENT_STATES.SUCCESS) {
      return {
        success: true,
        alreadyProcessed: true,
        attempt
      };
    }

    if (outcome === 'FAIL' || outcome === 'FAILED') {
      const failedAttempt = await this.transitionAttempt(attempt.id, PAYMENT_STATES.FAILED, {
        failureReason: failureReason || 'Customer cancelled PIN prompt or handset timeout (Simulated)',
        actorId,
        ipAddress
      });
      return {
        success: false,
        status: PAYMENT_STATES.FAILED,
        attempt: failedAttempt
      };
    }

    const txRef = 'QHK' + Math.floor(100000 + Math.random() * 900000) + 'MP';
    const successAttempt = await this.transitionAttempt(attempt.id, PAYMENT_STATES.SUCCESS, {
      transactionRef: txRef,
      actorId,
      ipAddress
    });

    return {
      success: true,
      status: PAYMENT_STATES.SUCCESS,
      receiptNumber: txRef,
      attempt: successAttempt
    };
  }

  /**
   * Transition payment attempt state with strict state machine validation and inventory coordination
   */
  async transitionAttempt(attemptId, targetState, { transactionRef = null, failureReason = null, actorId = null, ipAddress = null } = {}) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT pa.*, o.id as authoritative_order_id, o.requires_prescription_review, o.user_id as order_user_id
         FROM payment_attempts pa
         JOIN orders o ON pa.order_id = o.id
         WHERE pa.id = $1
         FOR UPDATE OF pa`,
        [attemptId]
      );

      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Payment attempt not found.');
        err.statusCode = 404;
        throw err;
      }
      const currentAttempt = res.rows[0];

      // Legal transition check
      if (!isValidPaymentTransition(currentAttempt.status, targetState)) {
        await client.query('ROLLBACK');
        const err = new Error(`Illegal payment state transition from '${currentAttempt.status}' to '${targetState}'.`);
        err.statusCode = 400;
        err.code = 'ILLEGAL_PAYMENT_STATE_TRANSITION';
        throw err;
      }

      const updatedRes = await client.query(
        `UPDATE payment_attempts 
         SET status = $1,
             transaction_ref = COALESCE($2, transaction_ref),
             mpesa_receipt_number = COALESCE($2, mpesa_receipt_number),
             failure_reason = COALESCE($3, failure_reason),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [targetState, transactionRef, failureReason, attemptId]
      );
      const updatedAttempt = updatedRes.rows[0];

      // Synchronize Order status
      if (targetState === PAYMENT_STATES.SUCCESS) {
        const nextOrderStatus = currentAttempt.requires_prescription_review ? 'PROCESSING' : 'PAID';
        await client.query(
          `UPDATE orders 
           SET status = $1,
               payment_status = 'SUCCESS',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [nextOrderStatus, currentAttempt.authoritative_order_id]
        );

        await client.query('COMMIT');

        // Allocate physical inventory from reserved stock
        try {
          await allocateStock({
            orderId: currentAttempt.authoritative_order_id,
            actorId: actorId || currentAttempt.order_user_id,
            ipAddress
          });
        } catch (allocErr) {
          console.error('[DemoPaymentProvider] Warning: Failed to allocate stock on success:', allocErr.message);
        }

        await logAuditEvent({
          actorId: actorId || currentAttempt.order_user_id,
          actorRole: 'SYSTEM',
          ipAddress,
          action: 'PAYMENT_SUCCEEDED',
          entity: 'Order',
          entityId: currentAttempt.authoritative_order_id,
          metadata: { attemptId, transactionRef, provider: 'DEMO' }
        });
      } else if (targetState === PAYMENT_STATES.FAILED) {
        await client.query(
          `UPDATE orders 
           SET payment_status = 'FAILED', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND payment_status != 'SUCCESS'`,
          [currentAttempt.authoritative_order_id]
        );

        await client.query('COMMIT');

        await logAuditEvent({
          actorId: actorId || currentAttempt.order_user_id,
          actorRole: 'SYSTEM',
          ipAddress,
          action: 'PAYMENT_FAILED',
          entity: 'Order',
          entityId: currentAttempt.authoritative_order_id,
          metadata: { attemptId, failureReason, provider: 'DEMO' }
        });
      } else if (targetState === PAYMENT_STATES.CANCELLED || targetState === PAYMENT_STATES.EXPIRED) {
        await client.query(
          `UPDATE orders 
           SET payment_status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND payment_status != 'SUCCESS'`,
          [targetState, currentAttempt.authoritative_order_id]
        );

        await client.query('COMMIT');

        // Release reserved inventory back to active stock
        try {
          await releaseStock({
            orderId: currentAttempt.authoritative_order_id,
            actorId: actorId || currentAttempt.order_user_id,
            ipAddress
          });
        } catch (relErr) {
          console.error('[DemoPaymentProvider] Warning: Failed to release stock on cancel/expire:', relErr.message);
        }

        await logAuditEvent({
          actorId: actorId || currentAttempt.order_user_id,
          actorRole: 'SYSTEM',
          ipAddress,
          action: targetState === PAYMENT_STATES.CANCELLED ? 'PAYMENT_CANCELLED' : 'PAYMENT_EXPIRED',
          entity: 'Order',
          entityId: currentAttempt.authoritative_order_id,
          metadata: { attemptId, provider: 'DEMO' }
        });
      } else {
        await client.query('COMMIT');
      }

      return updatedAttempt;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = DemoPaymentProvider;
