/**
 * Environment Configuration Loader & Validator
 * Conforms to EyeKart Phase 6.1 Backend Specification
 */
const path = require('path');
const dotenv = require('dotenv');

// Load .env from workspace root if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const DEV_SESSION_SECRET = 'dev_session_secret_32_characters_minimum!';
const DEV_COOKIE_SECRET = 'dev_cookie_secret_32_characters_minimum!';

/**
 * Validates configuration for production readiness.
 * Throws a fatal Error if required secrets are missing, insecure, or too short in production.
 */
function validateConfig(cfg) {
  const targetConfig = cfg || config;
  if (targetConfig.isProd) {
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
  }
  return true;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isTest,
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '127.0.0.1',
  db: {
    host: isTest ? (process.env.TEST_DB_HOST || '127.0.0.1') : (process.env.DB_HOST || '127.0.0.1'),
    port: parseInt((isTest ? process.env.TEST_DB_PORT : process.env.DB_PORT) || '5433', 10),
    user: (isTest ? process.env.TEST_DB_USER : process.env.DB_USER) || 'postgres',
    password: (isTest ? process.env.TEST_DB_PASSWORD : process.env.DB_PASSWORD) || '',
    database: isTest ? (process.env.TEST_DB_NAME || 'eyekart_test') : (process.env.DB_NAME || 'eyekart_dev'),
    ssl: (process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : false
  },
  session: {
    secret: process.env.SESSION_SECRET || 'dev_session_secret_32_characters_minimum!',
    cookieSecret: process.env.COOKIE_SECRET || 'dev_cookie_secret_32_characters_minimum!',
    ttlHours: parseInt(process.env.SESSION_TTL_HOURS || '24', 10)
  },
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://127.0.0.1:3000,http://localhost:3000').split(',').map(s => s.trim())
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
      provider: process.env.STORAGE_PROVIDER || 'LOCAL',
      uploadDir: process.env.STORAGE_UPLOAD_DIR || path.resolve(__dirname, '../../../uploads'),
      s3: {
        bucket: process.env.S3_BUCKET || '',
        region: process.env.S3_REGION || 'af-south-1',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        endpoint: process.env.S3_ENDPOINT || ''
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
config.DEV_SESSION_SECRET = DEV_SESSION_SECRET;
config.DEV_COOKIE_SECRET = DEV_COOKIE_SECRET;

module.exports = config;
