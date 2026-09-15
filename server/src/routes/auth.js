/**
 * Authentication & Identity Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET /api/me
 */
const { query } = require('../db/pool');
const { hashPassword, verifyPassword, createSession, invalidateSession, sanitizeUser } = require('../services/authService');
const { logAuditEvent } = require('../services/auditService');
const { requireAuth } = require('../middleware/auth');
const { rateLimitAuth } = require('../middleware/rateLimit');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authRoutes(fastify, options) {
  // 1. User Registration
  fastify.post('/api/auth/register', { preHandler: rateLimitAuth }, async (req, reply) => {
    const { email, password, fullName, phone, role } = req.body || {};

    // Input Validation
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return reply.status(400).send({
        success: false,
        error: 'A valid email address is required.',
        code: 'INVALID_EMAIL'
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return reply.status(400).send({
        success: false,
        error: 'Password must be at least 8 characters in length.',
        code: 'WEAK_PASSWORD'
      });
    }

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return reply.status(400).send({
        success: false,
        error: 'Full name must be at least 2 characters.',
        code: 'INVALID_NAME'
      });
    }

    // Role Manipulation Safeguard (Rule 8, Rule 9, Rule 20)
    // Client role claims are NEVER trusted. Self-registration is strictly CUSTOMER.
    if (role && role !== 'CUSTOMER') {
      await logAuditEvent({
        actorRole: 'ANONYMOUS',
        ipAddress: req.ip,
        action: 'PRIVILEGE_ESCALATION_ATTEMPT',
        entity: 'User',
        metadata: { attemptedRole: role, email: email.trim().toLowerCase() }
      });
      return reply.status(400).send({
        success: false,
        error: 'Client role manipulation rejected. Self-registration is strictly CUSTOMER role.',
        code: 'UNAUTHORIZED_ROLE_ASSIGNMENT'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim() : null;

    // Check existing email
    const existing = await query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({
        success: false,
        error: 'An account with this email address already exists.',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    if (cleanPhone) {
      const existingPhone = await query('SELECT id FROM users WHERE phone = $1', [cleanPhone]);
      if (existingPhone.rows.length > 0) {
        return reply.status(409).send({
          success: false,
          error: 'An account with this phone number already exists.',
          code: 'PHONE_ALREADY_EXISTS'
        });
      }
    }

    const pHash = await hashPassword(password);
    const insertRes = await query(
      `INSERT INTO users (email, phone, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4, 'CUSTOMER')
       RETURNING id, email, phone, full_name, role, created_at`,
      [cleanEmail, cleanPhone, fullName.trim(), pHash]
    );

    const newUser = insertRes.rows[0];
    const session = await createSession(newUser.id, req.ip, req.headers['user-agent']);

    // Set HTTP-only secure cookie
    reply.setCookie('eyekart_session', session.rawToken, {
      path: '/',
      httpOnly: true,
      secure: false, // Set true in production over HTTPS
      sameSite: 'lax',
      expires: session.expiresAt
    });

    // Audit Event
    await logAuditEvent({
      actorId: newUser.id,
      actorRole: newUser.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: newUser.id,
      metadata: { email: cleanEmail }
    });

    return reply.status(201).send({
      success: true,
      message: 'Account successfully registered.',
      token: session.rawToken,
      user: sanitizeUser(newUser)
    });
  });

  // 2. User Login
  fastify.post('/api/auth/login', { preHandler: rateLimitAuth }, async (req, reply) => {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return reply.status(400).send({
        success: false,
        error: 'Email and password are required.',
        code: 'MISSING_CREDENTIALS'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRes = await query(
      `SELECT id, email, phone, full_name, role, password_hash, is_active, created_at
       FROM users WHERE email = $1`,
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      await logAuditEvent({
        actorRole: 'ANONYMOUS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        action: 'LOGIN_FAILED',
        entity: 'User',
        metadata: { reason: 'User not found', email: cleanEmail }
      });
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      return reply.status(403).send({
        success: false,
        error: 'Account is deactivated.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      await logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
        metadata: { reason: 'Invalid password' }
      });
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const session = await createSession(user.id, req.ip, req.headers['user-agent']);

    reply.setCookie('eyekart_session', session.rawToken, {
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      expires: session.expiresAt
    });

    await logAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: user.id,
      metadata: { role: user.role }
    });

    return reply.send({
      success: true,
      message: 'Authentication successful.',
      token: session.rawToken,
      user: sanitizeUser(user)
    });
  });

  // 3. User Logout
  fastify.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    let token = req.cookies?.eyekart_session;
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      await invalidateSession(token);
    }

    reply.clearCookie('eyekart_session', { path: '/' });

    await logAuditEvent({
      actorId: req.user.id,
      actorRole: req.user.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      action: 'LOGOUT',
      entity: 'User',
      entityId: req.user.id
    });

    return reply.send({
      success: true,
      message: 'Session invalidated and logged out successfully.'
    });
  });

  // 4. Authenticated User Profile
  fastify.get('/api/me', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send({
      success: true,
      user: req.user
    });
  });
}

module.exports = authRoutes;
