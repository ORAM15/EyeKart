/**
 * EyeKart Phase 6.2 Demo Payment Provider
 * Provides deterministic simulation of Safaricom M-PESA STK Push.
 * Clearly designated as DEMO PAYMENT — never contacts live external gateways.
 */
const { PaymentProvider, PAYMENT_STATES, isValidPaymentTransition } = require('./PaymentProvider');
const { query } = require('../../db/pool');
const { logAuditEvent } = require('../auditService');

class DemoPaymentProvider extends PaymentProvider {
  constructor() {
    super('DEMO');
  }

  /**
   * Initiate a deterministic demo payment attempt
   */
  async initiatePayment({ orderId, phone, amount, currency = 'KES', idempotencyKey = null, simulateOutcome = null, actorId = null, ipAddress = null }) {
    // 1. Check idempotency for duplicate attempt
    if (idempotencyKey) {
      const existing = await query(
        `SELECT * FROM payment_attempts WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return {
          isDuplicate: true,
          attempt: existing.rows[0]
        };
      }
    }

    // 2. Fetch order
    const orderRes = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    if (orderRes.rows.length === 0) {
      const err = new Error(`Order '${orderId}' not found.`);
      err.statusCode = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }
    const order = orderRes.rows[0];

    // Ensure order is not cancelled
    if (order.status === 'CANCELLED') {
      const err = new Error('Cannot initiate payment for a cancelled order.');
      err.statusCode = 400;
      err.code = 'ORDER_CANCELLED';
      throw err;
    }

    // 3. Create payment attempt record with status INITIATED
    const insertRes = await query(
      `INSERT INTO payment_attempts (order_id, provider, payment_rail, amount, currency, status, idempotency_key, metadata)
       VALUES ($1, 'DEMO', 'Safaricom Daraja 2.0 (Demo Rail)', $2, $3, 'INITIATED', $4, $5)
       RETURNING *`,
      [
        orderId,
        amount || order.total,
        currency,
        idempotencyKey || null,
        JSON.stringify({ phone, isDemo: true, simulationNote: 'Strictly simulated payment attempt' })
      ]
    );
    const attempt = insertRes.rows[0];

    // Update order status to PAYMENT_PENDING
    await query(
      `UPDATE orders SET status = 'PAYMENT_PENDING', payment_status = 'INITIATED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [orderId]
    );

    await logAuditEvent({
      actorId: actorId || order.user_id,
      actorRole: 'CUSTOMER',
      ipAddress,
      action: 'PAYMENT_INITIATED',
      entity: 'Order',
      entityId: orderId,
      metadata: { attemptId: attempt.id, amount: attempt.amount, provider: 'DEMO' }
    });

    // 4. Transition to PENDING state
    await this.transitionAttempt(attempt.id, PAYMENT_STATES.PENDING, { actorId, ipAddress });

    // 5. Resolve outcome deterministically
    const cleanPhone = String(phone || '').trim();
    const shouldFail = simulateOutcome === 'FAIL' || cleanPhone.endsWith('999') || cleanPhone === '0700000000';

    if (shouldFail) {
      return this.transitionAttempt(attempt.id, PAYMENT_STATES.FAILED, {
        failureReason: 'Customer cancelled PIN prompt or handset timeout (Simulated)',
        actorId,
        ipAddress
      });
    } else {
      const txRef = 'QHK' + Math.floor(100000 + Math.random() * 900000) + 'MP';
      return this.transitionAttempt(attempt.id, PAYMENT_STATES.SUCCESS, {
        transactionRef: txRef,
        actorId,
        ipAddress
      });
    }
  }

  /**
   * Transition payment attempt state with strict state machine validation
   */
  async transitionAttempt(attemptId, targetState, { transactionRef = null, failureReason = null, actorId = null, ipAddress = null } = {}) {
    const res = await query(`SELECT * FROM payment_attempts WHERE id = $1`, [attemptId]);
    if (res.rows.length === 0) {
      const err = new Error('Payment attempt not found.');
      err.statusCode = 404;
      throw err;
    }
    const currentAttempt = res.rows[0];

    // Legal transition check
    if (!isValidPaymentTransition(currentAttempt.status, targetState)) {
      const err = new Error(`Illegal payment state transition from '${currentAttempt.status}' to '${targetState}'.`);
      err.statusCode = 400;
      err.code = 'ILLEGAL_PAYMENT_STATE_TRANSITION';
      throw err;
    }

    const updatedRes = await query(
      `UPDATE payment_attempts 
       SET status = $1, transaction_ref = COALESCE($2, transaction_ref), failure_reason = COALESCE($3, failure_reason), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [targetState, transactionRef, failureReason, attemptId]
    );
    const updatedAttempt = updatedRes.rows[0];

    // Synchronize Order status
    if (targetState === PAYMENT_STATES.SUCCESS) {
      await query(
        `UPDATE orders 
         SET status = CASE WHEN requires_prescription_review THEN 'PROCESSING' ELSE 'PAID' END,
             payment_status = 'SUCCESS',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [currentAttempt.order_id]
      );

      await logAuditEvent({
        actorId,
        actorRole: 'SYSTEM',
        ipAddress,
        action: 'PAYMENT_SUCCEEDED',
        entity: 'Order',
        entityId: currentAttempt.order_id,
        metadata: { attemptId, transactionRef, provider: 'DEMO' }
      });
    } else if (targetState === PAYMENT_STATES.FAILED) {
      await query(
        `UPDATE orders 
         SET payment_status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [currentAttempt.order_id]
      );

      await logAuditEvent({
        actorId,
        actorRole: 'SYSTEM',
        ipAddress,
        action: 'PAYMENT_FAILED',
        entity: 'Order',
        entityId: currentAttempt.order_id,
        metadata: { attemptId, failureReason, provider: 'DEMO' }
      });
    }

    return updatedAttempt;
  }
}

module.exports = DemoPaymentProvider;
