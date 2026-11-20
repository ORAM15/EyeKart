/**
 * EyeKart Phase 6.6 Webhook Ingress Engine
 * Processes asynchronous payment webhooks with atomic row locking,
 * replay attack protection, amount/currency tamper verification, and idempotency guarantees.
 */
const { query, getClient } = require('../db/pool');
const { logAuditEvent } = require('./auditService');
const { PAYMENT_STATES } = require('./payment/PaymentProvider');
const notificationService = require('./notification/notificationService');
const { allocateStock, releaseStock } = require('./inventoryService');

const MAX_WEBHOOK_AGE_SECONDS = 300; // 5 minutes

class WebhookService {
  /**
   * Parse standard Safaricom Daraja STK Push callback payload
   */
  static parseDarajaCallback(body) {
    const stk = body?.Body?.stkCallback || body?.stkCallback || body;
    if (!stk) {
      throw new Error('Invalid Daraja webhook payload: missing stkCallback structure.');
    }

    const merchantRequestId = stk.MerchantRequestID;
    const checkoutRequestId = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode !== undefined ? Number(stk.ResultCode) : null;
    const resultDesc = stk.ResultDesc || '';

    let amount = null;
    let mpesaReceiptNumber = null;
    let transactionDate = null;
    let phoneNumber = null;

    if (stk.CallbackMetadata && Array.isArray(stk.CallbackMetadata.Item)) {
      for (const item of stk.CallbackMetadata.Item) {
        if (item.Name === 'Amount') amount = Number(item.Value);
        if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = String(item.Value).trim();
        if (item.Name === 'TransactionDate') transactionDate = String(item.Value);
        if (item.Name === 'PhoneNumber') phoneNumber = String(item.Value);
      }
    }

    return {
      merchantRequestId,
      checkoutRequestId,
      resultCode,
      resultDesc,
      amount,
      mpesaReceiptNumber,
      transactionDate,
      phoneNumber,
      raw: body
    };
  }

  /**
   * Parse TransactionDate string (YYYYMMDDHHmmss) to Date object
   */
  static parseTransactionDate(dateStr) {
    if (!dateStr || dateStr.length < 14) return null;
    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10) - 1;
    const day = parseInt(dateStr.slice(6, 8), 10);
    const hour = parseInt(dateStr.slice(8, 10), 10);
    const minute = parseInt(dateStr.slice(10, 12), 10);
    const second = parseInt(dateStr.slice(12, 14), 10);
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  /**
   * Process Safaricom Daraja STK callback inside an atomic transaction
   */
  async processMpesaCallback(rawPayload, { headers = {}, ip = null } = {}) {
    const callback = WebhookService.parseDarajaCallback(rawPayload);

    if (!callback.checkoutRequestId) {
      const err = new Error('Missing CheckoutRequestID in Daraja callback payload.');
      err.statusCode = 400;
      err.code = 'INVALID_WEBHOOK_PAYLOAD';
      throw err;
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Lock payment_attempt and join order details
      const attemptRes = await client.query(
        `SELECT pa.*,
                o.id AS authoritative_order_id,
                o.order_number,
                o.total AS order_total,
                o.currency AS order_currency,
                o.status AS order_status,
                o.payment_status AS order_payment_status,
                o.requires_prescription_review,
                o.user_id AS order_user_id
         FROM payment_attempts pa
         JOIN orders o ON pa.order_id = o.id
         WHERE pa.checkout_request_id = $1
         FOR UPDATE OF pa`,
        [callback.checkoutRequestId]
      );

      if (attemptRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          processed: false,
          status: 'NOT_FOUND',
          message: `Payment attempt with checkoutRequestId '${callback.checkoutRequestId}' not found.`,
          httpStatus: 404
        };
      }

      const attempt = attemptRes.rows[0];

      // 2. Idempotency Check: Terminal or duplicate receipt verification
      if (attempt.status === PAYMENT_STATES.SUCCESS) {
        await client.query('COMMIT');
        return {
          processed: true,
          duplicate: true,
          status: 'SUCCESS',
          message: 'Payment attempt was already processed and verified as SUCCESS.',
          httpStatus: 200
        };
      }

      if (attempt.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return {
          processed: false,
          status: 'CANCELLED',
          message: 'Payment attempt was already cancelled. Callback rejected.',
          httpStatus: 200
        };
      }

      if (attempt.status === 'EXPIRED') {
        await client.query('ROLLBACK');
        return {
          processed: false,
          status: 'EXPIRED',
          message: 'Payment attempt expired. Callback rejected.',
          httpStatus: 200
        };
      }

      if (attempt.order_status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return {
          processed: false,
          status: 'ORDER_CANCELLED',
          message: 'Associated order was cancelled. Payment callback rejected.',
          httpStatus: 200
        };
      }

      if (attempt.order_status === 'EXPIRED') {
        await client.query('ROLLBACK');
        return {
          processed: false,
          status: 'ORDER_EXPIRED',
          message: 'Associated order expired. Payment callback rejected.',
          httpStatus: 200
        };
      }

      // Check if mpesaReceiptNumber was already used on another attempt
      if (callback.mpesaReceiptNumber) {
        const dupRes = await client.query(
          `SELECT id, order_id FROM payment_attempts WHERE mpesa_receipt_number = $1 AND id != $2`,
          [callback.mpesaReceiptNumber, attempt.id]
        );
        if (dupRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            processed: false,
            duplicate: true,
            status: 'DUPLICATE_RECEIPT',
            message: `MpesaReceiptNumber '${callback.mpesaReceiptNumber}' was already recorded on attempt ${dupRes.rows[0].id}.`,
            httpStatus: 200
          };
        }
      }

