/**
 * EyeKart Phase 6.6 Webhook Ingress Routes
 * Handles incoming payment callbacks from external gateways (e.g. Safaricom Daraja).
 */
const webhookService = require('../services/webhookService');

async function webhookRoutes(fastify, options) {
  /**
   * Helper to verify the webhook shared secret.
   * Header only: the secret is never accepted via query string (URLs are
   * logged and leak). Fail closed in production: if no secret is configured
   * the callback is rejected. In non-production, a missing secret only logs
   * a loud warning and allows the callback so sandbox/demo flows keep
   * working; production boot already fails fast without the secret
   * (see config/env.js validateConfig), so this branch is defence in depth.
   */
  function verifyWebhookSecret(req, reply) {
    const configuredSecret = process.env.MPESA_WEBHOOK_SECRET;
    if (!configuredSecret) {
      if (process.env.NODE_ENV === 'production') {
        fastify.log.error('[Webhook Route] MPESA_WEBHOOK_SECRET is not configured in production; rejecting webhook.');
        reply.status(500).send({
          ResultCode: 1,
          ResultDesc: 'Internal Server Error'
        });
        return false;
      }
      console.warn('[Webhook Route] WARNING: MPESA_WEBHOOK_SECRET is not configured; webhook callbacks are unauthenticated. Set MPESA_WEBHOOK_SECRET before deploying to production.');
      return true;
    }
    const incomingSecret = req.headers['x-webhook-secret'];
    if (incomingSecret !== configuredSecret) {
      reply.status(401).send({
        ResultCode: 1,
        ResultDesc: 'Unauthorized: Invalid webhook secret token'
      });
      return false;
    }
    return true;
  }

  // 1. POST /api/webhooks/mpesa - Dedicated Safaricom Daraja STK Push callback URL
  fastify.post('/api/webhooks/mpesa', async (req, reply) => {
    if (!verifyWebhookSecret(req, reply)) return;

    try {
      const result = await webhookService.processMpesaCallback(req.body, {
        headers: req.headers,
        ip: req.ip
      });

      // Safaricom expects a standard acknowledgement. Only the ResultCode /
      // ResultDesc are returned: internal processing details (order id,
      // receipt, checkout request id) are never echoed to the caller.
      return reply.status(result.httpStatus || 200).send({
        ResultCode: result.resultCode ?? 0,
        ResultDesc: result.resultCode ? 'Rejected' : 'Accepted'
      });
    } catch (err) {
      fastify.log.error(err, '[Webhook Route] Error processing M-PESA webhook');
      return reply.status(err.statusCode || 500).send({
        ResultCode: 1,
        ResultDesc: 'Internal Server Error'
      });
    }
  });

  // 2. POST /api/webhooks/:provider - Generic provider dispatcher
  fastify.post('/api/webhooks/:provider', async (req, reply) => {
    const provider = String(req.params.provider).toLowerCase();

    if (provider === 'mpesa' || provider === 'daraja') {
      if (!verifyWebhookSecret(req, reply)) return;

      try {
        const result = await webhookService.processMpesaCallback(req.body, {
          headers: req.headers,
          ip: req.ip
        });
        return reply.status(result.httpStatus || 200).send({
          ResultCode: result.resultCode ?? 0,
          ResultDesc: result.resultCode ? 'Rejected' : 'Accepted'
        });
      } catch (err) {
        fastify.log.error(err, '[Webhook Route] Error processing M-PESA webhook');
        return reply.status(err.statusCode || 500).send({
          ResultCode: 1,
          ResultDesc: 'Internal Server Error'
        });
      }
    }

    return reply.status(404).send({
      ResultCode: 1,
      ResultDesc: `Unsupported webhook provider '${provider}'.`
    });
  });
}

module.exports = webhookRoutes;
