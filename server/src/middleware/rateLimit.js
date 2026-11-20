/**
 * EyeKart Authentication Rate Limiter (Phase 2B Hardened)
 * Guards authentication routes (/api/auth/login, /api/auth/register) against brute-force attacks.
 * 
 * ARCHITECTURAL NOTE ON DISTRIBUTED PRODUCTION:
 * This default implementation uses an in-process MemoryRateLimitStore. For single-instance
 * or sticky-session deployments, this provides robust brute-force mitigation without external dependencies.
 * For multi-instance horizontal scaling without sticky sessions, a RedisRateLimitStore can be
 * plugged into RateLimiter without altering the middleware route contracts.
 */
const config = require('../config/env');

class MemoryRateLimitStore {
  constructor() {
    this.hits = new Map();
  }

  isAllowed(key, maxRequests, windowMs) {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      this.hits.set(key, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.hits.set(key, validTimestamps);
    return true;
  }

  cleanup(windowMs) {
    const now = Date.now();
    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }

  clear() {
    this.hits.clear();
  }
}

class RateLimiter {
  constructor(maxRequests = 5, windowMs = 60000, store = new MemoryRateLimitStore()) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = store;

    if (typeof this.store.cleanup === 'function') {
      this._cleanupInterval = setInterval(() => this.store.cleanup(this.windowMs), this.windowMs);
      if (this._cleanupInterval.unref) {
        this._cleanupInterval.unref();
      }
    }
  }

  isAllowed(key) {
    return this.store.isAllowed(key, this.maxRequests, this.windowMs);
  }

  reset() {
    this.store.clear();
  }
}

// Global authentication limiter instance using environment configuration
const defaultMax = config.rateLimit?.maxRequests || (config.isProd ? 5 : 100);
const defaultWindow = config.rateLimit?.windowMs || 60000;
const authLimiter = new RateLimiter(defaultMax, defaultWindow);

function rateLimitAuth(req, reply, done) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  if (!authLimiter.isAllowed(ip)) {
    const retrySecs = Math.ceil(authLimiter.windowMs / 1000);
    reply.header('Retry-After', retrySecs);
    reply.status(429).send({
      success: false,
      error: `Too many authentication attempts. Please try again in ${retrySecs} seconds.`,
      code: 'RATE_LIMITED'
    });
    return;
  }
  done();
}

function resetRateLimiter() {
  authLimiter.reset();
}

// ---------------------------------------------------------------------------
// Per-account limiters (Stage 2, slice E) — ADDITIVE, built on the existing
// MemoryRateLimitStore. The IP-only limiter above can be evaded by rotating
// the source IP (or the raw X-Forwarded-For value it keys on); keying by
// account identifier closes that evasion for the targeted account, because
// the bucket follows the account no matter which IP the attempt comes from.
//
// Same in-memory / multi-instance caveat as the header note: each process
// holds its own counters, so on a multi-instance deployment without sticky
// sessions these limits are per-instance. A shared store (e.g. Redis) would
// be needed to enforce them globally.
//
// Thresholds are deliberately generous: a legitimate user mistyping a
// password is unlikely to trip them, while credential stuffing against one
// account is capped at 20 guesses per 15 minutes. Accepted trade-off: an
// attacker who knows a victim's email can burn that account's login budget
// (a short lockout), so the threshold is kept high rather than tight; a
// failure-only counter would remove that trade-off but needs post-handler
// hooks and is left as a follow-up.
// ---------------------------------------------------------------------------

// Login attempts per account (normalised email): 20 per 15 minutes.
const accountLoginLimiter = new RateLimiter(20, 15 * 60 * 1000);
// Password-change attempts per authenticated user: 5 per 15 minutes.
const changePasswordLimiter = new RateLimiter(5, 15 * 60 * 1000);

function sendRateLimited(reply, retrySecs) {
  reply.header('Retry-After', retrySecs);
  reply.status(429).send({
    success: false,
    error: `Too many attempts. Please try again in ${retrySecs} seconds.`,
    code: 'RATE_LIMITED'
  });
}

function rateLimitLoginPerAccount(req, reply, done) {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // No usable account identifier: let the handler return its 400; do not
  // burn a per-account bucket on malformed input.
  if (!email) {
    done();
    return;
  }
  if (!accountLoginLimiter.isAllowed(`login:${email}`)) {
    sendRateLimited(reply, Math.ceil(accountLoginLimiter.windowMs / 1000));
    return;
  }
  done();
}

function rateLimitChangePasswordPerAccount(req, reply, done) {
  const userId = req.user && req.user.id;
  // requireAuth runs first in the preHandler chain, so req.user is set for
  // every request that reaches here. Fall back to the IP if it somehow is
  // not, so the endpoint is never left un-limited.
  const key = userId
    ? `change-password:${userId}`
    : `change-password:ip:${req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'}`;
  if (!changePasswordLimiter.isAllowed(key)) {
    sendRateLimited(reply, Math.ceil(changePasswordLimiter.windowMs / 1000));
    return;
  }
  done();
}

function resetAccountLimiters() {
  accountLoginLimiter.reset();
  changePasswordLimiter.reset();
}

module.exports = {
  RateLimiter,
  MemoryRateLimitStore,
  rateLimitAuth,
  resetRateLimiter,
  authLimiter,
  rateLimitLoginPerAccount,
  rateLimitChangePasswordPerAccount,
  resetAccountLimiters,
  accountLoginLimiter,
  changePasswordLimiter
};
