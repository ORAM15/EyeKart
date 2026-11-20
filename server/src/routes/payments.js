/**
 * EyeKart Phase 4 Payment Routes
 * Exposes server-authoritative payment initiation, status queries with IDOR protection,
 * and Safaricom Daraja STK Push integration.
 */
const { getPaymentProvider, demoInstance, darajaInstance } = require('../services/payment');
const { getPaymentStatus, expirePendingPayments } = require('../services/payment/paymentService');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/pool');

/**
 * Minimal attempt summary safe for API responses. The client only needs the
 * attempt id (to poll GET /api/payments/:attemptId/status) and the status.
 * Never expose phone_number, failure_reason, metadata, checkout identifiers
 * beyond the top-level fields, or the raw DB row.
 */
function summarizeAttempt(attempt) {
  if (!attempt) return null;
  return {
    attemptId: attempt.id,
    status: attempt.status
  };
}

async function paymentRoutes(fastify, options) {
  // 1. POST /api/payments/initiate - Unified payment initiation endpoint
  fastify.post('/api/payments/initiate', { preHandler: requireAuth }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    const { orderId, phone, provider, currency, amount } = req.body || {};

    if (!orderId) {
      return reply.status(400).send({
        success: false,
        error: 'Order ID is required to initiate payment.',
        code: 'MISSING_ORDER_ID'
      });
    }

    try {
      const selectedProvider = getPaymentProvider(provider);
      const result = await selectedProvider.initiatePayment({
        orderId,
        phone: phone || req.user.phone,
        amount, // Will be validated against authoritative DB order.total
        currency: currency || 'KES',
        idempotencyKey,
        actorId: req.user.id,
        actorRole: req.user.role,
        ipAddress: req.ip
      });

      return reply.status(200).send({
        success: true,
        provider: selectedProvider.name,
        environment: selectedProvider.environment,
        status: result.status || 'PENDING',
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        customerMessage: result.customerMessage || 'Payment initiated. Please check your phone.',
        isDuplicate: Boolean(result.isDuplicate),
        attempt: summarizeAttempt(result.attempt)
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'PAYMENT_INITIATION_FAILED'
      });
    }
  });

  // 2. GET /api/payments/:attemptId/status - Query payment attempt status with IDOR protection
  fastify.get('/api/payments/:attemptId/status', { preHandler: requireAuth }, async (req, reply) => {
    const { attemptId } = req.params;

    try {
      const status = await getPaymentStatus({
        attemptId,
        userId: req.user.id,
        userRole: req.user.role
      });

      return reply.status(200).send({
        success: true,
        payment: status
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'PAYMENT_STATUS_ERROR'
      });
    }
  });

  // 3. POST /api/payments/demo/initiate - Backward compatible demo initiation endpoint
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

    try {
      const result = await demoInstance.initiatePayment({
        orderId,
        phone: phone || req.user.phone || '+254712345678',
        amount,
        currency: currency || 'KES',
        idempotencyKey,
        simulateOutcome,
        actorId: req.user.id,
        actorRole: req.user.role,
        ipAddress: req.ip
      });

      return reply.status(200).send({
        success: true,
        isDemo: true,
        provider: 'DEMO',
        status: result.status,
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        customerMessage: result.customerMessage,
        isDuplicate: Boolean(result.isDuplicate),
        attempt: summarizeAttempt(result.attempt),
        message: '[DEMO PAYMENT] Simulated STK Push initiated. PIN confirmation pending.'
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'DEMO_PAYMENT_INITIATE_ERROR'
      });
    }
  });

  // 4. POST /api/payments/demo/confirm - Simulate user PIN entry confirmation in test/demo mode
  fastify.post('/api/payments/demo/confirm', { preHandler: requireAuth }, async (req, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({
        success: false,
        error: 'Demo payment confirmation is disabled in production environments.',
        code: 'FORBIDDEN_IN_PRODUCTION'
      });
    }

    const { attemptId, checkoutRequestId, outcome, failureReason } = req.body || {};

    if (!attemptId && !checkoutRequestId) {
      return reply.status(400).send({
        success: false,
        error: 'Either attemptId or checkoutRequestId is required.',
        code: 'MISSING_IDENTIFIER'
      });
    }

    try {
      const result = await demoInstance.confirmDemoPayment({
        attemptId,
        checkoutRequestId,
        outcome: outcome || 'SUCCESS',
        failureReason,
        actorId: req.user.id,
        ipAddress: req.ip
      });

      return reply.status(200).send({
        success: result.success,
        status: result.status,
        receiptNumber: result.receiptNumber,
        alreadyProcessed: Boolean(result.alreadyProcessed),
        attempt: summarizeAttempt(result.attempt)
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'DEMO_CONFIRMATION_ERROR'
      });
    }
  });

  // 5. POST /api/payments/demo/transition - Admin-only test endpoint for state transitions
  fastify.post('/api/payments/demo/transition', { preHandler: requireAuth }, async (req, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({
        success: false,
        error: 'Direct payment transitions are disabled in production environments.',
        code: 'FORBIDDEN_IN_PRODUCTION'
      });
    }

    // Role-based access control: Only ADMIN can manually trigger state transitions
    if (req.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: 'Access denied. Only administrators can perform manual payment transitions.',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }

    const { attemptId, targetState, transactionRef, failureReason } = req.body || {};

    if (!attemptId || !targetState) {
      return reply.status(400).send({
        success: false,
        error: 'attemptId and targetState are required.',
        code: 'MISSING_TRANSITION_PARAMS'
      });
    }

    try {
      const updated = await demoInstance.transitionAttempt(attemptId, targetState, {
        transactionRef,
        failureReason,
        actorId: req.user.id,
        ipAddress: req.ip
      });

      return reply.send({
        success: true,
        payment: {
          attemptId: updated.id,
          orderId: updated.order_id,
          status: updated.status
        }
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'TRANSITION_ERROR'
      });
    }
  });

  // 6. POST /api/payments/daraja/stkpush - Production Daraja STK Push endpoint
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
      const result = await darajaInstance.initiatePayment({
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
        status: 'PENDING',
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        customerMessage: result.customerMessage,
        isDuplicate: Boolean(result.isDuplicate),
        attempt: summarizeAttempt(result.attempt)
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'PAYMENT_ERROR'
      });
    }
  });

  // 7. POST /api/payments/daraja/query - Query Daraja STK status
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
      // Ownership check BEFORE calling Daraja: look up the attempt and its
      // order by checkoutRequestId and verify the caller owns the order.
      // 404 when no attempt matches; 403 when it belongs to another user —
      // the same pattern as GET /api/payments/:attemptId/status
      // (paymentService.getPaymentStatus: PAYMENT_NOT_FOUND /
      // FORBIDDEN_PAYMENT_ACCESS).
      const attemptRes = await query(
        `SELECT pa.id, pa.order_id, o.user_id AS order_user_id
         FROM payment_attempts pa
         JOIN orders o ON pa.order_id = o.id
         WHERE pa.checkout_request_id = $1`,
        [checkoutRequestId]
      );
      if (attemptRes.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'Payment attempt not found.',
          code: 'PAYMENT_NOT_FOUND'
        });
      }
      const attemptOwnerId = attemptRes.rows[0].order_user_id;
      if (attemptOwnerId !== req.user.id && req.user.role !== 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: 'Access denied. You cannot view payment details for another user.',
          code: 'FORBIDDEN_PAYMENT_ACCESS'
        });
      }

      const status = await darajaInstance.queryPayment({ checkoutRequestId });
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

  // 8. POST /api/payments/expire-stale - Expire pending payments older than TTL
  fastify.post('/api/payments/expire-stale', { preHandler: requireAuth }, async (req, reply) => {
    if (req.user.role !== 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: 'Only administrators can trigger stale payment expiration.',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }

    const { ttlMinutes } = req.body || {};
    try {
      const result = await expirePendingPayments(ttlMinutes ? Number(ttlMinutes) : 30);
      return reply.status(200).send({
        success: true,
        ...result
      });
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: err.message,
        code: 'EXPIRATION_CLEANUP_FAILED'
      });
    }
  });
}

module.exports = paymentRoutes;
