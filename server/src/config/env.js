/**
 * Environment Configuration Loader & Validator
 * Conforms to EyeKart Phase 6.1 Backend Specification & Phase 2A Persistence Architecture
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env from workspace root if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const DEV_SESSION_SECRET = 'dev_session_secret_32_characters_minimum!';
const DEV_COOKIE_SECRET = 'dev_cookie_secret_32_characters_minimum!';

/**
 * Resolves database SSL configuration safely.
 * In development, defaults to false (no SSL for local postgres).
 * In production, when SSL is enabled, enforces strict certificate verification by default
 * and loads custom CA certificates from DB_SSL_CA or DB_SSL_CA_PATH.
 */
function resolveDbSsl(prodMode = isProd) {
  const sslRaw = (process.env.DB_SSL || '').trim().toLowerCase();
  const isEnabled = ['true', 'require', 'verify-full', 'verify-ca', '1'].includes(sslRaw);

  if (!isEnabled) {
    return false;
  }

  // Explicit bypass flag (must be explicitly and loudly named as insecure)
  const explicitInsecureBypass =
    process.env.DB_SSL_INSECURE_SKIP_VERIFY === 'true' ||
    process.env.DB_SSL_ALLOW_INSECURE === 'true' ||
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false';

  // In production, certificate verification is strictly enforced by default
  const rejectUnauthorized = !explicitInsecureBypass;

  const sslOpts = {
    rejectUnauthorized
  };

  // Support CA certificate from env var or mounted path
  if (process.env.DB_SSL_CA && process.env.DB_SSL_CA.trim()) {
    sslOpts.ca = process.env.DB_SSL_CA.trim();
  } else if (process.env.DB_SSL_CA_PATH && process.env.DB_SSL_CA_PATH.trim()) {
    try {
      sslOpts.ca = fs.readFileSync(process.env.DB_SSL_CA_PATH.trim(), 'utf8');
    } catch (err) {
      const sslErr = new Error(`[DB Config Fatal] Failed to read SSL CA certificate file at '${process.env.DB_SSL_CA_PATH}': ${err.message}`);
      sslErr.code = 'DB_SSL_CA_READ_ERROR';
      throw sslErr;
    }
  }

  if (explicitInsecureBypass) {
    console.warn('[DB Security Warning] Database SSL certificate verification is explicitly bypassed (rejectUnauthorized: false). NEVER use this in production with real patient data!');
  }

  return sslOpts;
}

/**
 * Validates configuration for production readiness.
 * Throws a fatal Error if required secrets, database, or storage parameters are missing or insecure in production.
 */
function validateConfig(cfg) {
  const targetConfig = cfg || config;
  if (targetConfig.isProd) {
    // 1. Session & Cookie secrets
    const sessionSecret = targetConfig.session?.secret;
    if (!sessionSecret || typeof sessionSecret !== 'string' || !sessionSecret.trim()) {
      throw new Error('[Security Fatal] SESSION_SECRET must be defined when running in production mode.');
    }
    if (sessionSecret === DEV_SESSION_SECRET || sessionSecret.includes('dev_session_secret')) {
      throw new Error('[Security Fatal] SESSION_SECRET cannot use insecure development default in production mode.');
    }
    if (sessionSecret.trim().length < 32) {
      throw new Error(`[Security Fatal] SESSION_SECRET must be at least 32 characters in production (got ${sessionSecret.trim().length}).`);
    }

    const cookieSecret = targetConfig.session?.cookieSecret;
    if (!cookieSecret || typeof cookieSecret !== 'string' || !cookieSecret.trim()) {
      throw new Error('[Security Fatal] COOKIE_SECRET must be defined when running in production mode.');
    }
    if (cookieSecret === DEV_COOKIE_SECRET || cookieSecret.includes('dev_cookie_secret')) {
      throw new Error('[Security Fatal] COOKIE_SECRET cannot use insecure development default in production mode.');
    }
    if (cookieSecret.trim().length < 32) {
      throw new Error(`[Security Fatal] COOKIE_SECRET must be at least 32 characters in production (got ${cookieSecret.trim().length}).`);
    }

    // 2. Database configuration
    const hasConnString = Boolean(targetConfig.db?.connectionString && targetConfig.db.connectionString.trim());
    const hasExplicitFields = Boolean(targetConfig.db?.host && targetConfig.db?.database && targetConfig.db?.user);
    if (!hasConnString && !hasExplicitFields) {
      throw new Error('[Database Fatal] Production database configuration required: specify DATABASE_URL or DB_HOST, DB_NAME, DB_USER.');
    }

    // Database SSL check in production
    if (targetConfig.db?.ssl) {
      if (targetConfig.db.ssl.rejectUnauthorized === false) {
        const explicitBypass = process.env.DB_SSL_INSECURE_SKIP_VERIFY === 'true' ||
                               process.env.DB_SSL_ALLOW_INSECURE === 'true' ||
                               process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false';
        if (!explicitBypass) {
          throw new Error('[Database Fatal] In production, database SSL cannot silently disable certificate verification (rejectUnauthorized: false). Provide a CA certificate via DB_SSL_CA or DB_SSL_CA_PATH, or set DB_SSL_INSECURE_SKIP_VERIFY=true for temporary staging compatibility.');
        }
      }
    }

    // 3. Storage configuration
    const storageProvider = (targetConfig.integrations?.storage?.provider || '').toUpperCase();
    if (storageProvider === 'LOCAL') {
      throw new Error('[Storage Fatal] LocalStorageProvider is not permitted in production mode. Set STORAGE_PROVIDER=S3 and configure cloud object storage.');
    }

    if (storageProvider === 'S3') {
      const s3 = targetConfig.integrations?.storage?.s3 || {};
      if (!s3.bucket || !s3.bucket.trim()) {
        throw new Error('[Storage Fatal] S3_BUCKET must be defined when running in production mode with S3 storage.');
      }
      if (!s3.accessKeyId || !s3.accessKeyId.trim()) {
        throw new Error('[Storage Fatal] S3_ACCESS_KEY_ID must be defined when running in production mode with S3 storage.');
      }
      if (!s3.secretAccessKey || !s3.secretAccessKey.trim()) {
        throw new Error('[Storage Fatal] S3_SECRET_ACCESS_KEY must be defined when running in production mode with S3 storage.');
      }
      if (!s3.region || !s3.region.trim()) {
        throw new Error('[Storage Fatal] S3_REGION must be defined when running in production mode with S3 storage.');
      }
    }

    // 4. CORS configuration
    const origins = targetConfig.cors?.origin;
    if (!origins || !Array.isArray(origins) || origins.length === 0 || origins.every(o => !o || !o.trim())) {
      throw new Error('[Security Fatal] CORS_ORIGIN must be explicitly configured in production mode.');
    }
    const hasLocalhost = origins.some(o => o.includes('localhost') || o.includes('127.0.0.1'));
    const allowLocalCorsInProd = process.env.ALLOW_LOCAL_CORS_IN_PROD === 'true';
    if (hasLocalhost && !allowLocalCorsInProd) {
      throw new Error('[Security Fatal] CORS_ORIGIN cannot contain localhost/127.0.0.1 in production mode. Specify authentic production origins (e.g. https://eyekart.co.ke).');
    }
  }
  return true;
}

