/**
 * Authentication & Authorization Middleware
 * Enforces server-side identity and RBAC; client role claims are NEVER trusted.
 */
const { resolveSession } = require('../services/authService');

/**
 * Hook to extract session token from cookie or Authorization header
 */
async function authenticate(req, reply) {
  let token = null;

  // 1. Check HTTP-only cookie
  if (req.cookies && req.cookies.eyekart_session) {
    token = req.cookies.eyekart_session;
  }

  // 2. Fallback to Authorization: Bearer <token>
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    req.user = null;
    req.sessionId = null;
    return;
  }

  const session = await resolveSession(token);
  if (session) {
    req.user = session.user;
    req.sessionId = session.sessionId;
  } else {
    req.user = null;
    req.sessionId = null;
  }
}

/**
 * Middleware: Require an active authenticated session
 */
async function requireAuth(req, reply) {
  if (!req.user) {
    return reply.status(401).send({
      success: false,
      error: 'Authentication required. Please log in.',
      code: 'UNAUTHENTICATED'
    });
  }
}

/**
 * Middleware: Require a specific server-verified role
 */
function requireRole(requiredRole) {
  return async function (req, reply) {
    if (!req.user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required.',
        code: 'UNAUTHENTICATED'
      });
    }

    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(req.user.role)) {
      return reply.status(403).send({
        success: false,
        error: `Access forbidden. Required role: ${allowed.join(', ')}`,
        code: 'FORBIDDEN'
      });
    }
  };
}

/**
 * Middleware: Require one of several allowed roles
 */
function requireAnyRole(allowedRoles = []) {
  return async function (req, reply) {
    if (!req.user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required.',
        code: 'UNAUTHENTICATED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return reply.status(403).send({
        success: false,
        error: `Access forbidden. Permitted roles: ${allowedRoles.join(', ')}`,
        code: 'FORBIDDEN'
      });
    }
  };
}

module.exports = {
  authenticate,
  requireAuth,
  requireRole,
  requireAnyRole
};
