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
 * Check if an idempotency key has already been executed
 */
async function checkIdempotency(key, userId, route) {
  if (!key || typeof key !== 'string') return { hit: false };

  const cleanKey = key.trim().substring(0, 128);
  const res = await query(
    `SELECT key, user_id, route, response_status, response_body, expires_at 
     FROM idempotency_keys 
     WHERE key = $1 AND expires_at > CURRENT_TIMESTAMP`,
    [cleanKey]
  );

  if (res.rows.length === 0) {
    return { hit: false };
  }

  const record = res.rows[0];
  // Optional sanity check: prevent key stealing across users if authenticated
  if (userId && record.user_id && record.user_id !== userId) {
    return { hit: false, conflict: true };
  }

  return {
    hit: true,
    status: record.response_status,
    body: record.response_body
  };
}

/**
 * Save executed response for an idempotency key
 */
async function saveIdempotency(key, userId, route, payload, status, responseBody, ttlHours = 24) {
  if (!key || typeof key !== 'string') return;

  const cleanKey = key.trim().substring(0, 128);
  const reqHash = hashPayload(payload);
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  try {
    await query(
      `INSERT INTO idempotency_keys (key, user_id, route, request_hash, response_status, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (key) DO UPDATE 
       SET response_status = EXCLUDED.response_status,
           response_body = EXCLUDED.response_body,
           expires_at = EXCLUDED.expires_at`,
      [cleanKey, userId || null, route, reqHash, status, JSON.stringify(responseBody), expiresAt]
    );
  } catch (err) {
    console.error('[Idempotency] Failed to save key record:', err.message);
  }
}

module.exports = {
  hashPayload,
  checkIdempotency,
  saveIdempotency
};
