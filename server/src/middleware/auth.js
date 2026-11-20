/**
 * Authentication & Authorization Middleware
 * Enforces server-side identity and RBAC; client role claims are NEVER trusted.
 */
const { resolveSession } = require('../services/authService');
const { logAuditEvent } = require('../services/auditService');
const config = require('../config/env');

// ---------------------------------------------------------------------------
// CSRF protection (Stage 2, slice E) — strict Origin / Referer validation.
// Approach chosen: origin validation, NOT a double-submit CSRF token. The
// whole browser client is same-origin (or on the CORS allowlist in local
// dev), so no token plumbing is needed and the adapter needs no changes for
// this; a token scheme would add a second credential to issue, store and
// rotate for no extra protection here. SameSite=lax on the session cookie
// remains as an additional layer, not the only one.
//
// Two tiers, applied to every state-changing /api request (this hook is
// global — see app.js — so all cookie-authenticated routes are covered
// without editing each route file):
//  1. Cookie-authenticated request (session cookie present): the Origin
//     header (falling back to Referer) MUST be present and trusted —
//     same-origin, or an exact match in the CORS allowlist. Browsers
//     always send Origin on POST/PUT/PATCH/DELETE, so a missing or foreign
//     origin on a cookie request is a forged request. A '*' entry in the
//     CORS allowlist never matches: with credentials it is meaningless for
//     CORS and must not silently authorise every origin here.
//  2. No session cookie (unauthenticated endpoints such as login/register,
//     and Bearer-authenticated non-browser clients): a present-but-untrusted
//     Origin is still rejected — this blocks login CSRF from a browser —
//     while a missing Origin is allowed so curl / server-to-server /
//     scratch verification clients keep working.
// Exempt: /api/webhooks/* — unauthenticated M-PESA server-to-server
// callbacks carry no session cookie and no browser Origin; they must never
// be blocked by this check.
// ---------------------------------------------------------------------------
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT_PATH_PREFIXES = ['/api/webhooks/'];

/**
 * True when an Origin (or Referer) value belongs to this site: either the
 * host the request itself was sent to (same-origin), or an exact entry in
 * the configured CORS origin allowlist.
 */
function requestOriginIsTrusted(req, value) {
  if (!value || typeof value !== 'string') return false;
  let origin;
  try {
    origin = new URL(value).origin;
  } catch {
    return false;
  }
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch {
    return false;
  }
  const allowed = config.cors?.origin || [];
  return allowed.some((entry) => entry && entry !== '*' && entry === origin);
}

function csrfCheckPassed(req) {
  const url = req.url || '';
  if (!url.startsWith('/api/')) return true;
  if (CSRF_EXEMPT_PATH_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;
  if (!STATE_CHANGING_METHODS.has(req.method)) return true;

  const originTrusted = requestOriginIsTrusted(req, req.headers.origin);
  const refererTrusted = requestOriginIsTrusted(req, req.headers.referer);
  const hasSessionCookie = Boolean(req.cookies && req.cookies.eyekart_session);

  if (hasSessionCookie) {
    // Tier 1: cookie present — origin must be present and trusted.
    return originTrusted || refererTrusted;
  }
  // Tier 2: no cookie — only reject a present-but-untrusted Origin.
  if (req.headers.origin && !originTrusted) return false;
  return true;
}

/**
 * Hook to extract session token from cookie or Authorization header
 */
async function authenticate(req, reply) {
  // Reject forged cross-site state changes before any session is resolved.
  if (!csrfCheckPassed(req)) {
    return reply.status(403).send({
      success: false,
      error: 'Cross-site request rejected. This action must come from the EyeKart site.',
      code: 'CSRF_VALIDATION_FAILED'
    });
  }

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
      await logAuditEvent({
        actorId: req.user.id,
        actorRole: req.user.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        action: 'AUTHORIZATION_FAILURE',
        entity: 'Endpoint',
        entityId: req.url,
        correlationId: req.id,
        metadata: {
          path: req.url,
          method: req.method,
          requiredRole: allowed,
          userRole: req.user.role
        }
      });
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
      await logAuditEvent({
        actorId: req.user.id,
        actorRole: req.user.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        action: 'AUTHORIZATION_FAILURE',
        entity: 'Endpoint',
        entityId: req.url,
        correlationId: req.id,
        metadata: {
          path: req.url,
          method: req.method,
          permittedRoles: allowedRoles,
          userRole: req.user.role
        }
      });
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
  requireAnyRole,
  // Exported for verification / tests: the CSRF gate used by `authenticate`.
  csrfCheckPassed
};