      // 3. Replay attack inspection: callbacks older than the threshold are
      // rejected outright, never processed (a replayed success callback
      // must not be able to mark an order paid).
      if (callback.transactionDate) {
        const txDate = WebhookService.parseTransactionDate(callback.transactionDate);
        if (txDate) {
          const ageSeconds = (Date.now() - txDate.getTime()) / 1000;
          if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) {
            console.error(`[Webhook Ingress] SECURITY ALERT: Stale webhook callback rejected. Transaction age is ${ageSeconds.toFixed(1)}s (exceeds ${MAX_WEBHOOK_AGE_SECONDS}s threshold). CheckoutRequestID: ${callback.checkoutRequestId}`);
            await client.query('ROLLBACK');
            return {
              processed: false,
              success: false,
              status: 'STALE_CALLBACK',
              reason: 'STALE_CALLBACK',
              resultCode: 1,
              httpStatus: 200
            };
          }
        }
      }

      // 4. Handle ResultCode
      if (callback.resultCode === 0) {
        // SUCCESS PATH: Tamper Verification
        const orderTotal = Number(attempt.order_total);
        const parsedAmount = callback.amount !== null && callback.amount !== undefined ? Number(callback.amount) : NaN;
        const callbackAmount = Number.isNaN(parsedAmount) ? null : parsedAmount;

        // Anti-Tampering Check: a missing amount must never be replaced with
        // the order total (that would make this check vacuous), and a missing
        // receipt must never be replaced with a fabricated one. Any of these
        // on a success callback is treated as tampering: the attempt is
        // marked FAILED and the order is NOT marked SUCCESS.
        let tamperReason = null;
        if (callbackAmount === null) {
          tamperReason = 'MISSING_AMOUNT';
        } else if (Math.abs(callbackAmount - orderTotal) > 0.01) {
          tamperReason = 'AMOUNT_MISMATCH';
        } else if (!callback.mpesaReceiptNumber) {
          tamperReason = 'MISSING_RECEIPT';
        }

        if (tamperReason) {
          const tamperDetail = tamperReason === 'MISSING_AMOUNT'
            ? `MISSING_AMOUNT: Success callback carried no Amount. Authoritative KES ${orderTotal}`
            : tamperReason === 'MISSING_RECEIPT'
              ? `MISSING_RECEIPT: Success callback carried no MpesaReceiptNumber. Authoritative KES ${orderTotal}, Received KES ${callbackAmount}`
              : `AMOUNT_MISMATCH: Authoritative KES ${orderTotal}, Received KES ${callbackAmount}`;
          console.error(`[Webhook Ingress] SECURITY ALERT: ${tamperDetail}`);

          await client.query(
            `UPDATE payment_attempts
             SET status = 'FAILED',
                 failure_reason = $1,
                 callback_received_at = CURRENT_TIMESTAMP,
                 metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{tamper_alert}', $2::jsonb),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [
              tamperDetail,
              JSON.stringify({ reason: tamperReason, expected: orderTotal, received: callbackAmount, rawCallback: callback }),
              attempt.id
            ]
          );

          await client.query(
            `UPDATE orders
             SET payment_status = 'FAILED',
                 status = 'PAYMENT_PENDING',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [attempt.authoritative_order_id]
          );

          await client.query('COMMIT');

          await logAuditEvent({
            actorId: attempt.order_user_id,
            actorRole: 'SYSTEM',
            ipAddress: ip,
            action: 'SECURITY_ALERT_PAYMENT_TAMPERING',
            entity: 'Order',
            entityId: attempt.authoritative_order_id,
            metadata: {
              attemptId: attempt.id,
              reason: tamperReason,
              orderTotal,
              callbackAmount,
              checkoutRequestId: callback.checkoutRequestId
            }
          });

          return {
            processed: true,
            success: false,
            status: 'FAILED',
            reason: tamperReason,
            resultCode: 1,
            httpStatus: 200
          };
        }

        // Advance payment_attempt to SUCCESS
        await client.query(
          `UPDATE payment_attempts
           SET status = 'SUCCESS',
               mpesa_receipt_number = $1,
               transaction_ref = $1,
               phone_number = COALESCE($2, phone_number),
               callback_received_at = CURRENT_TIMESTAMP,
               metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{callback}', $3::jsonb),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [
            callback.mpesaReceiptNumber,
            callback.phoneNumber,
            JSON.stringify(callback.raw),
            attempt.id
          ]
        );

        // Advance order status: PAID or PROCESSING (if optical review required)
        const nextOrderStatus = attempt.requires_prescription_review ? 'PROCESSING' : 'PAID';
        await client.query(
          `UPDATE orders
           SET status = $1,
               payment_status = 'SUCCESS',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [nextOrderStatus, attempt.authoritative_order_id]
        );

        await client.query('COMMIT');

        // Allocate physical inventory from reserved stock (idempotent row-locked operation)
        try {
          await allocateStock({
            orderId: attempt.authoritative_order_id,
            actorId: attempt.order_user_id,
            ipAddress: ip
          });
        } catch (allocErr) {
          console.error('[Webhook Ingress] Error allocating stock on payment success:', allocErr.message);
        }

        // Audit Event
        await logAuditEvent({
          actorId: attempt.order_user_id,
          actorRole: 'SYSTEM',
          ipAddress: ip,
          action: 'PAYMENT_SUCCEEDED',
          entity: 'Order',
          entityId: attempt.authoritative_order_id,
          metadata: {
            attemptId: attempt.id,
            receiptNumber: callback.mpesaReceiptNumber,
            amount: callbackAmount,
            provider: 'MPESA_DARAJA',
            checkoutRequestId: callback.checkoutRequestId
          }
        });

        // Trigger asynchronous notification (safe catch)
        notificationService.notifyPaymentSuccess({
          order: {
            id: attempt.authoritative_order_id,
            order_number: attempt.order_number,
            phone: callback.phoneNumber || attempt.phone_number,
            total: orderTotal
          },
          receiptNumber: callback.mpesaReceiptNumber,
          amount: callbackAmount
        }).catch(notifErr => {
          console.warn('[Webhook Ingress] Notification dispatch warning:', notifErr.message);
        });

        return {
          processed: true,
          success: true,
          status: 'SUCCESS',
          receiptNumber: callback.mpesaReceiptNumber,
          orderStatus: nextOrderStatus,
          orderId: attempt.authoritative_order_id,
          httpStatus: 200
        };
      } else {
        // FAILURE PATH: User cancelled or system error
        const targetStatus = callback.resultCode === 1032 ? PAYMENT_STATES.CANCELLED
                           : callback.resultCode === 1037 ? PAYMENT_STATES.EXPIRED
                           : PAYMENT_STATES.FAILED;

        await client.query(
          `UPDATE payment_attempts
           SET status = $1,
               failure_reason = $2,
               callback_received_at = CURRENT_TIMESTAMP,
               metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{callback}', $3::jsonb),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [targetStatus, callback.resultDesc || `M-PESA Error (ResultCode: ${callback.resultCode})`, JSON.stringify(callback.raw), attempt.id]
        );

        await client.query(
          `UPDATE orders
           SET payment_status = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND payment_status != 'SUCCESS'`,
          [targetStatus === PAYMENT_STATES.CANCELLED ? 'CANCELLED' : 'FAILED', attempt.authoritative_order_id]
        );

        await client.query('COMMIT');

        // Release reserved stock if payment was cancelled or expired
        if (targetStatus === PAYMENT_STATES.CANCELLED || targetStatus === PAYMENT_STATES.EXPIRED) {
          try {
            await releaseStock({
              orderId: attempt.authoritative_order_id,
              actorId: attempt.order_user_id,
              ipAddress: ip
            });
          } catch (relErr) {
            console.warn('[Webhook Ingress] Warning: Failed to release stock on payment cancel/expiry:', relErr.message);
          }
        }

        await logAuditEvent({
          actorId: attempt.order_user_id,
          actorRole: 'SYSTEM',
          ipAddress: ip,
          action: targetStatus === PAYMENT_STATES.CANCELLED ? 'PAYMENT_CANCELLED' : targetStatus === PAYMENT_STATES.EXPIRED ? 'PAYMENT_EXPIRED' : 'PAYMENT_FAILED',
          entity: 'Order',
          entityId: attempt.authoritative_order_id,
          metadata: {
            attemptId: attempt.id,
            resultCode: callback.resultCode,
            targetStatus,
            failureReason: callback.resultDesc,
            checkoutRequestId: callback.checkoutRequestId
          }
        });

        // Trigger payment failure or expiration notification
        const recipientPhone = callback.phoneNumber || attempt.phone_number;
        if (recipientPhone) {
          notificationService.sendTransactionalNotification({
            userId: attempt.order_user_id,
            recipient: recipientPhone,
            channel: 'SMS',
            templateId: targetStatus === PAYMENT_STATES.EXPIRED ? 'PAYMENT_EXPIRED' : 'PAYMENT_FAILED',
            payload: {
              orderNumber: attempt.order_number,
              reason: callback.resultDesc || 'Payment was not completed'
            },
            resourceId: attempt.id
          }).catch(err => console.warn('[Webhook Ingress] Failure notification warning:', err.message));
        }

        return {
          processed: true,
          success: false,
          status: targetStatus,
          resultCode: callback.resultCode,
          resultDesc: callback.resultDesc,
          httpStatus: 200
        };
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

const instance = new WebhookService();
instance.WebhookService = WebhookService;
module.exports = instance;
