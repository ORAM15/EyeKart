/**
 * EyeKart Phase 6.6 Secure Storage Routes
 * Handles upload intents, file ingestion, IDOR access controls, and optometrist RBAC.
 */
const { requireAuth } = require('../middleware/auth');
const { getStorageProvider } = require('../services/storage');
const { query } = require('../db/pool');
const { logAuditEvent } = require('../services/auditService');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const CLINICAL_ROLES = ['OPTOMETRIST', 'ADMIN', 'LAB_TECH', 'STORE_STAFF'];

// Initialize storage provider based on environment and configuration
const storageProvider = getStorageProvider();

async function storageRoutes(fastify, options) {
  // 1. POST /api/storage/upload-intent - Issue upload intent ticket
  fastify.post('/api/storage/upload-intent', { preHandler: requireAuth }, async (req, reply) => {
    const { purpose = 'PRESCRIPTION', fileName, mimeType, fileSize } = req.body || {};

    if (!fileName) {
      return reply.status(400).send({
        success: false,
        error: 'fileName is required.',
        code: 'MISSING_FILE_NAME'
      });
    }

    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return reply.status(400).send({
        success: false,
        error: `Invalid MIME type '${mimeType}'. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        code: 'INVALID_MIME_TYPE'
      });
    }

    if (fileSize && Number(fileSize) > MAX_FILE_SIZE_BYTES) {
      return reply.status(400).send({
        success: false,
        error: `File size exceeds maximum limit of 10MB (${MAX_FILE_SIZE_BYTES} bytes).`,
        code: 'FILE_TOO_LARGE'
      });
    }

    const intent = await storageProvider.createUploadIntent({
      userId: req.user.id,
      purpose,
      fileName,
      mimeType: mimeType.toLowerCase(),
      fileSize
    });

    return reply.status(200).send({
      success: true,
      intent
    });
  });

  // 2. POST /api/storage/confirm-upload - Save file and register document metadata
  fastify.post('/api/storage/confirm-upload', { preHandler: requireAuth }, async (req, reply) => {
    const { purpose = 'PRESCRIPTION', objectKey, fileName, mimeType, fileContentBase64 } = req.body || {};

    if (!objectKey || !fileName || !fileContentBase64) {
      return reply.status(400).send({
        success: false,
        error: 'objectKey, fileName, and fileContentBase64 are required.',
        code: 'MISSING_UPLOAD_DATA'
      });
    }

    if (objectKey.includes('..') || objectKey.startsWith('/') || objectKey.startsWith('\\') || /^[a-zA-Z]:/.test(objectKey)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid objectKey: path traversal characters or absolute paths are forbidden.',
        code: 'PATH_TRAVERSAL_DETECTED'
      });
    }

    const cleanMime = (mimeType || 'application/pdf').toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(cleanMime)) {
      return reply.status(400).send({
        success: false,
        error: `MIME type '${cleanMime}' is not permitted.`,
        code: 'INVALID_MIME_TYPE'
      });
    }

    // Convert Base64 to buffer
    const buffer = Buffer.from(fileContentBase64, 'base64');
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return reply.status(400).send({
        success: false,
        error: 'Decoded file content exceeds 10MB limit.',
        code: 'FILE_TOO_LARGE'
      });
    }

    // Save to storage provider
    const saved = await storageProvider.saveObject({
      objectKey,
      buffer,
      mimeType: cleanMime
    });

    // Record in database
    const insertRes = await query(
      `INSERT INTO stored_documents (
        user_id, purpose, object_key, file_name, mime_type, file_size_bytes, storage_provider, storage_path, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        req.user.id,
        purpose.toUpperCase(),
        objectKey,
        fileName,
        cleanMime,
        saved.sizeBytes,
        storageProvider.name,
        saved.storagePath || objectKey,
        JSON.stringify({ uploadedBy: req.user.email, clientIp: req.ip })
      ]
    );
    const document = insertRes.rows[0];

    await logAuditEvent({
      actorId: req.user.id,
      actorRole: req.user.role,
      ipAddress: req.ip,
      action: 'DOCUMENT_UPLOADED',
      entity: 'StoredDocument',
      entityId: document.id,
      metadata: { objectKey, purpose, sizeBytes: saved.sizeBytes, mimeType: cleanMime }
    });

    return reply.status(201).send({
      success: true,
      document
    });
  });

  // 3. GET /api/storage/documents/:id/download - Secure download URL generation with IDOR check
  fastify.get('/api/storage/documents/:id/download', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;

    const res = await query(`SELECT * FROM stored_documents WHERE id::text = $1`, [id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Document not found.',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }
    const doc = res.rows[0];

    // IDOR Check: Customer can only access their own documents; staff/optometrists have role access
    const isOwner = doc.user_id === req.user.id;
    const isClinicalStaff = CLINICAL_ROLES.includes(req.user.role);

    if (!isOwner && !isClinicalStaff) {
      return reply.status(403).send({
        success: false,
        error: 'Access denied: You do not have permission to view or download this document.',
        code: 'IDOR_FORBIDDEN'
      });
    }

    const downloadUrl = await storageProvider.getDownloadUrl({
      documentId: doc.id,
      objectKey: doc.object_key
    });

    return reply.status(200).send({
      success: true,
      documentId: doc.id,
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      downloadUrl
    });
  });

  // 4. GET /api/storage/documents/:id/file - Stream file buffer with IDOR enforcement
  fastify.get('/api/storage/documents/:id/file', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;

    const res = await query(`SELECT * FROM stored_documents WHERE id::text = $1`, [id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ success: false, error: 'Document not found.', code: 'NOT_FOUND' });
    }
    const doc = res.rows[0];

    const isOwner = doc.user_id === req.user.id;
    const isClinicalStaff = CLINICAL_ROLES.includes(req.user.role);

    if (!isOwner && !isClinicalStaff) {
      return reply.status(403).send({
        success: false,
        error: 'Access denied: IDOR violation.',
        code: 'IDOR_FORBIDDEN'
      });
    }

    try {
      const buffer = await storageProvider.getObject({ objectKey: doc.object_key });
      reply.header('Content-Type', doc.mime_type);
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name)}"`);
      return reply.send(buffer);
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        error: err.message,
        code: err.code || 'STORAGE_ERROR'
      });
    }
  });

  // 5. GET /api/storage/documents - List documents
  fastify.get('/api/storage/documents', { preHandler: requireAuth }, async (req, reply) => {
    const isClinicalStaff = CLINICAL_ROLES.includes(req.user.role);

    const docsRes = isClinicalStaff
      ? await query(`SELECT * FROM stored_documents ORDER BY created_at DESC LIMIT 50`)
      : await query(`SELECT * FROM stored_documents WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.id]);

    return reply.status(200).send({
      success: true,
      count: docsRes.rows.length,
      documents: docsRes.rows
    });
  });
}

module.exports = storageRoutes;
