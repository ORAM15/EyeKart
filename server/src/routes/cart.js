/**
 * EyeKart Phase 6.2 Cart Routes
 * REST API endpoints for server-authoritative cart management.
 */
const { 
  getOrCreateCart, 
  getCartDetails, 
  addItemToCart, 
  updateCartItemQty, 
  removeCartItem, 
  clearCart, 
  mergeGuestCart 
} = require('../services/cartService');

async function cartRoutes(fastify, options) {
  // 1. GET /api/cart - Fetch current authoritative cart
  fastify.get('/api/cart', async (req, reply) => {
    const userId = req.user ? req.user.id : null;
    const sessionId = req.cookies?.eyekart_session || req.headers['x-guest-session'] || null;

    let cart = null;
    if (userId || sessionId) {
      const activeCart = await getOrCreateCart(userId, sessionId);
      cart = await getCartDetails(activeCart.id, userId);
    } else {
      // Ephemeral empty cart if not identified
      cart = {
        id: null,
        items: [],
        subtotal: 0,
        vat: 0,
        deliveryFee: 0,
        total: 0,
        itemCount: 0
      };
    }

    return reply.send({
      success: true,
      cart
    });
  });

  // 2. POST /api/cart/items - Add item to cart
  fastify.post('/api/cart/items', async (req, reply) => {
    const userId = req.user ? req.user.id : null;
    const sessionId = req.cookies?.eyekart_session || req.headers['x-guest-session'] || null;
    const { sku, variant, qty, lensConfig } = req.body || {};

    const activeCart = await getOrCreateCart(userId, sessionId);
    const updatedCart = await addItemToCart(activeCart.id, {
      sku,
      variant,
      qty,
      lensConfig
    });

    return reply.status(201).send({
      success: true,
      message: 'Item added to cart.',
      cart: updatedCart
    });
  });

  // 3. PUT /api/cart/items/:id - Update item quantity
  fastify.put('/api/cart/items/:id', async (req, reply) => {
    const userId = req.user ? req.user.id : null;
    const sessionId = req.cookies?.eyekart_session || req.headers['x-guest-session'] || null;
    const { id } = req.params;
    const { qty } = req.body || {};

    const activeCart = await getOrCreateCart(userId, sessionId);
    const updatedCart = await updateCartItemQty(activeCart.id, id, qty);

    return reply.send({
      success: true,
      message: 'Cart item updated.',
      cart: updatedCart
    });
  });

  // 4. DELETE /api/cart/items/:id - Remove item
  fastify.delete('/api/cart/items/:id', async (req, reply) => {
    const userId = req.user ? req.user.id : null;
    const sessionId = req.cookies?.eyekart_session || req.headers['x-guest-session'] || null;
    const { id } = req.params;

    const activeCart = await getOrCreateCart(userId, sessionId);
    const updatedCart = await removeCartItem(activeCart.id, id);

    return reply.send({
      success: true,
      message: 'Cart item removed.',
      cart: updatedCart
    });
  });

  // 5. DELETE /api/cart - Clear cart
  fastify.delete('/api/cart', async (req, reply) => {
    const userId = req.user ? req.user.id : null;
    const sessionId = req.cookies?.eyekart_session || req.headers['x-guest-session'] || null;

    const activeCart = await getOrCreateCart(userId, sessionId);
    const updatedCart = await clearCart(activeCart.id);

    return reply.send({
      success: true,
      message: 'Cart cleared.',
      cart: updatedCart
    });
  });

  // 6. POST /api/cart/merge - Merge guest items into customer cart
  fastify.post('/api/cart/merge', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required to merge cart.',
        code: 'UNAUTHORIZED'
      });
    }

    const { items } = req.body || {};
    const mergedCart = await mergeGuestCart(req.user.id, items);

    return reply.send({
      success: true,
      message: 'Guest cart successfully merged.',
      cart: mergedCart
    });
  });
}

module.exports = cartRoutes;
