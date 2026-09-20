/**
 * Centralized API Error Handler
 * Phase 11 Production Observability, Diagnostic Classification & Reliability Hardening
 *
 * Sanitizes errors to ensure stack traces, SQL, connection strings, file paths,
 * and secrets are NEVER leaked to the client while retaining rich diagnostic context
 * in internal structured logs.
 */
const config = require('../config/env');
const { redactSensitiveData } = require('../utils/logger');

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
  const reqId = req.id || req.headers['x-correlation-id'] || req.headers['x-request-id'] || 'unknown';

  let statusCode = error.statusCode || (error.validation ? 400 : 500);
  let errorCode = error.code || 'INTERNAL_ERROR';
  let safeMessage = 'Internal Server Error';
  let errorCategory = 'SYSTEM';

  // 1. Fastify Schema Validation Error
  if (error.validation) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorCategory = 'VALIDATION';
    safeMessage = 'Invalid request data';

    req.log.warn({
      correlationId: reqId,
      method: req.method,
      url: req.url,
      statusCode,
      errorCode,
      errorCategory,
      validation: error.validation
    }, `[API Validation Error] ${req.method} ${req.url}: ${error.message}`);

    return reply.status(400).send({
      success: false,
      error: {
        message: safeMessage,
        code: errorCode,
        requestId: reqId,
        correlationId: reqId
      },
      details: error.validation.map(v => ({
        message: sanitizeMessage(v.message),
        params: v.params
      })),
      code: errorCode,
      message: safeMessage,
      requestId: reqId,
      correlationId: reqId
    });
  }

  // 2. Safe Database Error Classification
  const isPostgresError = error.code && typeof error.code === 'string' && (/^[0-9A-Z]{5}$/.test(error.code) || error.name === 'DatabaseError');
  if (isPostgresError) {
    errorCategory = 'DATABASE';
    if (error.code === '23505') {
      // Unique violation
      statusCode = 409;
      errorCode = 'DUPLICATE_RESOURCE';
      safeMessage = 'The requested resource or a conflicting record already exists.';
    } else if (error.code === '23514') {
      // Check constraint violation
      statusCode = 400;
      errorCode = 'CONSTRAINT_VIOLATION';
      safeMessage = 'Request violates data integrity constraints.';
    } else if (error.code === '23503') {
      // Foreign key violation
      statusCode = 400;
      errorCode = 'FOREIGN_KEY_VIOLATION';
      safeMessage = 'Referenced resource does not exist.';
    } else if (error.code === '40P01') {
      // Deadlock detected
      statusCode = 503;
      errorCode = 'DATABASE_DEADLOCK';
      safeMessage = 'Transaction conflict occurred. Please retry your request.';
    } else if (error.code === '57P01' || error.code === 'ECONNREFUSED' || error.message?.includes('Connection terminated')) {
      // Connection / pool error
      statusCode = 503;
      errorCode = 'DATABASE_UNAVAILABLE';
      safeMessage = 'Database service is temporarily unavailable. Please retry shortly.';
    } else {
      statusCode = 500;
      errorCode = 'DATABASE_ERROR';
      safeMessage = config.isProd ? 'Internal Server Error' : (sanitizeMessage(error.message) || 'Database query error');
    }
  } else if (error.isProviderError || error.code === 'PROVIDER_DISABLED' || error.code === 'PROVIDER_ERROR' || error.code === 'PROVIDER_TIMEOUT') {
    // 3. External Provider Failure Classification
    errorCategory = 'EXTERNAL_PROVIDER';
    statusCode = error.statusCode || 503;
    errorCode = error.code || 'PROVIDER_UNAVAILABLE';
    safeMessage = sanitizeMessage(error.message) || 'External provider service unavailable.';
  } else if (statusCode < 500) {
    // 4. Expected Client/Business Errors (4xx)
    errorCategory = 'BUSINESS_LOGIC';
    safeMessage = sanitizeMessage(error.message);
    errorCode = error.code || 'BAD_REQUEST';
  } else {
    // 5. Unhandled Internal Server Errors (5xx)
    errorCategory = 'SYSTEM';
    safeMessage = config.isProd ? 'Internal Server Error' : (sanitizeMessage(error.message) || 'Internal Server Error');
    errorCode = error.code || 'INTERNAL_ERROR';
  }

  // Structured Internal Log via Pino (rich diagnostic context, never sent to client)
  const logPayload = {
    correlationId: reqId,
    method: req.method,
    url: req.url,
    statusCode,
    errorCode,
    errorCategory,
    errorMessage: error.message,
    stack: config.isProd ? undefined : error.stack,
    actorId: req.user?.id || 'ANONYMOUS',
    actorRole: req.user?.role || 'ANONYMOUS'
  };

  if (statusCode >= 500) {
    req.log.error(redactSensitiveData(logPayload), `[API Fatal Error] ${req.method} ${req.url} (${errorCode}): ${error.message}`);
  } else {
    req.log.warn(redactSensitiveData(logPayload), `[API Client Warning] ${req.method} ${req.url} (${errorCode}): ${error.message}`);
  }

  reply.status(statusCode).send({
    success: false,
    error: {
      message: safeMessage,
      code: errorCode,
      requestId: reqId,
      correlationId: reqId
    },
    code: errorCode,
    message: safeMessage,
    requestId: reqId,
    correlationId: reqId
  });
}

module.exports = { errorHandler, sanitizeMessage };
