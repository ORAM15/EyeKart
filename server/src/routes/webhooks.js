/**
 * EyeKart Phase 6.6 Webhook Ingress Routes
 * Handles incoming payment callbacks from external gateways (e.g. Safaricom Daraja).
 */
const webhookService = require('../services/webhookService');
const { darajaInstance } = require('../services/payment');

async function webhookRoutes(fastify, options) {
  /**
   * Verify the webhook shared secret — an OPTIONAL extra layer, never a
   * hard gate for Daraja.
   *
   * Why: in the documented direct Daraja setup the callback URL is a bare
   * URL and Safaricom cannot add an `x-webhook-secret` header (the repo
   * configures no callback signer or proxy that could). Hard-gating on the
   * header therefore 401s every genuine production callback and leaves
   * successful payments unrecorded. Instead:
   * - secret configured AND header matches -> 'secret': the callback is
   *   authenticated by the shared secret (e.g. via a proxy that adds it).
   * - secret configured but header missing/wrong -> 401 (unchanged).
   * - no secret configured -> 'none': the callback is allowed through and
   *   the service verifies the transaction with Daraja itself (STK query by
   *   checkoutRequestId) before any payment is marked paid; an unverifiable
   *   callback is recorded and flagged, never acted on.
   * Returns 'secret' | 'none', or false after replying 401.
   */
  function verifyWebhookSecret(req, reply) {
    const configuredSecret = process.env.MPESA_WEBHOOK_SECRET;
    if (!configuredSecret) {
      console.warn('[Webhook Route] MPESA_WEBHOOK_SECRET is not configured; M-PESA callbacks will be verified against Safaricom via the Daraja STK query API before any payment is marked paid.');
      return 'none';
    }
    const incomingSecret = req.headers['x-webhook-secret'];
    if (incomingSecret !== configuredSecret) {
      reply.status(401).send({
        ResultCode: 1,
        ResultDesc: 'Unauthorized: Invalid webhook secret token'
      });
      return false;
    }
    return 'secret';
  }

  // 1. POST /api/webhooks/mpesa - Dedicated Safaricom Daraja STK Push callback URL
  fastify.post('/api/webhooks/mpesa', async (req, reply) => {
    const webhookAuth = verifyWebhookSecret(req, reply);
    if (!webhookAuth) return;

    try {
      const result = await webhookService.processMpesaCallback(req.body, {
        headers: req.headers,
        ip: req.ip,
        webhookAuth,
        darajaVerifier: ({ checkoutRequestId }) => darajaInstance.queryPayment({ checkoutRequestId })
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
      const webhookAuth = verifyWebhookSecret(req, reply);
      if (!webhookAuth) return;

      try {
        const result = await webhookService.processMpesaCallback(req.body, {
          headers: req.headers,
          ip: req.ip,
          webhookAuth,
          darajaVerifier: ({ checkoutRequestId }) => darajaInstance.queryPayment({ checkoutRequestId })
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
