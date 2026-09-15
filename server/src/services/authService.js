/**
 * Authentication & Password Security Service
 * Implements OWASP-compliant memory-hard password hashing and secure session tokens.
 */
const crypto = require('crypto');
const { query } = require('../db/pool');
const config = require('../config/env');

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024
};

/**
 * Hash password using crypto.scrypt with a unique random salt
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string' || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(plainPassword, salt, 64, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) return reject(err);
      const hashHex = derivedKey.toString('hex');
      resolve(`$scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${hashHex}`);
    });
  });
}

/**
 * Verify password against stored scrypt hash in constant time
 */
async function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 5 || parts[1] !== 'scrypt') {
    return false;
  }

  const salt = parts[3];
  const expectedHashHex = parts[4];
  const expectedBuffer = Buffer.from(expectedHashHex, 'hex');

  return new Promise((resolve) => {
    crypto.scrypt(plainPassword, salt, expectedBuffer.length, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const matches = crypto.timingSafeEqual(derivedKey, expectedBuffer);
        resolve(matches);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

/**
 * Hash a session token before database lookup / storage
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Create a new authenticated session in database
 */
async function createSession(userId, ipAddress, userAgent) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlMs = config.session.ttlHours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, userId, expiresAt.toISOString(), ipAddress, userAgent]
  );

  return { rawToken, expiresAt };
}

/**
 * Resolve an active session and fetch user profile (without password hash)
 */
async function resolveSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = hashToken(rawToken);
  const res = await query(
    `SELECT s.id AS session_id, s.expires_at, s.is_revoked,
            u.id AS user_id, u.email, u.phone, u.full_name, u.role, u.is_active, u.created_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );

  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  if (row.is_revoked || new Date(row.expires_at) < new Date() || !row.is_active) {
    return null;
  }

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      email: row.email,
      phone: row.phone,
      fullName: row.full_name,
      role: row.role,
      createdAt: row.created_at
    }
  };
}

/**
 * Invalidate an active session (Logout)
 */
async function invalidateSession(rawToken) {
  if (!rawToken) return false;
  const tokenHash = hashToken(rawToken);
  const res = await query(
    `UPDATE sessions SET is_revoked = TRUE WHERE token_hash = $1`,
    [tokenHash]
  );
  return res.rowCount > 0;
}

/**
 * Sanitize user object for API responses (Guarantee password_hash is never present)
 */
function sanitizeUser(userRow) {
  if (!userRow) return null;
  const { password_hash, ...safeUser } = userRow;
  return {
    id: safeUser.id,
    email: safeUser.email,
    phone: safeUser.phone,
    fullName: safeUser.full_name || safeUser.fullName,
    role: safeUser.role,
    createdAt: safeUser.created_at || safeUser.createdAt
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  resolveSession,
  invalidateSession,
  sanitizeUser
};
