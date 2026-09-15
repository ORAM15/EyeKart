/**
 * EyeKart Phase 6.6 Webhook Ingress Routes
 * Handles incoming payment callbacks from external gateways (e.g. Safaricom Daraja).
 */
const webhookService = require('../services/webhookService');

async function webhookRoutes(fastify, options) {
  /**
   * Helper to verify optional webhook shared secret
   */
  function verifyWebhookSecret(req, reply) {
    const configuredSecret = process.env.MPESA_WEBHOOK_SECRET;
    if (!configuredSecret) {
      // In development/sandbox with no secret configured, proceed
      return true;
    }
    const incomingSecret = req.headers['x-webhook-secret'] || req.query?.secret;
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

      // Safaricom expects standard response
      return reply.status(result.httpStatus || 200).send({
        ResultCode: 0,
        ResultDesc: 'Accepted',
        details: result
      });
    } catch (err) {
      fastify.log.error(err, '[Webhook Route] Error processing M-PESA webhook');
      return reply.status(err.statusCode || 500).send({
        ResultCode: 1,
        ResultDesc: err.message || 'Internal Server Error'
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
          ResultCode: 0,
          ResultDesc: 'Accepted',
          details: result
        });
      } catch (err) {
        return reply.status(err.statusCode || 500).send({
          ResultCode: 1,
          ResultDesc: err.message || 'Internal Server Error'
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
