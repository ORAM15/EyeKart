/**
 * EyeKart Phase 7 Admin & Privileged Operations Routes
 * Strictly protected by requireRole('ADMIN').
 * Rejects non-admin roles and client-side role-claim tampering.
 */
const { requireRole } = require('../middleware/auth');
const { getRecentAuditLogs } = require('../services/auditService');
const { listAllOrders, getOrderById, updateOrderStatus, cancelOrder } = require('../services/orderService');
const { getAdminProducts, updateProduct } = require('../services/catalogService');
const { adjustStock } = require('../services/inventoryService');
const { query } = require('../db/pool');

async function adminRoutes(fastify, options) {
  // ==========================================
  // 1. AUDIT LOGGING & OVERSIGHT
  // ==========================================
  fastify.get('/api/admin/audit-logs', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '50', 10)), 100);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

    const logs = await getRecentAuditLogs(limit, offset);
    return reply.send({
      success: true,
      count: logs.length,
      limit,
      offset,
      data: logs
    });
  });

  // ==========================================
  // 2. ORDER OPERATIONAL CONTROL
  // ==========================================
  // List all orders with bounded pagination and status/payment filters
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

  // Detailed operational view of a single order
  fastify.get('/api/admin/orders/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const order = await getOrderById(req.params.id, req.user.id, req.user.role);

    // Fetch associated fulfillment records and timeline events
    const fulfillmentsRes = await query(
      `SELECT * FROM fulfillments WHERE order_id = $1 ORDER BY created_at DESC`,
      [order.id]
    );

    const fulfillmentEventsRes = await query(
      `SELECT fe.*
       FROM fulfillment_events fe
       JOIN fulfillments f ON fe.fulfillment_id = f.id
       WHERE f.order_id = $1
       ORDER BY fe.created_at ASC`,
      [order.id]
    );

    return reply.send({
      success: true,
      order: {
        ...order,
        fulfillments: fulfillmentsRes.rows,
        fulfillmentEvents: fulfillmentEventsRes.rows
      }
    });
  });

  // Update order operational status with state machine & optical/payment gating
  fastify.patch('/api/admin/orders/:id/status', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { status, reason, stageInfo } = req.body || {};
    if (!status) {
      return reply.status(400).send({
        error: 'Target order status is required.',
        code: 'MISSING_TARGET_STATUS'
      });
    }

    const updatedOrder = await updateOrderStatus(
      req.params.id,
      status,
      req.user.role,
      stageInfo || null,
      req.user.id,
      req.ip,
      reason || 'Operational status update by Administrator'
    );

    return reply.send({
      success: true,
      order: updatedOrder
    });
  });

  // Administrative order cancellation (releases stock and marks order cancelled)
  fastify.post('/api/admin/orders/:id/cancel', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { reason } = req.body || {};
    const cancelledOrder = await cancelOrder(
      req.params.id,
      req.user.id,
      req.user.role,
      reason || 'Administrative cancellation by Westlands Atelier Operations',
      req.ip
    );

    return reply.send({
      success: true,
      order: cancelledOrder
    });
  });

  // ==========================================
  // 3. CATALOG & PRODUCT INTEGRITY
  // ==========================================
  // List all products with admin metrics (stock, reserved_stock, active state)
  fastify.get('/api/admin/products', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const search = req.query.search;

    const result = await getAdminProducts({ limit, offset, search });
    return reply.send({
      success: true,
      ...result
    });
  });

  // Update product catalog attributes (price in KES >= 0, active state, etc.)
  fastify.patch('/api/admin/products/:sku', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const updatedProduct = await updateProduct(
      req.params.sku,
      req.body || {},
      {
        actorId: req.user.id,
        actorRole: req.user.role,
        ipAddress: req.ip
      }
    );

    return reply.send({
      success: true,
      product: updatedProduct
    });
  });

  // ==========================================
  // 4. INVENTORY CONTROLS & STOCK ADJUSTMENT
  // ==========================================
  // Explicit stock adjustment with mandatory audit reason and delta/newStock
  fastify.post('/api/admin/inventory/adjust', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { sku, delta, newStock, reason } = req.body || {};

    const adjustment = await adjustStock({
      sku,
      delta,
      newStock,
      reason,
      actorId: req.user.id,
      actorRole: req.user.role,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      adjustment
    });
  });

  // ==========================================
  // 5. CUSTOMER ACCOUNTS OVERSIGHT (SANITIZED)
  // ==========================================
  // List customer accounts with strict data minimization (no password_hash, tokens, salts)
  fastify.get('/api/admin/customers', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '20', 10)), 100);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const search = req.query.search;

    const whereClauses = ["role = 'CUSTOMER'"];
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClauses.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
    }

    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;

    const countRes = await query(`SELECT COUNT(*) as total FROM users ${whereStr}`, params);
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const usersRes = await query(`
      SELECT id, email, full_name, phone, role, is_active, created_at, updated_at
      FROM users
      ${whereStr}
      ORDER BY created_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `, params);

    return reply.send({
      success: true,
      customers: usersRes.rows,
      total,
      limit,
      offset
    });
  });
}

module.exports = adminRoutes;
