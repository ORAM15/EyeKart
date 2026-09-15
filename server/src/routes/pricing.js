/**
 * Server-Authoritative Pricing Routes
 * POST /api/pricing/quote
 */
const { calculateAuthoritativeQuote } = require('../services/pricingService');

async function pricingRoutes(fastify, options) {
  fastify.post('/api/pricing/quote', async (req, reply) => {
    const { items } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Pricing calculation requires a non-empty array of items.',
        code: 'EMPTY_ITEMS_ARRAY'
      });
    }

    try {
      const quote = await calculateAuthoritativeQuote(items);
      return reply.send({
        success: true,
        data: quote
      });
    } catch (err) {
      return reply.status(400).send({
        success: false,
        error: err.message,
        code: 'PRICING_CALCULATION_ERROR'
      });
    }
  });
}

module.exports = pricingRoutes;
