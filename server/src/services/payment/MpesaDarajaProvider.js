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
const { query } = require('../../db/pool');
const { logAuditEvent } = require('../auditService');

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

    // 3. Idempotency verification
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

    // 4. Fetch authoritative order from database
    const orderRes = await query(`SELECT * FROM orders WHERE id::text = $1 OR order_number = $1`, [orderId]);
    if (orderRes.rows.length === 0) {
      const err = new Error(`Order '${orderId}' not found.`);
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    const order = orderRes.rows[0];

    // Ownership check: Customer cannot pay for another customer's order
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

    if (order.payment_status === 'SUCCESS') {
      const err = new Error('Order is already fully paid.');
      err.code = 'ORDER_ALREADY_PAID';
      err.statusCode = 400;
      throw err;
    }

    // 5. Authoritative amount check: Client cannot underpay or tamper with order total
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

    const formattedPhone = DarajaClient.formatPhoneNumber(phone || order.phone);
    if (!formattedPhone || formattedPhone.length !== 12) {
      const err = new Error(`A valid Kenyan phone number (254XXXXXXXXX) is required for M-PESA STK Push. Received: '${phone}'.`);
      err.code = 'INVALID_PHONE_NUMBER';
      err.statusCode = 400;
      throw err;
    }

    // 6. Record payment attempt with INITIATED status
    const insertRes = await query(
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
    const attempt = insertRes.rows[0];

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
