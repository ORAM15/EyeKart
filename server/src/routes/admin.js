/**
 * Admin & Privileged Operations Routes
 * GET /api/admin/audit-logs (Requires ADMIN role)
 */
const { requireRole } = require('../middleware/auth');
const { getRecentAuditLogs } = require('../services/auditService');

async function adminRoutes(fastify, options) {
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
}

module.exports = adminRoutes;
