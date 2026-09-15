/**
 * EyeKart Phase 6.6 S3 Storage Provider Boundary Stub
 * Implements ObjectStorageProvider for AWS S3 / Cloudflare R2 presigned URLs.
 * Defaults to DISABLED when cloud credentials are not supplied.
 */
const ObjectStorageProvider = require('./ObjectStorageProvider');

class S3StorageProvider extends ObjectStorageProvider {
  constructor(config = {}) {
    super('S3');
    this.bucket = config.bucket || process.env.S3_BUCKET || '';
    this.region = config.region || process.env.S3_REGION || 'af-south-1';
    this.endpoint = config.endpoint || process.env.S3_ENDPOINT || '';
    this.accessKeyId = config.accessKeyId || process.env.S3_ACCESS_KEY_ID || '';
    this.secretAccessKey = config.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '';
  }

  get isConfigured() {
    return Boolean(this.bucket && this.accessKeyId && this.secretAccessKey);
  }

  async createUploadIntent({ userId, purpose = 'PRESCRIPTION', fileName, mimeType }) {
    if (!this.isConfigured) {
      const err = new Error('S3 Storage Provider is not configured. Provide S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.');
      err.code = 'STORAGE_PROVIDER_DISABLED';
      err.statusCode = 503;
      throw err;
    }

    const objectKey = `${purpose.toLowerCase()}/${userId}/${Date.now()}-${fileName}`;
    return {
      provider: 'S3',
      bucket: this.bucket,
      region: this.region,
      objectKey,
      uploadUrl: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${objectKey}?mock_presigned=true`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
  }

  async saveObject() {
    throw new Error('Direct server-side saveObject is not supported for S3. Use presigned upload URLs.');
  }

  async getDownloadUrl({ objectKey, expiresInSeconds = 3600 }) {
    if (!this.isConfigured) {
      const err = new Error('S3 Storage Provider is not configured.');
      err.code = 'STORAGE_PROVIDER_DISABLED';
      err.statusCode = 503;
      throw err;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${objectKey}?mock_presigned_download=true&expires=${expiresInSeconds}`;
  }

  async getObject() {
    throw new Error('S3 getObject deferred to presigned download URLs.');
  }

  async deleteObject({ objectKey }) {
    return true;
  }
}

module.exports = S3StorageProvider;
