/**
 * EyeKart Phase 6.6 Secure Storage Routes
 * Handles upload intents, file ingestion, IDOR access controls, and optometrist RBAC.
 *
 * Stage 2 security hardening (fix/security-stage2-c):
 * - Staff access is assignment-scoped, not role-only. A clinical staff
 *   member may read a patient's documents only when they are the
 *   practitioner on an active (BOOKED / CONFIRMED / COMPLETED)
 *   appointment for that patient. There is no staff<->clinic assignment
 *   table and no clinic on users, so a practitioner appointment is the
 *   strongest scope the data model supports; see SCOPE NOTE below.
 * - The staff list requires an explicit patient scope (?patientId=...)
 *   and never returns storage_path or metadata (which used to carry the
 *   uploader's email and client IP). All list/read responses return only
 *   the columns the UI needs.
 * - Confirm-upload requires a valid, single-use, user-bound upload-intent
 *   token. The object key, purpose, file name and MIME type all come from
 *   the validated intent (server-generated); client-supplied objectKey /
 *   purpose / mimeType are ignored, so keys can no longer be squatted and
 *   one user cannot confirm under another user's prefix.
 * - Uploaded bytes are magic-byte validated against the claimed MIME
 *   before anything is saved (see services/storage/contentValidation.js).
 * - Save-then-insert failures clean up the saved object, and providers
 *   refuse to overwrite an existing object, so a failed confirm can
 *   neither orphan a file nor clobber someone else's.
 * - Files are served as `attachment` (never `inline`) with a nosniff
 *   header and only an allowlisted Content-Type.
 *
 * SCOPE NOTE — what full assignment scoping would still need:
 * There is no assignment/clinic table linking staff to patients except
 * appointments.practitioner_id. Clinic-wide access (e.g. any clinician
 * at the patient's clinic, or an ADMIN break-glass read) cannot be
 * expressed without a data-model change (staff<->clinic assignment plus
 * an owner decision on who counts as "assigned"). Until that exists,
 * ADMIN included, staff without a practitioner appointment for the
 * patient get 403 on that patient's documents. prescriptionService's
 * separate document-ownership checks on prescription attach were left
 * untouched by this slice.
 */
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { getStorageProvider } = require('../services/storage');
const { validateFileContent } = require('../services/storage/contentValidation');
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

// Appointment statuses that establish an active practitioner<->patient
// assignment. CANCELLED / NO_SHOW / EXPIRED / RESCHEDULED do not.
const ACTIVE_APPOINTMENT_STATUSES = ['BOOKED', 'CONFIRMED', 'COMPLETED'];

// The only stored_documents columns any API response may expose. In
// particular this excludes storage_path (an absolute server filesystem
// path for LOCAL storage) and metadata (which used to hold the
// uploader's email and client IP). object_key is selected separately
// only where the handler needs it internally and is never returned.
const SAFE_DOCUMENT_COLUMNS =
  'id, user_id, purpose, file_name, mime_type, file_size_bytes, is_quarantined, created_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Initialize storage provider based on environment and configuration
const storageProvider = getStorageProvider();

/**
 * SHA-256 hash of an upload-intent token. Only the hash is ever stored
 * (storage_upload_intents.token_hash); the raw token is returned once,
 * at intent creation, and never persisted or logged.
 */
function hashUploadToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * True when `staffUserId` is the practitioner on an active appointment
 * for patient `patientUserId`. This is the assignment scope for all
 * staff document access (single-document reads and the staff list).
 */
async function hasClinicalAssignment(patientUserId, staffUserId) {
  const res = await query(
    `SELECT 1 FROM appointments
      WHERE user_id = $1 AND practitioner_id = $2 AND status = ANY($3)
      LIMIT 1`,
    [patientUserId, staffUserId, ACTIVE_APPOINTMENT_STATUSES]
  );
  return res.rows.length > 0;
}

/**
 * Shared access check for a single document. The owner always has
 * access; clinical staff only with a practitioner assignment for the
 * document's owner (see SCOPE NOTE above).
 */
