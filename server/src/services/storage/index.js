/**
 * EyeKart Storage Provider Factory & Registry
 * Phase 2A Persistence & Object Storage Foundation
 */
const LocalStorageProvider = require('./LocalStorageProvider');
const S3StorageProvider = require('./S3StorageProvider');
const ObjectStorageProvider = require('./ObjectStorageProvider');
const config = require('../../config/env');

/**
 * Returns the configured storage provider according to runtime environment.
 * In development, defaults to LocalStorageProvider.
 * In production, enforces S3StorageProvider and strictly forbids silent local fallback.
 */
function getStorageProvider(overrideName) {
  const providerType = (overrideName || config.integrations?.storage?.provider || process.env.STORAGE_PROVIDER || (config.isProd ? 'S3' : 'LOCAL')).toUpperCase();

  if (providerType === 'S3') {
    const s3Config = config.integrations?.storage?.s3 || {};
    const s3Provider = new S3StorageProvider({
      bucket: s3Config.bucket,
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
      forcePathStyle: s3Config.forcePathStyle,
      presignedExpirySeconds: s3Config.presignedExpirySeconds
    });

    if (config.isProd && !s3Provider.isConfigured) {
      const err = new Error('[Storage Fatal] Production environment requires configured S3/R2 cloud storage. Missing S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, or S3_REGION.');
      err.code = 'STORAGE_NOT_CONFIGURED';
      throw err;
    }

    return s3Provider;
  }

  if (providerType === 'LOCAL') {
    if (config.isProd) {
      const err = new Error('[Storage Fatal] LocalStorageProvider cannot be used in production mode. Configure STORAGE_PROVIDER=S3 with valid S3/R2 credentials.');
      err.code = 'LOCAL_STORAGE_IN_PROD_FORBIDDEN';
      throw err;
    }
    return new LocalStorageProvider({
      uploadDir: config.integrations?.storage?.uploadDir
    });
  }

  const err = new Error(`[Storage Fatal] Unsupported storage provider '${providerType}'. Supported providers: 'LOCAL', 'S3'.`);
  err.code = 'INVALID_STORAGE_PROVIDER';
  throw err;
}

module.exports = {
  ObjectStorageProvider,
  LocalStorageProvider,
  S3StorageProvider,
  getStorageProvider
};
