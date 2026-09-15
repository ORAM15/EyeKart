/**
 * EyeKart Phase 6.2 Order Management Routes
 * Enforces order creation from valid quotes, IDOR security, and state-machine transitions.
 */
const { 
  createOrderFromQuote, 
  getOrderById, 
  listCustomerOrders, 
  cancelOrder, 
  updateOrderStatus 
} = require('../services/orderService');
const { requireAuth, requireRole } = require('../middleware/auth');

async function orderRoutes(fastify, options) {
  // 1. POST /api/orders - Create Order from Authoritative Quote
  fastify.post('/api/orders', { preHandler: requireAuth }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || null;
    const { 
      quoteId, 
      cartId, 
      items, 
      deliveryAddress, 
      gateProtocol, 
      customerSnapshot, 
      prescriptionSnapshot 
    } = req.body || {};

    const order = await createOrderFromQuote({
      userId: req.user.id,
      quoteId,
      cartId,
      items,
      deliveryAddress,
      gateProtocol,
      customerSnapshot: {
        ...customerSnapshot,
        name: customerSnapshot?.name || req.user.full_name,
        email: customerSnapshot?.email || req.user.email,
        phone: customerSnapshot?.phone || req.user.phone
      },
      prescriptionSnapshot,
      idempotencyKey,
      actorRole: req.user.role,
      ipAddress: req.ip
    });

    return reply.status(201).send({
      success: true,
      message: 'Order created successfully.',
      order
    });
  });

  // 2. GET /api/orders - List customer's own orders
  fastify.get('/api/orders', { preHandler: requireAuth }, async (req, reply) => {
    const limit = parseInt(req.query.limit || 20, 10);
    const offset = parseInt(req.query.offset || 0, 10);

    const orders = await listCustomerOrders(req.user.id, { limit, offset });
    return reply.send({
      success: true,
      orders,
      count: orders.length
    });
  });

  // 3. GET /api/orders/:id - Get specific order (Strict IDOR protection)
  fastify.get('/api/orders/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const order = await getOrderById(id, req.user.id, req.user.role);

    return reply.send({
      success: true,
      order
    });
  });

  // 4. POST /api/orders/:id/cancel - Cancel order (Strict state machine check)
  fastify.post('/api/orders/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    const cancelledOrder = await cancelOrder(id, req.user.id, req.user.role, reason, req.ip);

    return reply.send({
      success: true,
      message: 'Order cancelled successfully.',
      order: cancelledOrder
    });
  });

  // 5. PATCH /api/orders/:id/status - Staff/Admin status update (Customers FORBIDDEN)
  fastify.patch('/api/orders/:id/status', { 
    preHandler: [requireAuth, requireRole(['ADMIN', 'OPTOMETRIST', 'STORE_STAFF'])] 
  }, async (req, reply) => {
    const { id } = req.params;
    const { status, stageInfo } = req.body || {};

    const updated = await updateOrderStatus(id, status, req.user.role, stageInfo);
    return reply.send({
      success: true,
      message: `Order status updated to ${status}.`,
      order: updated
    });
  });

  // 6. GET /api/orders/:id/fulfillment-eligibility - Optical Order Fulfillment Clearance
  const { checkOrderFulfillmentEligibility } = require('../services/gatingService');
  fastify.get('/api/orders/:id/fulfillment-eligibility', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const eligibility = await checkOrderFulfillmentEligibility(id, req.user.id, req.user.role);
    return reply.send({
      success: true,
      eligibility
    });
  });
}

module.exports = orderRoutes;
