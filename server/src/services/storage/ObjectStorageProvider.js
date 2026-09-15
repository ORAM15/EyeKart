/**
 * EyeKart Phase 6.6 Object Storage Provider Base Interface
 * Defines abstract contract for secure prescription and clinical document storage.
 */

class ObjectStorageProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Create an upload intent ticket or presigned upload URL
   */
  async createUploadIntent(params) {
    throw new Error(`createUploadIntent() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Save / commit an uploaded object into storage
   */
  async saveObject(params) {
    throw new Error(`saveObject() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Generate download URL or read stream
   */
  async getDownloadUrl(params) {
    throw new Error(`getDownloadUrl() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Retrieve file buffer / stream directly
   */
  async getObject(params) {
    throw new Error(`getObject() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Delete an object
   */
  async deleteObject(params) {
    throw new Error(`deleteObject() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = ObjectStorageProvider;
