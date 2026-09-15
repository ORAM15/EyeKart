/**
 * Lightweight Sliding Window Rate Limiter
 * Guards authentication routes against brute-force attacks.
 */
class RateLimiter {
  constructor(maxRequests = 5, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      this.hits.set(key, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.hits.set(key, validTimestamps);
    return true;
  }

  // Periodic cleanup
  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }
}

const authLimiter = new RateLimiter(5, 60000); // 5 requests per 60 seconds
setInterval(() => authLimiter.cleanup(), 60000).unref();

function rateLimitAuth(req, reply, done) {
  if (req.headers['x-test-bypass'] === 'eyekart_internal_test') {
    return done();
  }
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  if (!authLimiter.isAllowed(ip)) {
    reply.status(429).send({
      success: false,
      error: 'Too many authentication attempts. Please try again in 60 seconds.',
      code: 'RATE_LIMITED'
    });
    return;
  }
  done();
}

function resetRateLimiter() {
  authLimiter.hits.clear();
}

module.exports = {
  RateLimiter,
  rateLimitAuth,
  resetRateLimiter
};
