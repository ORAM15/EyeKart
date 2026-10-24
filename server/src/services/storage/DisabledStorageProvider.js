/**
 * DisabledStorageProvider — explicit opt-in "no object storage" mode.
 *
 * Purpose: let a first/preview deployment boot and serve the storefront
 * (catalog, 3D studio, VTO, pages) without any S3/R2 bucket configured.
 * This is NOT a silent fallback: it must be selected explicitly with
 * STORAGE_PROVIDER=DISABLED, and every storage operation fails loudly
 * with STORAGE_PROVIDER_DISABLED so nothing pretends an upload worked.
 *
 * Production safety rules stay intact: LOCAL is still forbidden in
 * production, and S3 still requires full credentials when selected.
 * To enable uploads later, set STORAGE_PROVIDER=S3 with real credentials.
 */
const ObjectStorageProvider = require('./ObjectStorageProvider');

function disabledError(method) {
  const err = new Error(
    `[DisabledStorageProvider] Storage is disabled (STORAGE_PROVIDER=DISABLED). ` +
    `Configure S3/R2 credentials to enable ${method}.`
  );
  err.code = 'STORAGE_PROVIDER_DISABLED';
  return err;
}

class DisabledStorageProvider extends ObjectStorageProvider {
  constructor() {
    super('DISABLED');
    this.isConfigured = false;
  }

  async createUploadIntent() { throw disabledError('createUploadIntent'); }
  async saveObject() { throw disabledError('saveObject'); }
  async getDownloadUrl() { throw disabledError('getDownloadUrl'); }
  async getObject() { throw disabledError('getObject'); }
  async deleteObject() { throw disabledError('deleteObject'); }
}

module.exports = DisabledStorageProvider;
