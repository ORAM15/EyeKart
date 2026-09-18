/**
 * EyeKart Canonical Kenyan Phone Utilities (Phase 8)
 * Standardizes Kenyan mobile numbers to 254XXXXXXXXX and validates formats.
 */

function normalizeKenyanPhone(phone) {
  if (!phone) {
    const err = new Error('Phone number is required.');
    err.code = 'INVALID_PHONE_NUMBER';
    err.statusCode = 400;
    throw err;
  }
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  let formatted = cleaned;

  if (cleaned.startsWith('254') && cleaned.length === 12) {
    formatted = cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    formatted = '254' + cleaned.slice(1);
  } else if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('1'))) {
    formatted = '254' + cleaned;
  }

  // Must match Kenyan mobile prefixes: 2547XXXXXXXX or 2541XXXXXXXX
  if (!formatted.startsWith('254') || formatted.length !== 12 || !['7', '1'].includes(formatted.charAt(3))) {
    const err = new Error(`Invalid Kenyan phone number format: '${phone}'. Must resolve to 254[7|1]XXXXXXXX.`);
    err.code = 'INVALID_PHONE_NUMBER';
    err.statusCode = 400;
    throw err;
  }

  return {
    raw: phone,
    canonical: formatted,
    e164: '+' + formatted,
    local: '0' + formatted.slice(3)
  };
}

function isValidKenyanPhone(phone) {
  try {
    normalizeKenyanPhone(phone);
    return true;
  } catch {
    return false;
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

module.exports = {
  normalizeKenyanPhone,
  isValidKenyanPhone,
  isValidEmail
};
