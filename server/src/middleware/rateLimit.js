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

// ---------------------------------------------------------------------------
// Stage 2 slice F: per-route limiters for payment-adjacent, upload,
// appointment and order routes. Same in-process MemoryRateLimitStore and
// same IP keying as rateLimitAuth (with trustProxy: true in prod, req.ip
// is already derived from X-Forwarded-For by Fastify; the header fallback
// only matters when the proxy is not trusted). Limits are per IP per
// minute and deliberately human-scale — a real checkout/booking flow
// makes a handful of calls; floods and credentialed-abuse loops make
// hundreds. Deliberately NOT applied: notifications (already has its own
// 60/min limiter) and the M-PESA webhook callbacks (unauthenticated
// gateway callbacks with retry behaviour — rate-limiting them would drop
// legitimate payment confirmations).
// ---------------------------------------------------------------------------

// Generic factory: builds a preHandler middleware backed by its own
// RateLimiter instance. `label` appears in the 429 message.
function makeRateLimit(maxRequests, windowMs, label) {
  const limiter = new RateLimiter(maxRequests, windowMs);
  return function rateLimitRoute(req, reply, done) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    if (!limiter.isAllowed(ip)) {
      const retrySecs = Math.ceil(limiter.windowMs / 1000);
      reply.header('Retry-After', retrySecs);
      reply.status(429).send({
        success: false,
        error: `Too many ${label} requests. Please try again in ${retrySecs} seconds.`,
        code: 'RATE_LIMITED'
      });
      return;
    }
    done();
  };
}

// 30/min: payment initiation hits the Daraja gateway and creates payment
// attempts; the same limiter covers status polling (a checkout flow
// polling every 2s stays well under it) and the dev-only demo endpoints.
const rateLimitPayments = makeRateLimit(30, 60000, 'payment');
// 30/min: quote generation is unauthenticated and does pricing work, so
// it needs a limit even though a human re-quotes rarely.
const rateLimitCheckout = makeRateLimit(30, 60000, 'checkout');
// 30/min: order creation / listing / cancellation for one shopper.
const rateLimitOrders = makeRateLimit(30, 60000, 'order');
// 60/min: availability is a public, pollable endpoint (date-picker
// browsing), so it gets the loosest write-adjacent limit; booking writes
// are additionally guarded by slot atomicity + idempotency keys.
const rateLimitAppointments = makeRateLimit(60, 60000, 'appointment');
// 20/min: upload intents and confirm-upload carry up to 10MB base64
// bodies and write documents; 20/min still lets a human upload several
// prescriptions in a row while blocking bulk upload floods.
const rateLimitStorage = makeRateLimit(20, 60000, 'storage');

function resetRateLimiter() {
  authLimiter.reset();
}

module.exports = {
  RateLimiter,
  MemoryRateLimitStore,
  rateLimitAuth,
  resetRateLimiter,
  authLimiter,
  makeRateLimit,
  rateLimitPayments,
  rateLimitCheckout,
  rateLimitOrders,
  rateLimitAppointments,
  rateLimitStorage
};
