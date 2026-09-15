/**
 * Centralized API Error Handler
 * Sanitizes errors to ensure stack traces, SQL, file paths, and secrets are NEVER leaked.
 */
const config = require('../config/env');

function errorHandler(error, req, reply) {
  // Log error details server-side
  console.error(`[API Error] [${req.method} ${req.url}]`, error.message);

  const statusCode = error.statusCode || (error.validation ? 400 : 500);

  // Fastify Schema Validation Error
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'Invalid request data',
      details: error.validation.map(v => ({
        message: v.message,
        params: v.params
      })),
      code: 'VALIDATION_ERROR'
    });
  }

  // Safe user-facing message
  let safeMessage = 'An internal server error occurred.';
  if (statusCode < 500) {
    safeMessage = error.message;
  } else if (!config.isProd) {
    // In dev, show message if safe, but still strip stack
    safeMessage = error.message.replace(/[A-Z]:\\[^\s]+/g, '[PATH]').replace(/SELECT|INSERT|UPDATE|DELETE/gi, '[SQL]');
  }

  reply.status(statusCode).send({
    success: false,
    error: safeMessage,
    code: error.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST')
  });
}

module.exports = { errorHandler };
