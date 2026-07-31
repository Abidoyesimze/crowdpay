const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.DEVICE_FINGERPRINT_PEPPER = 'test-device-pepper';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function load() {
  delete require.cache[require.resolve('./deviceFingerprint')];
  return require('./deviceFingerprint');
}

describe('deviceFingerprint util', () => {
  test('rejects malformed or empty fingerprints', () => {
    const { hashDeviceFingerprint } = load();
    assert.strictEqual(hashDeviceFingerprint(''), null);
    assert.strictEqual(hashDeviceFingerprint(null), null);
    assert.strictEqual(hashDeviceFingerprint(undefined), null);
    assert.strictEqual(hashDeviceFingerprint('short'), null); // < 16 chars
    assert.strictEqual(hashDeviceFingerprint('not-hex-value!!!!'), null);
    assert.strictEqual(hashDeviceFingerprint('a'.repeat(600)), null); // too long
  });

  test('produces a deterministic, non-reversible salted hash', () => {
    const { hashDeviceFingerprint } = load();
    const raw = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const first = hashDeviceFingerprint(raw);
    const second = hashDeviceFingerprint(raw);
    assert.strictEqual(first, second, 'same input must yield same hash for clustering');
    assert.match(first, /^[a-f0-9]{64}$/, 'output is a hex sha256 digest');
    assert.notStrictEqual(first, raw, 'raw fingerprint is never stored');
  });

  test('is case-insensitive on the raw input', () => {
    const { hashDeviceFingerprint } = load();
    const lower = hashDeviceFingerprint('abcdef1234567890');
    const upper = hashDeviceFingerprint('ABCDEF1234567890');
    assert.strictEqual(lower, upper);
  });

  test('different peppers yield different hashes for the same fingerprint', () => {
    let mod = load();
    const raw = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const withFirstPepper = mod.hashDeviceFingerprint(raw);
    process.env.DEVICE_FINGERPRINT_PEPPER = 'a-different-pepper';
    mod = load();
    const withSecondPepper = mod.hashDeviceFingerprint(raw);
    assert.notStrictEqual(withFirstPepper, withSecondPepper);
  });
});
