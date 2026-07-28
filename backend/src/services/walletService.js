const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
let KEY_CACHE;

function decodeKeyMaterial(value) {
  const input = String(value || '').trim();
  if (!input) {
    throw new Error('WALLET_ENCRYPTION_KEY must be set for wallet encryption');
  }

  if (/^[0-9a-fA-F]{64}$/.test(input)) {
    return Buffer.from(input, 'hex');
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    return Buffer.from(input, 'base64');
  }

  throw new Error('WALLET_ENCRYPTION_KEY must be base64 or hex encoded');
}

function getKey() {
  if (KEY_CACHE) return KEY_CACHE;
  const key = decodeKeyMaterial(process.env.WALLET_ENCRYPTION_KEY);
  if (key.length !== 32) {
    throw new Error('WALLET_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  KEY_CACHE = key;
  return key;
}

function validateWalletEncryptionKey() {
  getKey();
}

function encryptSecret(secret) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(encryptedData) {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex'), null, 'utf8') + decipher.final('utf8');
}

module.exports = { encryptSecret, decryptSecret, validateWalletEncryptionKey };
