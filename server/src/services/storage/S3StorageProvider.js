/**
 * EyeKart Phase 2A S3 & Cloudflare R2 Storage Provider
 * Implements ObjectStorageProvider using official AWS SDK v3 (@aws-sdk/client-s3).
 * Supports AWS S3, Cloudflare R2, MinIO, and other S3-compatible object storage backends.
 * Enforces server-side encryption at rest (AES256) and private access via presigned URLs.
 */
const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const ObjectStorageProvider = require('./ObjectStorageProvider');

class S3StorageProvider extends ObjectStorageProvider {
  constructor(config = {}) {
    super('S3');
    this.bucket = config.bucket || process.env.S3_BUCKET || '';
    this.region = config.region || process.env.S3_REGION || 'af-south-1';
    this.endpoint = config.endpoint || process.env.S3_ENDPOINT || '';
    this.accessKeyId = config.accessKeyId || process.env.S3_ACCESS_KEY_ID || '';
    this.secretAccessKey = config.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '';
    this.forcePathStyle = config.forcePathStyle ?? (process.env.S3_FORCE_PATH_STYLE === 'true');
    this.presignedExpirySeconds = parseInt(config.presignedExpirySeconds || process.env.S3_PRESIGNED_EXPIRY_SECONDS || '900', 10);

    this._client = null;
  }

  get isConfigured() {
    return Boolean(this.bucket && this.accessKeyId && this.secretAccessKey && this.region);
  }

  /**
   * Lazily initializes and returns the S3Client instance.
   */
  getClient() {
    if (!this._client) {
      if (!this.isConfigured) {
        const err = new Error('[S3StorageProvider] S3/R2 storage is not configured. Missing S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, or S3_REGION.');
        err.code = 'STORAGE_PROVIDER_DISABLED';
        err.statusCode = 503;
        throw err;
      }

      const clientConfig = {
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey
        }
      };

      // Support custom endpoint (Cloudflare R2 or MinIO)
      if (this.endpoint && this.endpoint.trim()) {
        clientConfig.endpoint = this.endpoint.trim();
      }

      if (this.forcePathStyle) {
        clientConfig.forcePathStyle = true;
      }

      this._client = new S3Client(clientConfig);
    }
    return this._client;
  }

  /**
   * Create a secure presigned upload URL for direct client-to-bucket upload.
   */
  async createUploadIntent({ userId, purpose = 'PRESCRIPTION', fileName, mimeType, fileSize }) {
    const client = this.getClient();

    const safeName = path.basename(fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = crypto.randomUUID();
    const objectKey = `${purpose.toLowerCase()}/${userId}/${Date.now()}-${uniqueId}-${safeName}`;
    const cleanMime = (mimeType || 'application/pdf').toLowerCase();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: cleanMime,
      ServerSideEncryption: 'AES256'
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: this.presignedExpirySeconds
    });

    const expiresAt = new Date(Date.now() + this.presignedExpirySeconds * 1000).toISOString();

    return {
      provider: 'S3',
      bucket: this.bucket,
      region: this.region,
      objectKey,
      uploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': cleanMime
      },
      expiresAt,
      maxSizeBytes: 10 * 1024 * 1024 // 10MB limit
    };
  }

  /**
   * Directly save a file buffer into the S3 bucket with server-side encryption.
   */
  async saveObject({ objectKey, buffer, mimeType }) {
    const client = this.getClient();
    const cleanMime = (mimeType || 'application/octet-stream').toLowerCase();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: cleanMime,
      ServerSideEncryption: 'AES256'
    });

    await client.send(command);

    return {
      objectKey,
      storagePath: `s3://${this.bucket}/${objectKey}`,
      sizeBytes: buffer.length,
      mimeType: cleanMime
    };
  }

  /**
   * Generate a time-limited presigned download URL for private medical documents.
   */
  async getDownloadUrl({ documentId, objectKey, expiresInSeconds }) {
    const client = this.getClient();
    const expiry = expiresInSeconds || this.presignedExpirySeconds;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });

    return getSignedUrl(client, command, { expiresIn: expiry });
  }

  /**
   * Stream / retrieve file binary buffer from S3.
   */
  async getObject({ objectKey }) {
    const client = this.getClient();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });

    const response = await client.send(command);
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  /**
   * Delete an object from the S3 bucket.
   */
  async deleteObject({ objectKey }) {
    const client = this.getClient();

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });

    await client.send(command);
    return true;
  }
}

module.exports = S3StorageProvider;
