/**
 * Admin & Privileged Operations Routes
 * GET /api/admin/audit-logs (Requires ADMIN role)
 * GET /api/admin/orders (Requires ADMIN role)
 */
const { requireRole } = require('../middleware/auth');
const { getRecentAuditLogs } = require('../services/auditService');
const { listAllOrders } = require('../services/orderService');

async function adminRoutes(fastify, options) {
  // 1. Audit Logs
  fastify.get('/api/admin/audit-logs', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const logs = await getRecentAuditLogs(limit, offset);
    return reply.send({
      success: true,
      count: logs.length,
      data: logs
    });
  });

  // 2. All Orders Management Overview
  fastify.get('/api/admin/orders', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const { status, paymentStatus, search } = req.query || {};

    const result = await listAllOrders({ limit, offset, status, paymentStatus, search });
    return reply.send({
      success: true,
      ...result
    });
  });
}

module.exports = adminRoutes;
