/**
 * EyeKart Phase 6.6 Safaricom M-PESA Daraja Provider
 * Implements PaymentProvider contract for Safaricom Daraja 2.0 (STK Push).
 *
 * SAFETY INVARIANTS:
 * - Server-authoritative amount gating: Uses order.total from database, rejecting client tampering.
 * - Currency gating: Strictly enforces KES currency for Safaricom rails.
 * - Environment safety: Defaults to DISABLED; safe fallback when credentials are empty.
 * - Database synchronization: Stores checkout_request_id and merchant_request_id for atomic webhook lookup.
 */
const { PaymentProvider, PAYMENT_STATES, PROVIDER_ENVIRONMENTS } = require('./PaymentProvider');
const DarajaClient = require('./DarajaClient');
const { query, getPool } = require('../../db/pool');
const { logAuditEvent } = require('../auditService');

// An INITIATED attempt means the row was inserted but the STK dispatch has
// not completed yet. Dispatch takes seconds, so an INITIATED row older than
// this was orphaned by a crashed request and may be superseded by a retry.
// (The admin expire-stale job, 30 min default, is the outer cleanup.)
const STALE_INITIATED_MS = 5 * 60 * 1000;

class MpesaDarajaProvider extends PaymentProvider {
  constructor(config = {}) {
    const env = (config.environment || process.env.MPESA_ENVIRONMENT || 'DISABLED').toUpperCase();
    super('MPESA_DARAJA', env);
    this.darajaClient = new DarajaClient(config);
  }

  /**
   * Authoritative STK Push initiation
   */
  async initiatePayment({
    orderId,
    phone,
    amount = null,
    currency = 'KES',
    idempotencyKey = null,
    actorId = null,
    actorRole = null,
    ipAddress = null
  }) {
    // 1. Validate environment configuration
    if (!this.darajaClient.isConfigured && !this.darajaClient.mockTransport) {
      const err = new Error('Safaricom M-PESA Daraja is currently DISABLED or missing credentials. Configure MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, and MPESA_PASSKEY.');
      err.code = 'PROVIDER_DISABLED';
      err.statusCode = 503;
      throw err;
    }

    // 2. Strict currency check: Safaricom M-PESA only transacts in KES
    if (currency && currency.toUpperCase() !== 'KES') {
      const err = new Error(`M-PESA only supports 'KES' currency. Provided: '${currency}'.`);
      err.code = 'INVALID_CURRENCY';
      err.statusCode = 400;
      throw err;
    }

    // 3-6. Order fetch + ownership + idempotency + active-attempt guard + insert,
    // all inside one transaction holding a row lock on the order. The lock
    // serializes concurrent initiations for the same order, so the
    // check-then-insert below cannot race. Ownership is verified BEFORE any
    // duplicate/active attempt is returned, and the idempotency lookup is
    // scoped to this order and this provider: a key belonging to another
    // order, or to another provider's attempt, is a generic 409 conflict,
    // never the other attempt row. The lookup runs before the
    // ORDER_ALREADY_PAID check so a client retrying its original request
    // after the order was paid can still recover its attempt.
    const pool = getPool();
    const client = await pool.connect();
    let order;
    let attempt;
    let isDuplicate = false;
    let authoritativeAmount;
    let formattedPhone;
    try {
      await client.query('BEGIN');

      // 3. Fetch authoritative order, locked for the duration of this txn.
      const orderRes = await client.query(
        `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1 FOR UPDATE`,
        [orderId]
      );
      if (orderRes.rows.length === 0) {
        const err = new Error(`Order '${orderId}' not found.`);
        err.code = 'ORDER_NOT_FOUND';
        err.statusCode = 404;
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
        err.code = 'ORDER_CANCELLED';
        err.statusCode = 400;
        throw err;
      }

      if (order.status === 'EXPIRED') {
        const err = new Error('Cannot initiate payment for an expired order.');
        err.code = 'ORDER_EXPIRED';
        err.statusCode = 400;
        throw err;
      }

      // 5a. Idempotency verification, scoped to this order AND this
      // provider, resolved BEFORE the terminal payment-state check below:
      // if a callback already marked the order paid, a client retrying its
      // original request (e.g. because the first response was lost) must
      // recover the existing attempt instead of hitting ORDER_ALREADY_PAID.
      // A prior attempt is only a replay when it belongs to THIS order and
      // was created through THIS provider; a key already used for a
      // different order, or for a different provider's attempt (e.g. a DEMO
      // attempt), is a conflict, and the row is never returned.
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
          err.code = 'ORDER_ALREADY_PAID';
          err.statusCode = 400;
          throw err;
        }

        // 4. Authoritative amount check: client cannot underpay or tamper with order total
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

        formattedPhone = DarajaClient.formatPhoneNumber(phone || order.phone);
        if (!formattedPhone || formattedPhone.length !== 12) {
          const err = new Error(`A valid Kenyan phone number (254XXXXXXXXX) is required for M-PESA STK Push. Received: '${phone}'.`);
          err.code = 'INVALID_PHONE_NUMBER';
          err.statusCode = 400;
          throw err;
        }
      }

