/**
 * Categories & Collections Routes
 * GET /api/categories
 * GET /api/collections
 */
const { getAllCategories, getAllCollections } = require('../services/catalogService');

async function taxonomyRoutes(fastify, options) {
  fastify.get('/api/categories', async (req, reply) => {
    const categories = await getAllCategories();
    return reply.send({
      success: true,
      data: categories
    });
  });

  fastify.get('/api/collections', async (req, reply) => {
    const collections = await getAllCollections();
    return reply.send({
      success: true,
      data: collections
    });
  });
}

module.exports = taxonomyRoutes;
