/**
 * EyeKart Phase 6.2 Checkout Routes
 * Generates authoritative checkout quotes with locked totals.
 */
const { generateCheckoutQuote } = require('../services/checkoutService');
const { rateLimitCheckout } = require('../middleware/rateLimit');

async function checkoutRoutes(fastify, options) {
  // Stage 2 slice F: 30/min/IP on the quote endpoint. It is
  // unauthenticated and does pricing work, so it needs a limit even
  // though a human re-quotes rarely.
  fastify.addHook('preHandler', rateLimitCheckout);
  // POST /api/checkout/quote
  fastify.post('/api/checkout/quote', async (req, reply) => {
    const userId = req.user ? req.user.id : null;
    const { cartId, items, deliveryOption } = req.body || {};

    const quote = await generateCheckoutQuote({
      userId,
      cartId,
      items,
      deliveryOption: deliveryOption || 'STANDARD_NAIROBI'
    });

    return reply.status(201).send({
      success: true,
      quote
    });
  });
}

module.exports = checkoutRoutes;
