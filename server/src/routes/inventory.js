/**
 * EyeKart Phase 6.4 Inventory API Routes
 * Provides server-authoritative stock queries and guards against client inventory manipulation.
 */
const { getInventory } = require('../services/inventoryService');
const { requireAuth } = require('../middleware/auth');

async function inventoryRoutes(fastify, options) {
  // 1. GET /api/products/:sku/inventory - Server-authoritative inventory metrics
  fastify.get('/api/products/:sku/inventory', async (req, reply) => {
    const { sku } = req.params;
    const inventory = await getInventory(sku);
    return reply.send({
      success: true,
      data: inventory
    });
  });

  // 2. Reject arbitrary client attempts to alter stock
  fastify.post('/api/products/:sku/inventory', { preHandler: requireAuth }, async (req, reply) => {
    return reply.status(403).send({
      success: false,
      error: 'Client cannot directly assign or alter product inventory.',
      code: 'FORBIDDEN_INVENTORY_MUTATION'
    });
  });

  fastify.patch('/api/products/:sku/inventory', { preHandler: requireAuth }, async (req, reply) => {
    return reply.status(403).send({
      success: false,
      error: 'Client cannot directly assign or alter product inventory.',
      code: 'FORBIDDEN_INVENTORY_MUTATION'
    });
  });
}

module.exports = inventoryRoutes;
