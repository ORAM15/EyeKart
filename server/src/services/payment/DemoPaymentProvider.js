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
    // 1. Check idempotency for duplicate attempt
    if (idempotencyKey) {
      const existing = await query(
        `SELECT * FROM payment_attempts WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return {
          isDuplicate: true,
          attempt: existing.rows[0],
          checkoutRequestId: existing.rows[0].checkout_request_id,
          status: existing.rows[0].status
        };
      }
    }

    // 2. Fetch authoritative order
    const orderRes = await query(`SELECT * FROM orders WHERE id::text = $1 OR order_number = $1`, [orderId]);
    if (orderRes.rows.length === 0) {
      const err = new Error(`Order '${orderId}' not found.`);
      err.statusCode = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }
    const order = orderRes.rows[0];

    // Ownership check: IDOR protection
    if (actorId && order.user_id !== actorId && actorRole !== 'ADMIN') {
      const err = new Error('Access denied. You can only initiate payment for your own orders.');
      err.code = 'FORBIDDEN_ORDER_ACCESS';
      err.statusCode = 403;
      throw err;
    }

    // Order status checks
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

    if (order.payment_status === 'SUCCESS') {
      const err = new Error('Order is already fully paid.');
      err.statusCode = 400;
      err.code = 'ORDER_ALREADY_PAID';
      throw err;
    }

    // Strict currency check: M-PESA only transacts in KES
    if (currency && currency.toUpperCase() !== 'KES') {
      const err = new Error(`M-PESA only supports 'KES' currency. Provided: '${currency}'.`);
      err.code = 'INVALID_CURRENCY';
      err.statusCode = 400;
      throw err;
    }

    // 3. Server-authoritative amount check: Client cannot tamper with order total
    const authoritativeAmount = Number(order.total);
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
    const formattedPhone = DarajaClient.formatPhoneNumber(phone || order.phone);

    // 4. Generate demo checkout identifiers
    const checkoutRequestId = `ws_CO_DEMO_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}`;
    const merchantRequestId = `mr_DEMO_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Create payment attempt record with status INITIATED
    const insertRes = await query(
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
    const attempt = insertRes.rows[0];

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
      metadata: { attemptId: attempt.id, amount: authoritativeAmount, provider: 'DEMO', checkoutRequestId }
    });

    // 6. Transition to PENDING state (STK push prompt on handset)
    const pendingAttempt = await this.transitionAttempt(attempt.id, PAYMENT_STATES.PENDING, {
      actorId,
      ipAddress
    });

    return {
      success: true,
      provider: 'DEMO',
      isDemo: true,
      status: PAYMENT_STATES.PENDING,
      checkoutRequestId,
      merchantRequestId,
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
           WHERE id = $1`,
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
           WHERE id = $2`,
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
