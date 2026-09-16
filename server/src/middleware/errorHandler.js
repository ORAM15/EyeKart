/**
 * Centralized API Error Handler
 * Sanitizes errors to ensure stack traces, SQL, file paths, and secrets are NEVER leaked.
 */
const config = require('../config/env');

function sanitizeMessage(msg) {
  if (typeof msg !== 'string') return '';
  return msg
    .replace(/[A-Za-z]:\\[^:\s]+/g, '[PATH]') // Windows paths
    .replace(/\/(?:[a-zA-Z0-9._-]+\/)+[a-zA-Z0-9._-]+/g, '[PATH]') // Unix paths
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@[^\s/]+/gi, '[DATABASE_URL]') // DB URLs
    .replace(/SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TABLE/gi, '[SQL]') // SQL keywords
    .replace(/(?:password|secret|token|key)=\S+/gi, '[REDACTED]');
}

function errorHandler(error, req, reply) {
  const reqId = req.id || req.headers['x-request-id'] || 'unknown';

  // Server-side diagnostic log (never exposed to client)
  console.error(`[API Error] [reqId: ${reqId}] [${req.method} ${req.url}]`, error.message);

  const statusCode = error.statusCode || (error.validation ? 400 : 500);

  // Fastify Schema Validation Error
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'Invalid request data',
      details: error.validation.map(v => ({
        message: sanitizeMessage(v.message),
        params: v.params
      })),
      code: 'VALIDATION_ERROR'
    });
  }

  // User-facing response message
  let safeMessage;
  if (statusCode >= 500) {
    // In production, internal server errors are completely opaque
    safeMessage = 'Internal Server Error';
    if (!config.isProd) {
      safeMessage = sanitizeMessage(error.message) || 'Internal Server Error';
    }
  } else {
    // Client error (4xx)
    safeMessage = sanitizeMessage(error.message);
  }

  const errorCode = error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

  reply.status(statusCode).send({
    success: false,
    error: {
      message: safeMessage,
      code: errorCode,
      requestId: reqId
    },
    code: errorCode,
    message: safeMessage,
    requestId: reqId
  });
}

module.exports = { errorHandler, sanitizeMessage };
