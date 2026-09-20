/**
 * Append-Only Security & Operational Audit Service
 * EyeKart Phase 11 Production Observability & Audit Hardening
 */
const { query } = require('../db/pool');

// Forbidden metadata keys to prevent accidental secret or medical content logging
const FORBIDDEN_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'salt', 'token', 'rawtoken',
  'raw_token', 'secret', 'pin', 'credit_card', 'creditcard', 'cvv',
  'authorization', 'cookie', 'apikey', 'api_key', 'mpesapasskey',
  'consumersecret', 'securitycredential', 'document_content',
  'file_content', 'file_data', 'base64'
]);

/**
 * Sanitize metadata object removing any sensitive keys or deep payloads
 */
function sanitizeAuditMetadata(meta = {}, depth = 0) {
  if (depth > 6) return '[MAX_DEPTH]';
  if (typeof meta !== 'object' || meta === null) return {};

  const cleaned = {};
  for (const [key, val] of Object.entries(meta)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (FORBIDDEN_KEYS.has(normalizedKey) || FORBIDDEN_KEYS.has(key.toLowerCase())) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      cleaned[key] = sanitizeAuditMetadata(val, depth + 1);
    } else if (typeof val === 'string' && val.length > 500) {
      cleaned[key] = val.substring(0, 500) + '...[TRUNCATED]';
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Record an append-only audit log entry
 */
async function logAuditEvent({
  actorId = null,
  actorRole = 'ANONYMOUS',
  ipAddress = null,
  userAgent = null,
  action,
  entity,
  entityId = null,
  correlationId = null,
  metadata = {}
}) {
  if (!action || !entity) {
    throw new Error('Audit log requires action and entity');
  }

  const cleanMeta = sanitizeAuditMetadata(metadata);
  const cleanCorrelationId = correlationId ? String(correlationId).trim().substring(0, 64) : null;

  try {
    const res = await query(
      `INSERT INTO audit_logs (actor_id, actor_role, ip_address, user_agent, action, entity, entity_id, correlation_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at, correlation_id`,
      [actorId, actorRole, ipAddress, userAgent, action, entity, entityId, cleanCorrelationId, JSON.stringify(cleanMeta)]
    );
    return res.rows[0];
  } catch (err) {
    // Non-blocking error for main application flow, but logged to stderr
    console.error('[EyeKart Audit Failure] Could not persist audit log:', err.message);
    return null;
  }
}

/**
 * Query audit logs with advanced operational filtering (Admin only)
 */
async function queryAuditLogs(options = {}) {
  let limit = 50;
  let offset = 0;
  let action = null;
  let entity = null;
  let entityId = null;
  let actorId = null;
  let actorRole = null;
  let correlationId = null;
  let startDate = null;
  let endDate = null;

  if (typeof options === 'number') {
    limit = options;
  } else if (typeof options === 'object' && options !== null) {
    limit = options.limit !== undefined ? options.limit : 50;
    offset = options.offset !== undefined ? options.offset : 0;
    action = options.action || options.eventType || null;
    entity = options.entity || options.resourceType || null;
    entityId = options.entityId || options.resourceId || null;
    actorId = options.actorId || null;
    actorRole = options.actorRole || null;
    correlationId = options.correlationId || options.requestId || null;
    startDate = options.startDate || null;
    endDate = options.endDate || null;
  }

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (action) {
    conditions.push(`action = $${paramIdx++}`);
    params.push(String(action).trim());
  }

  if (entity) {
    conditions.push(`entity = $${paramIdx++}`);
    params.push(String(entity).trim());
  }

  if (entityId) {
    conditions.push(`entity_id = $${paramIdx++}`);
    params.push(String(entityId).trim());
  }

  if (actorId) {
    conditions.push(`actor_id = $${paramIdx++}`);
    params.push(actorId);
  }

  if (actorRole) {
    conditions.push(`actor_role = $${paramIdx++}`);
    params.push(String(actorRole).trim());
  }

  if (correlationId) {
    conditions.push(`correlation_id = $${paramIdx++}`);
    params.push(String(correlationId).trim());
  }

  if (startDate) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(new Date(startDate));
  }

  if (endDate) {
    conditions.push(`created_at <= $${paramIdx++}`);
    params.push(new Date(endDate));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countRes = await query(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`, params);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  // Fetch paginated records
  const dataParams = [...params, safeLimit, safeOffset];
  const queryText = `
    SELECT id, actor_id, actor_role, ip_address, user_agent, action, entity, entity_id, correlation_id, metadata, created_at
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  const dataRes = await query(queryText, dataParams);
  const rows = dataRes.rows;
  rows.total = total;

  return {
    rows,
    total,
    limit: safeLimit,
    offset: safeOffset
  };
}

/**
 * Backward-compatible helper to query recent audit logs
 */
async function getRecentAuditLogs(limitOrOpts = 50, offset = 0) {
  if (typeof limitOrOpts === 'object' && limitOrOpts !== null) {
    const res = await queryAuditLogs(limitOrOpts);
    return res.rows;
  }
  const res = await queryAuditLogs({ limit: limitOrOpts, offset });
  return res.rows;
}

/**
 * Query high-level audit metrics & event distribution
 */
async function getAuditLogStats() {
  const countRes = await query(`SELECT COUNT(*) as total FROM audit_logs`);
  const actionRes = await query(
    `SELECT action, COUNT(*) as count
     FROM audit_logs
     GROUP BY action
     ORDER BY count DESC
     LIMIT 20`
  );
  const roleRes = await query(
    `SELECT actor_role, COUNT(*) as count
     FROM audit_logs
     GROUP BY actor_role
     ORDER BY count DESC`
  );

  return {
    total: parseInt(countRes.rows[0]?.total || '0', 10),
    byAction: actionRes.rows.map(r => ({ action: r.action, count: parseInt(r.count, 10) })),
    byRole: roleRes.rows.map(r => ({ role: r.actor_role, count: parseInt(r.count, 10) }))
  };
}

module.exports = {
  logAuditEvent,
  queryAuditLogs,
  getRecentAuditLogs,
  getAuditLogStats,
  sanitizeAuditMetadata,
  FORBIDDEN_KEYS
};
