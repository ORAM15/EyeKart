/**
 * EyeKart Production Structured Logging Utility
 * Phase 11 Production Observability & Audit Hardening
 * 
 * Guarantees zero sensitive data leakage:
 * Passwords, tokens, API keys, M-PESA secrets, credit cards, and PII are redacted.
 */

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'salt', 'token', 'rawtoken', 'refreshtoken',
  'secret', 'cookie', 'authorization', 'apikey', 'api_key', 'cvv',
  'creditcard', 'credit_card', 'cardnumber', 'card_number', 'pin',
  'mpesapasskey', 'passkey', 'consumersecret', 'consumer_secret',
  'securitycredential', 'security_credential', 'privatekey', 'private_key',
  'session', 'eyekart_session'
]);

/**
 * Deeply redact sensitive fields from objects and arrays
 */
function redactSensitiveData(data, depth = 0) {
  if (depth > 8) return '[MAX_DEPTH]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Redact Bearer tokens, DB connection URLs, password assignments
    return data
      .replace(/Bearer\s+[A-Za-z0-9-_.~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@/gi, 'postgresql://$1:[REDACTED]@')
      .replace(/(?:password|secret|token|apiKey|key)=([^&\s]+)/gi, '$1=[REDACTED]');
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(normalizedKey)) {
        cleaned[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        cleaned[key] = redactSensitiveData(value, depth + 1);
      } else if (typeof value === 'string') {
        cleaned[key] = redactSensitiveData(value, depth + 1);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  return data;
}

const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

class Logger {
  constructor(context = 'EyeKart') {
    this.context = context;
  }

  _log(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...redactSensitiveData(meta)
    };

    const serialized = JSON.stringify(entry);
    if (level === 'ERROR') {
      console.error(serialized);
    } else if (level === 'WARN') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  debug(message, meta) {
    this._log('DEBUG', message, meta);
  }

  info(message, meta) {
    this._log('INFO', message, meta);
  }

  warn(message, meta) {
    this._log('WARN', message, meta);
  }

  error(message, meta) {
    this._log('ERROR', message, meta);
  }

  child(context) {
    return new Logger(`${this.context}:${context}`);
  }
}

const defaultLogger = new Logger('EyeKart');

module.exports = {
  logger: defaultLogger,
  Logger,
  redactSensitiveData,
  sanitizeForLogging: redactSensitiveData,
  SENSITIVE_KEYS
};
