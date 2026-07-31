const crypto = require('crypto');

/**
 * Device fingerprinting helpers for fraud detection (#595).
 *
 * Privacy/security notes:
 *  - The client sends an already-opaque fingerprint hash (see the frontend
 *    deviceFingerprint helper). We never receive nor store raw device
 *    identifiers here.
 *  - We additionally apply a keyed HMAC with a server-side pepper before
 *    persisting, so a database leak cannot be correlated back to a device
 *    without the pepper. The HMAC is deterministic, which is what lets us
 *    cluster contributions from the same device.
 *  - The hashed value must never be logged; treat it like other PII.
 */

const MAX_RAW_LENGTH = 512;
const FINGERPRINT_PATTERN = /^[a-f0-9]{16,128}$/i;

function getPepper() {
  return (
    process.env.DEVICE_FINGERPRINT_PEPPER ||
    process.env.API_KEY_PEPPER ||
    process.env.JWT_SECRET ||
    ''
  );
}

/**
 * Validate and normalize a client-supplied device fingerprint.
 * Returns null when absent or malformed (fingerprinting is best-effort and
 * must never block a legitimate contribution).
 */
function normalizeClientFingerprint(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_RAW_LENGTH) return null;
  if (!FINGERPRINT_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Produce the salted, non-reversible fingerprint that is safe to store.
 * @param {string} raw - opaque fingerprint hash from the client
 * @returns {string|null} hex HMAC or null when input is unusable
 */
function hashDeviceFingerprint(raw) {
  const normalized = normalizeClientFingerprint(raw);
  if (!normalized) return null;
  return crypto.createHmac('sha256', getPepper()).update(normalized).digest('hex');
}

module.exports = {
  hashDeviceFingerprint,
  normalizeClientFingerprint,
};
