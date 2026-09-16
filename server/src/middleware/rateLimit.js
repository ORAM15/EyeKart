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
const defaultMax = config.rateLimit?.maxRequests || 5;
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

module.exports = {
  RateLimiter,
  MemoryRateLimitStore,
  rateLimitAuth,
  resetRateLimiter,
  authLimiter
};
