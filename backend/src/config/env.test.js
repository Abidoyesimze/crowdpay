const test = require('node:test');
const assert = require('node:assert/strict');
const proxyquire = require('proxyquire').noCallThru();

const VALID_JWT_SECRET = 'a'.repeat(64);
const VALID_PLATFORM_SECRET_KEY = 'SCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR';

let exitCalls;
let stderrChunks;
let originalExit;
let originalStderrWrite;
let savedEnv;

function setupEnv(overrides = {}) {
  const base = {
    DATABASE_URL: 'postgres://crowdpay:crowdpay@localhost:5432/crowdpay',
    JWT_SECRET: VALID_JWT_SECRET,
    API_KEY_PEPPER: 'b'.repeat(64),
    PLATFORM_SECRET_KEY: VALID_PLATFORM_SECRET_KEY,
    STELLAR_NETWORK: 'testnet',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    WALLET_SECRET_LOCAL_KEK: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  };
  const merged = { ...base, ...overrides };
  const removed = Object.keys(merged).filter((k) => merged[k] === undefined);
  removed.forEach((k) => delete process.env[k]);
  for (const key of Object.keys(merged)) {
    if (merged[key] !== undefined) process.env[key] = merged[key];
  }
}

function captureStderrAndExit() {
  exitCalls = [];
  stderrChunks = [];
  originalExit = process.exit;
  originalStderrWrite = process.stderr.write;
  process.exit = (code) => {
    exitCalls.push(code);
    throw new Error('__EXIT__');
  };
  process.stderr.write = (chunk) => {
    stderrChunks.push(String(chunk));
    return true;
  };
}

function restoreStderrAndExit() {
  process.exit = originalExit;
  process.stderr.write = originalStderrWrite;
}

function stubbedValidateEnv() {
  return proxyquire('../config/env', {
    '../services/walletSecrets': {
      validateWalletSecretConfig: () => {},
    },
  }).validateEnv;
}

function runValidateEnv(overrides) {
  setupEnv(overrides);
  captureStderrAndExit();
  const validateEnv = stubbedValidateEnv();
  try {
    validateEnv();
  } catch (err) {
    if (!exitCalls.length) throw err;
  }
  restoreStderrAndExit();
  return { exitCalls: [...exitCalls], stderr: stderrChunks.join('') };
}

test.beforeEach(() => {
  savedEnv = { ...process.env };
});

test.afterEach(() => {
  restoreStderrAndExit();
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  for (const key of Object.keys(savedEnv)) {
    process.env[key] = savedEnv[key];
  }
});

test('exits with code 1 when a required variable is missing', () => {
  const { exitCalls, stderr } = runValidateEnv({ JWT_SECRET: undefined });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /missing required environment variables/);
  assert.match(stderr, /JWT_SECRET/);
});

test('does not exit when JWT_SECRET meets the minimum length', () => {
  const { exitCalls } = runValidateEnv();
  assert.deepEqual(exitCalls, []);
});

test('warns without exiting when JWT_SECRET is shorter than 32 characters', () => {
  const { exitCalls, stderr } = runValidateEnv({ JWT_SECRET: 'too-short' });
  assert.deepEqual(exitCalls, []);
  assert.match(stderr, /JWT_SECRET should be at least 32 characters/);
});

test('exits when STELLAR_NETWORK is not testnet or mainnet', () => {
  const { exitCalls, stderr } = runValidateEnv({ STELLAR_NETWORK: 'public' });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /STELLAR_NETWORK must be one of: testnet, mainnet/);
});

test('exits when PLATFORM_SECRET_KEY does not start with S', () => {
  const { exitCalls, stderr } = runValidateEnv({
    PLATFORM_SECRET_KEY: 'GCVMQUS5EMTHWBLJTE5XCSCMHB2ZOVKRR4ATVTRPUNRCOGKRENIL3LHR',
  });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /PLATFORM_SECRET_KEY must be a valid Stellar secret seed/);
});

test('exits when PLATFORM_SECRET_KEY is not 56 characters', () => {
  const { exitCalls, stderr } = runValidateEnv({
    PLATFORM_SECRET_KEY: 'S' + 'A'.repeat(50),
  });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /PLATFORM_SECRET_KEY must be a valid Stellar secret seed/);
});

test('exits when PORT is not a number', () => {
  const { exitCalls, stderr } = runValidateEnv({ PORT: 'abc' });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /PORT must be an integer between 1 and 65535/);
});

test('exits when PORT is out of range', () => {
  const { exitCalls, stderr } = runValidateEnv({ PORT: '70000' });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /PORT must be an integer between 1 and 65535/);
});

test('does not exit when PORT is unset', () => {
  const { exitCalls } = runValidateEnv({ PORT: undefined });
  assert.deepEqual(exitCalls, []);
});

test('does not exit with a fully valid configuration', () => {
  const { exitCalls, stderr } = runValidateEnv({ PORT: '3001' });
  assert.deepEqual(exitCalls, []);
  assert.doesNotMatch(stderr, /Cannot start/);
});

test('exits when API_KEY_PEPPER equals JWT_SECRET', () => {
  const shared = 'c'.repeat(64);
  const { exitCalls, stderr } = runValidateEnv({
    JWT_SECRET: shared,
    API_KEY_PEPPER: shared,
  });
  assert.deepEqual(exitCalls, [1]);
  assert.match(stderr, /API_KEY_PEPPER must differ from JWT_SECRET/);
});
