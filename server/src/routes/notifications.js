/**
 * EyeKart Phase 8 Notification Routes
 * Customer-facing notification inspection and preference controls,
 * with strict IDOR protections, rate limiting, and RBAC enforcement.
 */

const { requireAuth, requireRole } = require('../middleware/auth');
const { RateLimiter } = require('../middleware/rateLimit');
const { query } = require('../db/pool');
const { logAuditEvent } = require('../services/auditService');
const { CHANNELS, NOTIFICATION_STATES } = require('../services/notification/NotificationProvider');

const notifRateLimiter = new RateLimiter(60, 60000); // 60 requests per minute per IP

function rateLimitNotifications(req, reply, done) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  if (!notifRateLimiter.isAllowed(ip)) {
    const retrySecs = Math.ceil(notifRateLimiter.windowMs / 1000);
    reply.header('Retry-After', retrySecs);
    return reply.status(429).send({
      success: false,
      error: `Too many notification requests. Please retry in ${retrySecs} seconds.`,
      code: 'RATE_LIMITED'
    });
  }
  done();
}

async function notificationRoutes(fastify, options) {
  // Apply rate limiting to all notification endpoints
  fastify.addHook('preHandler', rateLimitNotifications);

  // ==========================================
  // 1. CUSTOMER NOTIFICATION LEDGER (IDOR PROTECTED)
  // ==========================================
  fastify.get('/api/notifications', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.id;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '20', 10)), 50);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

    const listSql = `
      SELECT id, recipient, channel, event_type, template_id,
             payload, status, provider, sent_at, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `SELECT COUNT(*) FROM notifications WHERE user_id = $1`;

    const [itemsRes, countRes] = await Promise.all([
      query(listSql, [userId, limit, offset]),
      query(countSql, [userId])
    ]);

    return reply.send({
      success: true,
      notifications: itemsRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
      limit,
      offset
    });
  });

  // ==========================================
  // 2. COMMUNICATION PREFERENCES
  // ==========================================
  fastify.get('/api/notifications/preferences', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.id;

    const res = await query(
      `SELECT transactional_email, transactional_sms, marketing_email, marketing_sms, whatsapp, updated_at
       FROM notification_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) {
      // Default preferences
      return reply.send({
        success: true,
        preferences: {
          transactionalEmail: true,
          transactionalSms: true,
          marketingEmail: false,
          marketingSms: false,
          whatsapp: false
        }
      });
    }

    const row = res.rows[0];
    return reply.send({
      success: true,
      preferences: {
        transactionalEmail: row.transactional_email,
        transactionalSms: row.transactional_sms,
        marketingEmail: row.marketing_email,
        marketingSms: row.marketing_sms,
        whatsapp: row.whatsapp,
        updatedAt: row.updated_at
      }
    });
  });

  fastify.patch('/api/notifications/preferences', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user.id;
    const updates = req.body || {};

    // Disallow customer manipulation of template or category semantics
    if (updates.templateId !== undefined || updates.category !== undefined || updates.type !== undefined) {
      return reply.status(400).send({
        success: false,
        error: 'Notification categories and templates cannot be manipulated by customer preferences.',
        code: 'INVALID_PREFERENCE_PAYLOAD'
      });
    }

    // Critical rule: Mandatory transactional notifications cannot be disabled
    const reqTransEmail = updates.transactionalEmail !== undefined ? updates.transactionalEmail : updates.transactional_email;
    const reqTransSms = updates.transactionalSms !== undefined ? updates.transactionalSms : updates.transactional_sms;

    if (reqTransEmail === false || reqTransSms === false) {
      return reply.status(400).send({
        success: false,
        error: 'Mandatory transactional, optical clinical, and security notifications cannot be disabled.',
        code: 'CANNOT_DISABLE_MANDATORY_NOTIFICATIONS'
      });
    }

    const marketingEmail = updates.marketingEmail !== undefined ? Boolean(updates.marketingEmail)
                         : updates.marketing_email !== undefined ? Boolean(updates.marketing_email)
                         : false;
    const marketingSms = updates.marketingSms !== undefined ? Boolean(updates.marketingSms)
                       : updates.marketing_sms !== undefined ? Boolean(updates.marketing_sms)
                       : false;
    const whatsapp = updates.whatsapp !== undefined ? Boolean(updates.whatsapp) : false;

    const upsertSql = `
      INSERT INTO notification_preferences (
        user_id, transactional_email, transactional_sms,
        marketing_email, marketing_sms, whatsapp, updated_at
      ) VALUES ($1, TRUE, TRUE, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        marketing_email = EXCLUDED.marketing_email,
        marketing_sms = EXCLUDED.marketing_sms,
        whatsapp = EXCLUDED.whatsapp,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const res = await query(upsertSql, [userId, marketingEmail, marketingSms, whatsapp]);
    const row = res.rows[0];

    await logAuditEvent({
      actorId: userId,
      actorRole: req.user.role,
      ipAddress: req.ip,
      action: 'NOTIFICATION_PREFERENCES_UPDATED',
      entity: 'NotificationPreferences',
      entityId: userId,
      metadata: {
        marketingEmail,
        marketingSms,
        whatsapp
      }
    });

    return reply.send({
      success: true,
      preferences: {
        transactionalEmail: row.transactional_email,
        transactionalSms: row.transactional_sms,
        marketingEmail: row.marketing_email,
        marketingSms: row.marketing_sms,
        whatsapp: row.whatsapp,
        updatedAt: row.updated_at
      }
    });
  });

  // ==========================================
  // 3. ADMIN NOTIFICATION OVERSIGHT (RBAC GUARDED)
  // ==========================================
  fastify.get('/api/admin/notifications', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '20', 10)), 100);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const { channel, status, eventType } = req.query || {};

    let whereConditions = [];
    let params = [];

    if (channel && Object.values(CHANNELS).includes(channel)) {
      params.push(channel);
      whereConditions.push(`channel = $${params.length}`);
    }
    if (status && Object.values(NOTIFICATION_STATES).includes(status)) {
      params.push(status);
      whereConditions.push(`status = $${params.length}`);
    }
    if (eventType) {
      params.push(eventType);
      whereConditions.push(`event_type = $${params.length}`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const listSql = `
      SELECT id, user_id, recipient, channel, event_type, template_id,
             payload, status, provider, provider_message_id, attempt_count,
             max_attempts, next_retry_at, sent_at, created_at, updated_at
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countSql = `SELECT COUNT(*) FROM notifications ${whereClause}`;

    const [itemsRes, countRes] = await Promise.all([
      query(listSql, [...params, limit, offset]),
      query(countSql, params)
    ]);

    return reply.send({
      success: true,
      notifications: itemsRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
      limit,
      offset
    });
  });
}

module.exports = notificationRoutes;
