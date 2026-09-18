/**
 * Authentication & Password Security Service
 * Implements OWASP-compliant memory-hard password hashing and secure session tokens.
 */
const crypto = require('crypto');
const { query } = require('../db/pool');
const config = require('../config/env');
const notificationService = require('./notification/notificationService');

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
            u.id AS user_id, u.email, u.phone, u.full_name, u.role, u.is_active, u.created_at,
            u.default_shipping_address, u.preferences
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
      createdAt: row.created_at,
      defaultShippingAddress: row.default_shipping_address || null,
      preferences: row.preferences || {}
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
    createdAt: safeUser.created_at || safeUser.createdAt,
    defaultShippingAddress: safeUser.default_shipping_address || safeUser.defaultShippingAddress || null,
    preferences: safeUser.preferences || {}
  };
}

/**
 * Update authenticated user profile with strict privilege escalation prevention
 */
async function updateUserProfile(userId, updates = {}, ipAddress = null) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // 1. Strict Privilege Escalation Protection (Rule 8, Rule 9, Rule 20)
  if (updates.role !== undefined && updates.role !== null) {
    const err = new Error('Client role manipulation rejected. Roles are server-authoritative.');
    err.statusCode = 400;
    err.code = 'UNAUTHORIZED_ROLE_MODIFICATION';
    throw err;
  }

  // 2. Reject attempts to mutate immutable identifiers or security fields
  const forbiddenKeys = ['id', 'email', 'password_hash', 'passwordHash', 'is_active', 'isActive', 'created_at', 'createdAt'];
  for (const key of forbiddenKeys) {
    if (updates[key] !== undefined) {
      const err = new Error(`Field '${key}' is immutable and cannot be modified.`);
      err.statusCode = 400;
      err.code = 'IMMUTABLE_FIELD_MODIFICATION';
      throw err;
    }
  }

  // 3. Validate mutable fields
  let cleanName = null;
  if (updates.fullName !== undefined || updates.full_name !== undefined) {
    const nameVal = updates.fullName !== undefined ? updates.fullName : updates.full_name;
    if (typeof nameVal !== 'string' || nameVal.trim().length < 2) {
      const err = new Error('Full name must be at least 2 characters in length.');
      err.statusCode = 400;
      err.code = 'INVALID_NAME';
      throw err;
    }
    cleanName = nameVal.trim();
  }

  let cleanPhone = null;
  if (updates.phone !== undefined) {
    if (updates.phone !== null && updates.phone !== '') {
      if (typeof updates.phone !== 'string' || updates.phone.trim().length < 9) {
        const err = new Error('Phone number must be a valid string.');
        err.statusCode = 400;
        err.code = 'INVALID_PHONE';
        throw err;
      }
      cleanPhone = updates.phone.trim();

      // Ensure phone is unique across other users
      const phoneCheck = await query(`SELECT id FROM users WHERE phone = $1 AND id != $2`, [cleanPhone, userId]);
      if (phoneCheck.rows.length > 0) {
        const err = new Error('This phone number is already associated with another account.');
        err.statusCode = 409;
        err.code = 'PHONE_ALREADY_EXISTS';
        throw err;
      }
    } else {
      cleanPhone = null;
    }
  }

  let cleanAddress = null;
  if (updates.defaultShippingAddress !== undefined || updates.default_shipping_address !== undefined) {
    const addrVal = updates.defaultShippingAddress !== undefined ? updates.defaultShippingAddress : updates.default_shipping_address;
    if (addrVal !== null && typeof addrVal === 'object') {
      cleanAddress = [addrVal.street, addrVal.estate, addrVal.landmark, addrVal.county].filter(Boolean).join(', ');
    } else if (addrVal !== null) {
      cleanAddress = String(addrVal).trim();
    }
  }

  let cleanPrefs = null;
  if (updates.preferences !== undefined) {
    if (typeof updates.preferences !== 'object' || updates.preferences === null || Array.isArray(updates.preferences)) {
      const err = new Error('Preferences must be a key-value object.');
      err.statusCode = 400;
      err.code = 'INVALID_PREFERENCES';
      throw err;
    }
    cleanPrefs = updates.preferences;
  }

  // 4. Update in database
  const updatedRes = await query(
    `UPDATE users 
     SET full_name = COALESCE($1, full_name),
         phone = CASE WHEN $2::boolean THEN $3 ELSE phone END,
         default_shipping_address = CASE WHEN $4::boolean THEN $5 ELSE default_shipping_address END,
         preferences = CASE WHEN $6::boolean THEN $7::jsonb ELSE preferences END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $8
     RETURNING *`,
    [
      cleanName,
      updates.phone !== undefined,
      cleanPhone,
      (updates.defaultShippingAddress !== undefined || updates.default_shipping_address !== undefined),
      cleanAddress,
      updates.preferences !== undefined,
      cleanPrefs ? JSON.stringify(cleanPrefs) : null,
      userId
    ]
  );

  if (updatedRes.rows.length === 0) {
    const err = new Error('User account not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  return sanitizeUser(updatedRes.rows[0]);
}

/**
 * Change authenticated user password
 */
async function changeUserPassword(userId, currentPassword, newPassword, ipAddress = null) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  if (!currentPassword || typeof currentPassword !== 'string') {
    const err = new Error('Current password is required.');
    err.statusCode = 400;
    err.code = 'MISSING_CURRENT_PASSWORD';
    throw err;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters in length.');
    err.statusCode = 400;
    err.code = 'PASSWORD_TOO_SHORT';
    throw err;
  }

  if (currentPassword === newPassword) {
    const err = new Error('New password must be different from current password.');
    err.statusCode = 400;
    err.code = 'SAME_PASSWORD';
    throw err;
  }

  const userRes = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (userRes.rows.length === 0) {
    const err = new Error('User account not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const isMatch = await verifyPassword(currentPassword, userRes.rows[0].password_hash);
  if (!isMatch) {
    const err = new Error('Current password is incorrect.');
    err.statusCode = 400;
    err.code = 'INVALID_CURRENT_PASSWORD';
    throw err;
  }

  const newHash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [newHash, userId]
  );

  // Security notification: password changed
  try {
    const userRes = await query(`SELECT phone, email FROM users WHERE id = $1`, [userId]);
    const u = userRes.rows[0];
    const recipient = u?.email || u?.phone;
    const channel = u?.email ? 'EMAIL' : 'SMS';
    if (recipient) {
      notificationService.sendTransactionalNotification({
        userId,
        recipient,
        channel,
        templateId: 'PASSWORD_CHANGED',
        payload: { timestamp: new Date().toISOString() },
        resourceId: userId,
        ipAddress
      }).catch(() => {});
    }
  } catch {}

  return { success: true, message: 'Password changed successfully.' };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  resolveSession,
  invalidateSession,
  sanitizeUser,
  updateUserProfile,
  changeUserPassword
};
