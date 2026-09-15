/**
 * Product & Catalog Routes
 * GET /api/products
 * GET /api/products/:sku
 */
const { getAllProducts, getProductBySku } = require('../services/catalogService');

async function productRoutes(fastify, options) {
  // Get all canonical products
  fastify.get('/api/products', async (req, reply) => {
    const products = await getAllProducts();
    return reply.send({
      success: true,
      count: products.length,
      data: products
    });
  });

  // Get canonical product by SKU
  fastify.get('/api/products/:sku', async (req, reply) => {
    const { sku } = req.params || {};
    if (!sku) {
      return reply.status(400).send({
        success: false,
        error: 'SKU parameter is required',
        code: 'MISSING_SKU'
      });
    }

    const product = await getProductBySku(sku);
    if (!product) {
      return reply.status(404).send({
        success: false,
        error: `Product with SKU '${sku}' not found`,
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    return reply.send({
      success: true,
      data: product
    });
  });
}

module.exports = productRoutes;