async function canAccessDocument(doc, user) {
  if (doc.user_id === user.id) return true;
  if (!CLINICAL_ROLES.includes(user.role)) return false;
  return hasClinicalAssignment(doc.user_id, user.id);
}

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

    const cleanPurpose = String(purpose).toUpperCase();
    const cleanMime = mimeType.toLowerCase();

    const intent = await storageProvider.createUploadIntent({
      userId: req.user.id,
      purpose: cleanPurpose,
      fileName,
      mimeType: cleanMime,
      fileSize
    });

    // The token is the proof of intent: persist only its hash, bound to
    // this user, purpose, server-generated object key and expiry.
    // Without a token the provider issued, confirm-upload cannot run.
    if (!intent || !intent.uploadToken || !intent.objectKey || !intent.expiresAt) {
      return reply.status(500).send({
        success: false,
        error: 'Storage provider did not issue a complete upload intent.',
        code: 'INCOMPLETE_UPLOAD_INTENT'
      });
    }

    try {
      await query(
        `INSERT INTO storage_upload_intents (
          token_hash, user_id, purpose, object_key, file_name, mime_type, file_size_bytes, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          hashUploadToken(intent.uploadToken),
          req.user.id,
          cleanPurpose,
          intent.objectKey,
          fileName,
          cleanMime,
          fileSize ? Number(fileSize) : null,
          intent.expiresAt
        ]
      );
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: 'Could not record the upload intent.',
        code: 'INTENT_RECORD_FAILED'
      });
    }

    return reply.status(200).send({
      success: true,
      intent
    });
  });

  // 2. POST /api/storage/confirm-upload - Save file and register document metadata
  //
  // Flow: present the single-use uploadToken from the intent (plus the
  // base64 file body). The token is consumed atomically; the object key,
  // purpose, file name and MIME type are then taken from the validated
  // intent — never from the client — so a caller cannot confirm under
  // another user's key or squat keys. Bytes are magic-byte validated
  // against the intent's MIME before saving, and a failed DB insert
  // deletes the just-saved object so no orphan file is left behind.
  fastify.post('/api/storage/confirm-upload', { preHandler: requireAuth }, async (req, reply) => {
    const { uploadToken, fileContentBase64 } = req.body || {};

    if (!uploadToken || !fileContentBase64) {
      return reply.status(400).send({
        success: false,
        error: 'uploadToken and fileContentBase64 are required. Request an upload intent first.',
        code: 'MISSING_UPLOAD_DATA'
      });
    }

    // Atomically consume the intent: user-bound, unexpired, unused.
    // One UPDATE both validates and burns the token, so a replayed or
    // concurrent confirm with the same token cannot succeed twice.
    const intentRes = await query(
      `UPDATE storage_upload_intents
          SET used_at = CURRENT_TIMESTAMP
        WHERE token_hash = $1 AND user_id = $2
          AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        RETURNING purpose, object_key, file_name, mime_type`,
      [hashUploadToken(uploadToken), req.user.id]
    );
    if (intentRes.rows.length === 0) {
      return reply.status(403).send({
        success: false,
        error: 'Invalid, expired, or already-used upload intent token.',
        code: 'INVALID_UPLOAD_INTENT'
      });
    }
    const intent = intentRes.rows[0];
    const objectKey = intent.object_key;
    const cleanMime = intent.mime_type;

    // Convert Base64 to buffer
    const buffer = Buffer.from(fileContentBase64, 'base64');
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return reply.status(400).send({
        success: false,
        error: 'Decoded file content exceeds 10MB limit.',
        code: 'FILE_TOO_LARGE'
      });
    }

    // Validate the actual bytes against the intent's claimed MIME type.
    // The client-asserted MIME string is never trusted on its own.
    const contentError = validateFileContent(buffer, cleanMime);
    if (contentError) {
      return reply.status(400).send({
        success: false,
        error: contentError,
        code: 'INVALID_FILE_CONTENT'
      });
    }

    // Save to storage provider. Providers refuse to overwrite an
    // existing object, so a colliding key cannot clobber another file.
    let saved;
    try {
      saved = await storageProvider.saveObject({
        objectKey,
        buffer,
        mimeType: cleanMime
      });
    } catch (err) {
      if (err.code === 'OBJECT_ALREADY_EXISTS' || err.statusCode === 409) {
        return reply.status(409).send({
          success: false,
          error: 'An object already exists at the issued upload key.',
          code: 'OBJECT_ALREADY_EXISTS'
        });
      }
      throw err;
    }

    // Record in database. On failure, delete the just-saved object so a
    // failed confirm leaves no orphaned file behind. Metadata no longer
    // stores the uploader's email or client IP (the audit event below
    // already records actor and IP); it is kept as an empty object.
    let document;
    try {
      const insertRes = await query(
        `INSERT INTO stored_documents (
          user_id, purpose, object_key, file_name, mime_type, file_size_bytes, storage_provider, storage_path, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${SAFE_DOCUMENT_COLUMNS}`,
        [
          req.user.id,
          intent.purpose,
          objectKey,
          intent.file_name,
          cleanMime,
          saved.sizeBytes,
          storageProvider.name,
          saved.storagePath || objectKey,
          JSON.stringify({})
        ]
      );
      document = insertRes.rows[0];
    } catch (err) {
      try {
        await storageProvider.deleteObject({ objectKey });
      } catch (cleanupErr) {
        console.error('[EyeKart Storage] Failed to clean up orphaned object after failed document insert:', cleanupErr.message);
      }
      if (err.code === '23505') {
        return reply.status(409).send({
          success: false,
          error: 'A document already exists for this upload.',
          code: 'DOCUMENT_ALREADY_EXISTS'
        });
      }
      throw err;
    }

    await logAuditEvent({
      actorId: req.user.id,
      actorRole: req.user.role,
      ipAddress: req.ip,
      action: 'DOCUMENT_UPLOADED',
      entity: 'StoredDocument',
      entityId: document.id,
      metadata: { objectKey, purpose: intent.purpose, sizeBytes: saved.sizeBytes, mimeType: cleanMime }
    });

    return reply.status(201).send({
      success: true,
      document
    });
  });

  // 3. GET /api/storage/documents/:id/download - Secure download URL generation with IDOR check
  fastify.get('/api/storage/documents/:id/download', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;

    const res = await query(
      `SELECT ${SAFE_DOCUMENT_COLUMNS}, object_key FROM stored_documents WHERE id::text = $1`,
      [id]
    );
    if (res.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Document not found.',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }
    const doc = res.rows[0];

    // IDOR check: owner, or clinical staff with a practitioner
    // assignment for this patient. Role alone is not sufficient.
    if (!(await canAccessDocument(doc, req.user))) {
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

    const res = await query(
      `SELECT ${SAFE_DOCUMENT_COLUMNS}, object_key FROM stored_documents WHERE id::text = $1`,
      [id]
    );
    if (res.rows.length === 0) {
      return reply.status(404).send({ success: false, error: 'Document not found.', code: 'NOT_FOUND' });
    }
    const doc = res.rows[0];

    if (!(await canAccessDocument(doc, req.user))) {
      return reply.status(403).send({
        success: false,
        error: 'Access denied: IDOR violation.',
        code: 'IDOR_FORBIDDEN'
      });
    }

    try {
      const buffer = await storageProvider.getObject({ objectKey: doc.object_key });
      // Never trust the DB-recorded MIME blindly: serve only an
      // allowlisted type (the MIME stored here was magic-byte validated
      // at upload); anything else falls back to a safe default. Files
      // are always served as attachment so user-uploaded content never
      // renders in the site's origin.
      const servedMime = ALLOWED_MIME_TYPES.includes(String(doc.mime_type).toLowerCase())
        ? String(doc.mime_type).toLowerCase()
        : 'application/octet-stream';
      reply.header('Content-Type', servedMime);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
      reply.header('X-Content-Type-Options', 'nosniff');
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
  //
  // Staff must name the patient (?patientId=<uuid>) and must hold a
  // practitioner assignment for that patient; there is deliberately no
  // unscoped "list every customer's documents" path any more. Staff may
  // also list their own documents by passing their own id. Responses
  // expose only the columns the UI needs — never storage_path or
  // metadata.
  fastify.get('/api/storage/documents', { preHandler: requireAuth }, async (req, reply) => {
    const isClinicalStaff = CLINICAL_ROLES.includes(req.user.role);

    if (isClinicalStaff) {
      const patientId = req.query && req.query.patientId;
      if (!patientId) {
        return reply.status(400).send({
          success: false,
          error: 'patientId query parameter is required for staff document lists.',
          code: 'MISSING_PATIENT_SCOPE'
        });
      }
      if (!UUID_RE.test(String(patientId))) {
        return reply.status(400).send({
          success: false,
          error: 'patientId must be a valid UUID.',
          code: 'INVALID_PATIENT_ID'
        });
      }
      const isOwnList = String(patientId) === req.user.id;
      if (!isOwnList && !(await hasClinicalAssignment(String(patientId), req.user.id))) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied: no active appointment assignment for this patient.',
          code: 'IDOR_FORBIDDEN'
        });
      }
      const docsRes = await query(
        `SELECT ${SAFE_DOCUMENT_COLUMNS} FROM stored_documents
          WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [patientId]
      );
      return reply.status(200).send({
        success: true,
        count: docsRes.rows.length,
        documents: docsRes.rows
      });
    }

    const docsRes = await query(
      `SELECT ${SAFE_DOCUMENT_COLUMNS} FROM stored_documents
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );

    return reply.status(200).send({
      success: true,
      count: docsRes.rows.length,
      documents: docsRes.rows
    });
  });
}

module.exports = storageRoutes;
