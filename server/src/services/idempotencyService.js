/**
 * EyeKart Phase 6.2 Idempotency Service
 * Prevents financial and commerce corruption from duplicate requests (double-clicks, network retries).
 */
const crypto = require('crypto');
const { query } = require('../db/pool');

function hashPayload(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Check if an idempotency key has already been executed.
 *
 * A stored record is only a hit when ALL of these match: the key belongs to
 * this user (or to nobody — anonymous records have no owner to protect), the
 * route matches, and — when the caller supplies the request payload — the
 * request hash matches. Any mismatch is a CONFLICT, not a hit: the stored
 * response must never be returned for a different user, route, or payload.
 */
async function checkIdempotency(key, userId, route, payload = null) {
  if (!key || typeof key !== 'string') return { hit: false };

  const cleanKey = key.trim().substring(0, 128);
  const res = await query(
    `SELECT key, user_id, route, request_hash, response_status, response_body, expires_at
     FROM idempotency_keys
     WHERE key = $1 AND expires_at > CURRENT_TIMESTAMP`,
    [cleanKey]
  );

  if (res.rows.length === 0) {
    return { hit: false };
  }

  const record = res.rows[0];
  // Key belongs to a different authenticated user: conflict, never a hit.
  // (A record with user_id NULL was created anonymously and has no owner.)
  if (record.user_id && record.user_id !== userId) {
    return { hit: false, conflict: true };
  }

  // Same key reused on a different route: conflict, not a replay.
  if (route && record.route && record.route !== route) {
    return { hit: false, conflict: true };
  }

  // Same key with a different payload: conflict, not a replay. Without the
  // payload the hash cannot be verified, so only the route check applies.
  if (payload !== null && payload !== undefined) {
    if (hashPayload(payload) !== record.request_hash) {
      return { hit: false, conflict: true };
    }
  }

  return {
    hit: true,
    status: record.response_status,
    body: record.response_body
  };
}

/**
 * Save executed response for an idempotency key.
 *
 * Never overwrites another user's, another route's, or another payload's
 * record: the upsert only applies when user, route, and request hash all
 * match the existing row (NULL user_id matches NULL user_id). An expired row
 * is garbage and is deleted first so a dead key can be reused. If the
 * conflict guard blocks the write, the record is left untouched and a
 * warning is logged — the caller must not assume the save succeeded.
 */
async function saveIdempotency(key, userId, route, payload, status, responseBody, ttlHours = 24) {
  if (!key || typeof key !== 'string') return;

  const cleanKey = key.trim().substring(0, 128);
  const reqHash = hashPayload(payload);
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  try {
    await query(
      `DELETE FROM idempotency_keys WHERE key = $1 AND expires_at <= CURRENT_TIMESTAMP`,
      [cleanKey]
    );
    const res = await query(
      `INSERT INTO idempotency_keys (key, user_id, route, request_hash, response_status, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (key) DO UPDATE
       SET response_status = EXCLUDED.response_status,
           response_body = EXCLUDED.response_body,
           expires_at = EXCLUDED.expires_at
       WHERE idempotency_keys.user_id IS NOT DISTINCT FROM EXCLUDED.user_id
         AND idempotency_keys.route = EXCLUDED.route
         AND idempotency_keys.request_hash = EXCLUDED.request_hash`,
      [cleanKey, userId || null, route, reqHash, status, JSON.stringify(responseBody), expiresAt]
    );
    if (res.rowCount === 0) {
      console.warn('[Idempotency] Key already owned by another user/route/payload; existing record left untouched:', cleanKey);
    }
  } catch (err) {
    console.error('[Idempotency] Failed to save key record:', err.message);
  }
}

module.exports = {
  hashPayload,
  checkIdempotency,
  saveIdempotency
};
