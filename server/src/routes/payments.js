/**
 * EyeKart Phase 6.2 Payment Routes
 * Exposes payment abstraction endpoints with DemoPaymentProvider implementation.
 * Clearly marked as DEMO PAYMENT — live Safaricom credentials deferred to Phase 6.2+.
 */
const DemoPaymentProvider = require('../services/payment/DemoPaymentProvider');
const MpesaDarajaProvider = require('../services/payment/MpesaDarajaProvider');
const { requireAuth } = require('../middleware/auth');
const demoProvider = new DemoPaymentProvider();
const darajaProvider = new MpesaDarajaProvider();

async function paymentRoutes(fastify, options) {
  // 1. POST /api/payments/demo/initiate - Initiate simulated STK push
  fastify.post('/api/payments/demo/initiate', { preHandler: requireAuth }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    const { orderId, phone, amount, currency, simulateOutcome } = req.body || {};

    if (!orderId) {
      return reply.status(400).send({
        success: false,
        error: 'Order ID is required to initiate payment.',
        code: 'MISSING_ORDER_ID'
      });
    }

    const result = await demoProvider.initiatePayment({
      orderId,
      phone: phone || req.user.phone || '+254 712 345 678',
      amount,
      currency: currency || 'KES',
      idempotencyKey,
      simulateOutcome,
      actorId: req.user.id,
      ipAddress: req.ip
    });

    const isSuccess = result.status === 'SUCCESS' || result.attempt?.status === 'SUCCESS';

    return reply.status(200).send({
      success: isSuccess,
      isDemo: true,
      provider: 'DEMO',
      paymentRail: 'Safaricom Daraja 2.0 (Demo Rail)',
      attempt: result.attempt || result,
      message: isSuccess 
        ? '[DEMO PAYMENT] Simulated M-PESA STK Push confirmed successfully.' 
        : '[DEMO PAYMENT] Simulated M-PESA STK Push was cancelled or failed.'
    });
  });

  // 2. POST /api/payments/demo/transition - Explicit state transition verification
  fastify.post('/api/payments/demo/transition', { preHandler: requireAuth }, async (req, reply) => {
    const { attemptId, targetState, transactionRef, failureReason } = req.body || {};

    if (!attemptId || !targetState) {
      return reply.status(400).send({
        success: false,
        error: 'attemptId and targetState are required.',
        code: 'MISSING_TRANSITION_PARAMS'
      });
    }

    const updated = await demoProvider.transitionAttempt(attemptId, targetState, {
      transactionRef,
      failureReason,
      actorId: req.user.id,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      payment: updated
    });
  });

  // 3. POST /api/payments/daraja/stkpush - Production Daraja STK Push endpoint
  fastify.post('/api/payments/daraja/stkpush', { preHandler: requireAuth }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    const { orderId, phone, amount, currency } = req.body || {};

    if (!orderId) {
      return reply.status(400).send({
        success: false,
        error: 'orderId is required.',
        code: 'MISSING_ORDER_ID'
      });
    }

    try {
      const result = await darajaProvider.initiatePayment({
        orderId,
        phone: phone || req.user.phone,
        amount,
        currency: currency || 'KES',
        idempotencyKey,
        actorId: req.user.id,
        actorRole: req.user.role,
        ipAddress: req.ip
      });

      return reply.status(200).send({
        success: true,
        provider: 'MPESA_DARAJA',
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        customerMessage: result.customerMessage,
        attempt: result.attempt
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'PAYMENT_ERROR'
      });
    }
  });

  // 4. POST /api/payments/daraja/query - Query Daraja STK status
  fastify.post('/api/payments/daraja/query', { preHandler: requireAuth }, async (req, reply) => {
    const { checkoutRequestId } = req.body || {};
    if (!checkoutRequestId) {
      return reply.status(400).send({
        success: false,
        error: 'checkoutRequestId is required.',
        code: 'MISSING_CHECKOUT_ID'
      });
    }

    try {
      const status = await darajaProvider.queryPayment({ checkoutRequestId });
      return reply.status(200).send({
        success: true,
        status
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'PAYMENT_QUERY_ERROR'
      });
    }
  });
}

module.exports = paymentRoutes;
