/**
 * EyeKart Phase 4 Payment Management Service
 * Provides payment status queries with IDOR protection,
 * and automated expiration cleanup for stale pending payments.
 */
const { query, getClient } = require('../../db/pool');
const { logAuditEvent } = require('../auditService');
const { releaseStock } = require('../inventoryService');
const { PAYMENT_STATES } = require('./PaymentProvider');

/**
 * Retrieve status of a payment attempt with IDOR access control
 */
async function getPaymentStatus({ attemptId, userId, userRole }) {
  if (!attemptId) {
    const err = new Error('attemptId is required.');
    err.statusCode = 400;
    err.code = 'MISSING_ATTEMPT_ID';
    throw err;
  }

  const res = await query(
    `SELECT pa.*, o.user_id as order_user_id, o.order_number, o.status as order_status, o.payment_status as order_payment_status
     FROM payment_attempts pa
     JOIN orders o ON pa.order_id = o.id
     WHERE pa.id = $1`,
    [attemptId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Payment attempt not found.');
    err.statusCode = 404;
    err.code = 'PAYMENT_NOT_FOUND';
    throw err;
  }

  const attempt = res.rows[0];

  // IDOR check: Only owner of the order or ADMIN can query status
  if (userId && attempt.order_user_id !== userId && userRole !== 'ADMIN') {
    const err = new Error('Access denied. You cannot view payment details for another user.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_PAYMENT_ACCESS';
    throw err;
  }

  return {
    id: attempt.id,
    orderId: attempt.order_id,
    orderNumber: attempt.order_number,
    provider: attempt.provider,
    paymentRail: attempt.payment_rail,
    amount: Number(attempt.amount),
    currency: attempt.currency,
    status: attempt.status,
    transactionRef: attempt.transaction_ref || attempt.mpesa_receipt_number,
    mpesaReceiptNumber: attempt.mpesa_receipt_number,
    checkoutRequestId: attempt.checkout_request_id,
    failureReason: attempt.failure_reason,
    orderStatus: attempt.order_status,
    orderPaymentStatus: attempt.order_payment_status,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at
  };
}

/**
 * Expire pending payment attempts older than TTL minutes
 * @param {number} [ttlMinutes=30]
 */
async function expirePendingPayments(ttlMinutes = 30) {
  const client = await getClient();
  const expiredAttempts = [];

  try {
    await client.query('BEGIN');

    // Find pending attempts older than threshold
    const findRes = await client.query(
      `SELECT pa.id, pa.order_id, o.user_id as order_user_id, o.order_number
       FROM payment_attempts pa
       JOIN orders o ON pa.order_id = o.id
       WHERE pa.status IN ('INITIATED', 'PENDING')
         AND pa.created_at < NOW() - ($1 || ' minutes')::interval
       FOR UPDATE OF pa`,
      [ttlMinutes]
    );

    for (const row of findRes.rows) {
      await client.query(
        `UPDATE payment_attempts
         SET status = 'EXPIRED',
             failure_reason = 'Payment attempt timed out / expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [row.id]
      );

      // Check if there are other pending attempts for this order
      const remainingPending = await client.query(
        `SELECT id FROM payment_attempts
         WHERE order_id = $1 AND status IN ('INITIATED', 'PENDING') AND id != $2`,
        [row.order_id, row.id]
      );

      if (remainingPending.rows.length === 0) {
        await client.query(
          `UPDATE orders
           SET payment_status = 'EXPIRED',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND payment_status IN ('INITIATED', 'PENDING')`,
          [row.order_id]
        );

        // Release reserved stock
        try {
          await releaseStock({
            orderId: row.order_id,
            actorId: row.order_user_id
          });
        } catch (stockErr) {
          console.error(`[expirePendingPayments] Error releasing stock for order ${row.order_id}:`, stockErr.message);
        }
      }

      await logAuditEvent({
        actorId: row.order_user_id,
        actorRole: 'SYSTEM',
        action: 'PAYMENT_EXPIRED',
        entity: 'Order',
        entityId: row.order_id,
        metadata: { attemptId: row.id, ttlMinutes }
      });

      expiredAttempts.push(row.id);
    }

    await client.query('COMMIT');
    return {
      expiredCount: expiredAttempts.length,
      expiredAttemptIds: expiredAttempts
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getPaymentStatus,
  expirePendingPayments
};
