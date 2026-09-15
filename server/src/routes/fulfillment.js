/**
 * EyeKart Phase 6.4 Fulfillment & Delivery Tracking Routes
 * Provides customer tracking telemetry and staff operational transitions.
 */
const { 
  createFulfillment, 
  transitionFulfillment, 
  getFulfillmentByOrderId 
} = require('../services/fulfillmentService');
const { requireAuth, requireRole } = require('../middleware/auth');

async function fulfillmentRoutes(fastify, options) {
  // 1. GET /api/orders/:id/fulfillment - Customer / Staff view of fulfillment
  fastify.get('/api/orders/:id/fulfillment', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const fulfillmentData = await getFulfillmentByOrderId(id, req.user.id, req.user.role);
    return reply.send({
      success: true,
      data: fulfillmentData
    });
  });

  // 2. GET /api/orders/:id/tracking - Customer view of delivery tracking timeline
  fastify.get('/api/orders/:id/tracking', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const fulfillmentData = await getFulfillmentByOrderId(id, req.user.id, req.user.role);
    return reply.send({
      success: true,
      tracking: fulfillmentData.tracking
    });
  });

  // 3. POST /api/fulfillments - Staff / Admin initialization of fulfillment
  fastify.post('/api/fulfillments', { 
    preHandler: [requireAuth, requireRole(['STORE_STAFF', 'ADMIN', 'LAB_TECH'])] 
  }, async (req, reply) => {
    const { orderId, notes } = req.body || {};
    if (!orderId) {
      return reply.status(400).send({
        success: false,
        error: 'Order ID is required to create a fulfillment record.',
        code: 'MISSING_ORDER_ID'
      });
    }

    const fulfillment = await createFulfillment({
      orderId,
      actorId: req.user.id,
      actorRole: req.user.role,
      actorName: req.user.full_name || req.user.fullName || 'Operations Staff',
      notes,
      ipAddress: req.ip
    });

    return reply.status(201).send({
      success: true,
      message: 'Fulfillment initiated successfully.',
      fulfillment
    });
  });

  // 4. POST /api/fulfillments/:id/transition - Staff / Admin state machine transition
  fastify.post('/api/fulfillments/:id/transition', { 
    preHandler: [requireAuth, requireRole(['STORE_STAFF', 'ADMIN', 'LAB_TECH', 'OPTOMETRIST'])] 
  }, async (req, reply) => {
    const { id } = req.params;
    const { targetState, note } = req.body || {};

    if (!targetState) {
      return reply.status(400).send({
        success: false,
        error: 'Target state is required for fulfillment transition.',
        code: 'MISSING_TARGET_STATE'
      });
    }

    const updated = await transitionFulfillment({
      fulfillmentId: id,
      targetState,
      actorId: req.user.id,
      actorRole: req.user.role,
      actorName: req.user.full_name || req.user.fullName || 'Operations Staff',
      note,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: `Fulfillment transitioned to ${targetState}.`,
      fulfillment: updated
    });
  });

  // 5. Block arbitrary customer PATCH attempts on fulfillments
  fastify.patch('/api/fulfillments/:id', { preHandler: requireAuth }, async (req, reply) => {
    return reply.status(403).send({
      success: false,
      error: 'Direct client manipulation of fulfillment records is forbidden.',
      code: 'FORBIDDEN_OPERATIONAL_ACTION'
    });
  });
}

module.exports = fulfillmentRoutes;
