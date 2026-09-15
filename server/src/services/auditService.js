/**
 * Append-Only Security & Operational Audit Service
 * EyeKart Phase 6.1 Audit Foundation
 */
const { query } = require('../db/pool');

// Forbidden metadata keys to prevent accidental secret logging
const FORBIDDEN_KEYS = new Set([
  'password', 'password_hash', 'passwordHash', 'token', 'rawToken',
  'secret', 'pin', 'credit_card', 'cvv', 'authorization'
]);

/**
 * Sanitize metadata object removing any sensitive keys
 */
function sanitizeAuditMetadata(meta = {}) {
  if (typeof meta !== 'object' || meta === null) return {};
  const cleaned = {};
  for (const [key, val] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      cleaned[key] = sanitizeAuditMetadata(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Record an append-only audit log entry
 */
async function logAuditEvent({ actorId = null, actorRole = 'ANONYMOUS', ipAddress = null, userAgent = null, action, entity, entityId = null, metadata = {} }) {
  if (!action || !entity) {
    throw new Error('Audit log requires action and entity');
  }

  const cleanMeta = sanitizeAuditMetadata(metadata);

  try {
    const res = await query(
      `INSERT INTO audit_logs (actor_id, actor_role, ip_address, user_agent, action, entity, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [actorId, actorRole, ipAddress, userAgent, action, entity, entityId, JSON.stringify(cleanMeta)]
    );
    return res.rows[0];
  } catch (err) {
    // Non-blocking error for main application flow, but logged to stderr
    console.error('[EyeKart Audit Failure] Could not persist audit log:', err.message);
    return null;
  }
}

/**
 * Query recent audit logs (Admin only)
 */
async function getRecentAuditLogs(limit = 50, offset = 0) {
  const res = await query(
    `SELECT id, actor_id, actor_role, ip_address, user_agent, action, entity, entity_id, metadata, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [Math.min(limit, 100), offset]
  );
  return res.rows;
}

module.exports = {
  logAuditEvent,
  getRecentAuditLogs,
  sanitizeAuditMetadata
};