      // 5b. Active-attempt guard: a PENDING (push dispatched, awaiting PIN)
      // or in-flight INITIATED attempt for this order, created through THIS
      // provider, is returned instead of dispatching a second STK push.
      // Attempts from another provider (e.g. a pending DEMO attempt) must
      // NOT block a Daraja initiation: returning one would hand the client
      // a demo checkout ID and no STK push would ever be dispatched. This
      // also covers keyless retries and concurrent requests using different
      // keys, which the idempotency key alone cannot catch.
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
            // Orphaned INITIATED row: its creator crashed before dispatching.
            // Mark it failed so this retry can proceed; the admin
            // expire-stale job would otherwise clean it up within 30 min.
            await client.query(
              `UPDATE payment_attempts
               SET status = 'FAILED',
                   failure_reason = 'Superseded: stale initiated attempt with no dispatched STK push',
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [active.id]
            );
          } else {
            // Dispatch genuinely in flight: return it, do not double-push.
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
        try {
          const insertRes = await client.query(
            `INSERT INTO payment_attempts (
              order_id, provider, payment_rail, amount, currency, status, idempotency_key, phone_number, metadata
            ) VALUES ($1, $2, $3, $4, 'KES', 'INITIATED', $5, $6, $7)
            RETURNING *`,
            [
              order.id,
              this.name,
              'Safaricom M-PESA Express (STK Push)',
              authoritativeAmount,
              idempotencyKey || null,
              formattedPhone,
              JSON.stringify({
                environment: this.environment,
                initiatedAt: new Date().toISOString(),
                customerOrderNumber: order.order_number
              })
            ]
          );
          attempt = insertRes.rows[0];
        } catch (insertErr) {
          if (insertErr.code === '23505' && idempotencyKey) {
            await client.query('ROLLBACK').catch(() => {});
            // Same-provider winner only: a DEMO attempt sharing this key
            // and order would also violate the (order_id, idempotency_key)
            // unique constraint, but returning it would hand the Daraja
            // client a demo checkout ID with no STK push dispatched.
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

    // Replay / active-attempt return: no second STK push is dispatched.
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

    // 7. Dispatch STK Push via DarajaClient
    let stkResult;
    try {
      stkResult = await this.darajaClient.initiateStkPush({
        phone: formattedPhone,
        amount: authoritativeAmount,
        accountReference: order.order_number,
        transactionDesc: `EyeKart Order ${order.order_number}`
      });
    } catch (pushErr) {
      // Record failure on attempt
      await query(
        `UPDATE payment_attempts
         SET status = 'FAILED', failure_reason = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [pushErr.message, attempt.id]
      );
      throw pushErr;
    }

    // 8. Update payment attempt with checkout identifiers & transition to PENDING
    const updatedRes = await query(
      `UPDATE payment_attempts
       SET status = 'PENDING',
           checkout_request_id = $1,
           merchant_request_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [stkResult.checkoutRequestId, stkResult.merchantRequestId, attempt.id]
    );
    const updatedAttempt = updatedRes.rows[0];

    // Update order status to PAYMENT_PENDING
    await query(
      `UPDATE orders SET status = 'PAYMENT_PENDING', payment_status = 'INITIATED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [order.id]
    );

    // Audit log
    await logAuditEvent({
      actorId: actorId || order.user_id,
      actorRole: 'CUSTOMER',
      ipAddress,
      action: 'MPESA_STK_PUSH_DISPATCHED',
      entity: 'Order',
      entityId: order.id,
      metadata: {
        attemptId: updatedAttempt.id,
        checkoutRequestId: stkResult.checkoutRequestId,
        merchantRequestId: stkResult.merchantRequestId,
        amount: authoritativeAmount,
        environment: this.environment
      }
    });

    return {
      success: true,
      provider: this.name,
      environment: this.environment,
      checkoutRequestId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId,
      customerMessage: stkResult.customerMessage || 'Please check your phone and enter your M-PESA PIN.',
      attempt: updatedAttempt
    };
  }

  /**
   * Query status of STK Push via Daraja query API
   */
  async queryPayment({ checkoutRequestId }) {
    if (!this.darajaClient.isConfigured && !this.darajaClient.mockTransport) {
      const err = new Error('Daraja is disabled.');
      err.code = 'PROVIDER_DISABLED';
      err.statusCode = 503;
      throw err;
    }

    const queryResult = await this.darajaClient.queryStkPush({ checkoutRequestId });
    return this.normalizeProviderResponse(queryResult);
  }

  /**
   * Normalize provider raw responses (query or callback) into a canonical structure
   */
  normalizeProviderResponse(raw) {
    if (!raw) return { success: false, status: PAYMENT_STATES.FAILED };

    // Standard STK query response format
    const resultCode = raw.ResultCode !== undefined ? Number(raw.ResultCode) : (raw.resultCode !== undefined ? Number(raw.resultCode) : null);
    const resultDesc = raw.ResultDesc || raw.resultDesc || raw.ResponseDescription || '';
    const checkoutRequestId = raw.CheckoutRequestID || raw.checkoutRequestId;
    const merchantRequestId = raw.MerchantRequestID || raw.merchantRequestId;

    let receiptNumber = null;
    let amount = null;
    let phone = null;
    let transactionDate = null;

    // Parse CallbackMetadata if present
    if (raw.CallbackMetadata && Array.isArray(raw.CallbackMetadata.Item)) {
      for (const item of raw.CallbackMetadata.Item) {
        if (item.Name === 'MpesaReceiptNumber') receiptNumber = String(item.Value);
        if (item.Name === 'Amount') amount = Number(item.Value);
        if (item.Name === 'PhoneNumber') phone = String(item.Value);
        if (item.Name === 'TransactionDate') transactionDate = String(item.Value);
      }
    }

    const isSuccess = resultCode === 0;
    return {
      success: isSuccess,
      status: isSuccess ? PAYMENT_STATES.SUCCESS : PAYMENT_STATES.FAILED,
      resultCode,
      resultDesc,
      checkoutRequestId,
      merchantRequestId,
      receiptNumber,
      amount,
      phone,
      transactionDate,
      raw
    };
  }

  async verifyPayment({ attemptId }) {
    const res = await query(`SELECT * FROM payment_attempts WHERE id = $1`, [attemptId]);
    if (res.rows.length === 0) {
      const err = new Error('Payment attempt not found.');
      err.statusCode = 404;
      throw err;
    }
    const attempt = res.rows[0];

    if (attempt.status === PAYMENT_STATES.SUCCESS) {
      return { success: true, status: PAYMENT_STATES.SUCCESS, attempt };
    }

    if (attempt.checkout_request_id) {
      return this.queryPayment({ checkoutRequestId: attempt.checkout_request_id });
    }

    return { success: false, status: attempt.status, attempt };
  }
}

module.exports = MpesaDarajaProvider;
