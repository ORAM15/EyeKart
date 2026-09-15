/**
 * EyeKart Phase 6.6 Local Storage Provider
 * Implements ObjectStorageProvider for local development, sandbox, and automated testing.
 * Stores files securely in server/uploads with unique object keys.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ObjectStorageProvider = require('./ObjectStorageProvider');

class LocalStorageProvider extends ObjectStorageProvider {
  constructor(config = {}) {
    super('LOCAL');
    this.uploadDir = path.resolve(config.uploadDir || path.join(__dirname, '../../../uploads'));
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Create an upload intent with a tamper-resistant token
   */
  async createUploadIntent({ userId, purpose = 'PRESCRIPTION', fileName, mimeType, fileSize }) {
    const safeName = path.basename(fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = crypto.randomUUID();
    const objectKey = `${purpose.toLowerCase()}/${userId}/${Date.now()}-${uniqueId}-${safeName}`;
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    return {
      provider: 'LOCAL',
      objectKey,
      uploadToken: token,
      expiresAt: expiresAt.toISOString(),
      maxSizeBytes: 10 * 1024 * 1024 // 10MB
    };
  }

  _resolveSafePath(objectKey) {
    const root = path.resolve(this.uploadDir);
    const resolved = path.resolve(this.uploadDir, objectKey || '');
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      const err = new Error(`Path traversal attempt detected: '${objectKey}'`);
      err.statusCode = 400;
      err.code = 'PATH_TRAVERSAL_DETECTED';
      throw err;
    }
    return resolved;
  }

  /**
   * Commit file buffer into local storage
   */
  async saveObject({ objectKey, buffer, mimeType }) {
    const fullPath = this._resolveSafePath(objectKey);
    const parentDir = path.dirname(fullPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, buffer);

    return {
      objectKey,
      storagePath: fullPath,
      sizeBytes: buffer.length,
      mimeType
    };
  }

  /**
   * Read stored object buffer
   */
  async getObject({ objectKey }) {
    const fullPath = this._resolveSafePath(objectKey);
    if (!fs.existsSync(fullPath)) {
      const err = new Error(`Object '${objectKey}' not found on storage.`);
      err.statusCode = 404;
      err.code = 'OBJECT_NOT_FOUND';
      throw err;
    }
    return fs.promises.readFile(fullPath);
  }

  /**
   * Generate download URL
   */
  async getDownloadUrl({ documentId, objectKey, expiresInSeconds = 3600 }) {
    return `/api/storage/documents/${documentId}/file`;
  }

  /**
   * Delete stored object
   */
  async deleteObject({ objectKey }) {
    const fullPath = this._resolveSafePath(objectKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }
}

module.exports = LocalStorageProvider;
