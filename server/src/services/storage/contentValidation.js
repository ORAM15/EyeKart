/**
 * EyeKart Phase 6.6 Content Validation (Stage 2 security hardening)
 *
 * Dependency-free magic-byte validation for clinical document uploads.
 * The MIME type asserted by the client is never trusted on its own: the
 * actual bytes must start with the signature of the claimed type before
 * anything is saved. This runs on the confirm-upload path, after the
 * upload intent has been validated and before the object is stored.
 *
 * Supported types (the same allowlist as the storage routes):
 *   application/pdf  - "%PDF"            (25 50 44 46)
 *   image/jpeg       - FF D8 FF
 *   image/png        - 89 50 4E 47 0D 0A 1A 0A
 *   image/webp       - "RIFF" .... "WEBP" (bytes 0-3 RIFF, 8-11 WEBP)
 */

const SIGNATURES = {
  'application/pdf': {
    label: 'PDF (%PDF header)',
    test: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46
  },
  'image/jpeg': {
    label: 'JPEG (FF D8 FF header)',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  'image/png': {
    label: 'PNG (8-byte signature)',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  },
  'image/webp': {
    label: 'WebP (RIFF....WEBP header)',
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // "WEBP"
  }
};

/**
 * Detect the MIME type implied by the leading bytes, or null when the
 * bytes match none of the supported signatures.
 */
function detectMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  for (const [mime, sig] of Object.entries(SIGNATURES)) {
    if (sig.test(buffer)) return mime;
  }
  return null;
}

/**
 * Validate that `buffer` really is content of `mimeType`.
 * Returns null when the bytes match the claimed type, otherwise a
 * human-readable reason for the mismatch (suitable for a 400 response).
 */
function validateFileContent(buffer, mimeType) {
  const cleanMime = String(mimeType || '').toLowerCase();
  const sig = SIGNATURES[cleanMime];
  if (!sig) {
    return `MIME type '${cleanMime}' is not supported for content validation.`;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return 'Uploaded file is empty.';
  }
  if (!sig.test(buffer)) {
    const detected = detectMimeType(buffer);
    return (
      `File content does not match the claimed MIME type '${cleanMime}' ` +
      `(expected ${sig.label}` +
      (detected ? `, but the bytes look like '${detected}'` : ', and the bytes match no supported file type') +
      `).`
    );
  }
  return null;
}

module.exports = { SIGNATURES, detectMimeType, validateFileContent };