const serverPort = parseInt(process.env.PORT || '3001', 10);
const serverHost = process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1');

const config = {
  env: process.env.NODE_ENV || 'development',
  isTest,
  isProd,
  port: serverPort,
  host: serverHost,
  server: {
    port: serverPort,
    host: serverHost,
    trustProxy: (function() {
      const tp = (process.env.TRUST_PROXY || '').trim().toLowerCase();
      if (tp === 'true' || tp === '1') return true;
      if (tp === 'false' || tp === '0') return false;
      if (tp) return tp;
      return isProd;
    })(),
    shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10)
  },
  rateLimit: {
    maxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10)
  },
  db: {
    connectionString: process.env.DATABASE_URL || process.env.DB_URL || null,
    host: isTest ? (process.env.TEST_DB_HOST || '127.0.0.1') : (process.env.DB_HOST || '127.0.0.1'),
    port: parseInt((isTest ? process.env.TEST_DB_PORT : process.env.DB_PORT) || '5432', 10),
    user: (isTest ? process.env.TEST_DB_USER : process.env.DB_USER) || 'postgres',
    password: (isTest ? process.env.TEST_DB_PASSWORD : process.env.DB_PASSWORD) || '',
    database: isTest ? (process.env.TEST_DB_NAME || 'eyekart_test') : (process.env.DB_NAME || 'eyekart_dev'),
    ssl: resolveDbSsl(isProd),
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10)
  },
  session: {
    secret: process.env.SESSION_SECRET || DEV_SESSION_SECRET,
    cookieSecret: process.env.COOKIE_SECRET || DEV_COOKIE_SECRET,
    ttlHours: parseInt(process.env.SESSION_TTL_HOURS || '24', 10)
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://127.0.0.1:3000,http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean)
  },
  integrations: {
    mpesa: {
      environment: (process.env.MPESA_ENVIRONMENT || 'DISABLED').toUpperCase(),
      consumerKey: process.env.MPESA_CONSUMER_KEY || '',
      consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
      passkey: process.env.MPESA_PASSKEY || '',
      shortCode: process.env.MPESA_SHORTCODE || '174379',
      callbackUrl: process.env.MPESA_CALLBACK_URL || 'http://localhost:3001/api/webhooks/mpesa',
      webhookSecret: process.env.MPESA_WEBHOOK_SECRET || ''
    },
    storage: {
      provider: (process.env.STORAGE_PROVIDER || (isProd ? 'S3' : 'LOCAL')).toUpperCase(),
      uploadDir: process.env.STORAGE_UPLOAD_DIR || path.resolve(__dirname, '../../../uploads'),
      s3: {
        bucket: process.env.S3_BUCKET || '',
        region: process.env.S3_REGION || 'af-south-1',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        endpoint: process.env.S3_ENDPOINT || '',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        presignedExpirySeconds: parseInt(process.env.S3_PRESIGNED_EXPIRY_SECONDS || '900', 10)
      }
    },
    notifications: {
      provider: process.env.NOTIFICATION_PROVIDER || 'TEST',
      smsSenderId: process.env.SMS_SENDER_ID || 'EyeKart'
    },
    courier: {
      provider: process.env.COURIER_PROVIDER || 'TEST'
    },
    tax: {
      provider: process.env.TAX_PROVIDER || 'TEST'
    }
  }
};

// Fail fast on startup in production if secrets are invalid or absent
validateConfig(config);

config.validateConfig = validateConfig;
config.resolveDbSsl = resolveDbSsl;
config.DEV_SESSION_SECRET = DEV_SESSION_SECRET;
config.DEV_COOKIE_SECRET = DEV_COOKIE_SECRET;

module.exports = config;
