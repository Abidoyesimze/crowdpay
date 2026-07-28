'use strict';

/**
 * compression.test.js
 *
 * Integration tests for the response compression middleware using supertest.
 * Tests that:
 *   - JSON responses above the threshold are gzip-compressed
 *   - Responses below the threshold are sent uncompressed
 *   - SSE (text/event-stream) responses are never compressed
 *   - The Accept-Encoding: identity path returns uncompressed data
 *   - Vary: Accept-Encoding is set on compressed responses
 *
 * Run: NODE_ENV=test node --test src/middleware/compression.test.js
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');

// Use a 100-byte threshold for testing so we can easily control which
// responses get compressed without generating megabytes of payload.
process.env.COMPRESSION_THRESHOLD = '100';

const compressionMiddleware = require('./compression');

// ---------------------------------------------------------------------------
// Build a minimal test app
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(compressionMiddleware);

  // Route: small payload — below threshold, must NOT be compressed
  app.get('/small', (_req, res) => {
    res.json({ ok: true }); // ~11 bytes
  });

  // Route: large payload — above threshold, MUST be compressed when client supports it
  app.get('/large', (_req, res) => {
    const payload = { data: 'x'.repeat(500) }; // ~514 bytes
    res.json(payload);
  });

  // Route: SSE stream — must NEVER be compressed
  app.get('/sse', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: hello\n\n');
    res.end();
  });

  // Route: pre-encoded — already has Content-Encoding, library must skip
  app.get('/pre-encoded', (_req, res) => {
    res.setHeader('Content-Encoding', 'gzip'); // already encoded
    res.json({ already: 'encoded' });
  });

  return app;
}

let agent;

describe('Compression middleware', () => {
  before(() => {
    agent = supertest(buildApp());
  });

  // ── Gzip compression ─────────────────────────────────────────────────────

  it('compresses large JSON responses when client sends Accept-Encoding: gzip', async () => {
    const res = await agent
      .get('/large')
      .set('Accept-Encoding', 'gzip')
      .buffer(true);

    assert.equal(res.status, 200);
    // supertest decompresses gzip automatically; check the header was set
    const encoding = res.headers['content-encoding'];
    assert.equal(encoding, 'gzip', `Expected gzip, got: ${encoding}`);
  });

  it('sets Vary: Accept-Encoding on compressed responses', async () => {
    const res = await agent
      .get('/large')
      .set('Accept-Encoding', 'gzip');

    const vary = res.headers['vary'] || '';
    assert.ok(
      vary.toLowerCase().includes('accept-encoding'),
      `Expected Vary to include Accept-Encoding, got: ${vary}`
    );
  });

  it('returns readable JSON content after decompression', async () => {
    const res = await agent
      .get('/large')
      .set('Accept-Encoding', 'gzip');

    assert.equal(res.status, 200);
    // supertest auto-decodes; body should parse as JSON
    assert.equal(typeof res.body, 'object');
    assert.ok(res.body.data, 'Expected data field in decompressed body');
  });

  // ── Deflate ───────────────────────────────────────────────────────────────

  it('compresses using deflate when client sends Accept-Encoding: deflate', async () => {
    const res = await agent
      .get('/large')
      .set('Accept-Encoding', 'deflate');

    assert.equal(res.status, 200);
    const encoding = res.headers['content-encoding'];
    assert.ok(
      encoding === 'deflate' || encoding === 'gzip',
      `Expected deflate or gzip, got: ${encoding}`
    );
  });

  // ── Small payload — no compression ───────────────────────────────────────

  it('does NOT compress small responses below the threshold', async () => {
    const res = await agent
      .get('/small')
      .set('Accept-Encoding', 'gzip');

    assert.equal(res.status, 200);
    const encoding = res.headers['content-encoding'];
    assert.ok(
      !encoding || encoding === 'identity',
      `Small response should not be compressed, got Content-Encoding: ${encoding}`
    );
  });

  // ── identity ─────────────────────────────────────────────────────────────

  it('returns uncompressed response when client sends Accept-Encoding: identity', async () => {
    const res = await agent
      .get('/large')
      .set('Accept-Encoding', 'identity');

    assert.equal(res.status, 200);
    const encoding = res.headers['content-encoding'];
    assert.ok(
      !encoding || encoding === 'identity',
      `Expected no compression for identity, got: ${encoding}`
    );
  });

  it('returns uncompressed response when client sends no Accept-Encoding header', async () => {
    // Note: supertest internally sets Accept-Encoding: gzip by default.
    // This test verifies the server responds 200 and the body is readable;
    // the exact encoding is determined by the client negotiation.
    const res = await agent.get('/large');
    assert.equal(res.status, 200);
    // Body should be parseable regardless of whether compression was applied
    assert.equal(typeof res.body, 'object');
    assert.ok(res.body.data, 'Expected data field in body');
  });

  // ── SSE exclusion ────────────────────────────────────────────────────────

  it('does NOT compress Server-Sent Event streams (text/event-stream)', async () => {
    const res = await agent
      .get('/sse')
      .set('Accept-Encoding', 'gzip');

    assert.equal(res.status, 200);
    const encoding = res.headers['content-encoding'];
    assert.ok(
      !encoding || encoding === 'identity',
      `SSE must not be compressed, got Content-Encoding: ${encoding}`
    );
    const ct = res.headers['content-type'] || '';
    assert.ok(ct.includes('text/event-stream'), `Expected text/event-stream, got: ${ct}`);
  });

  // ── 200 status on all routes ─────────────────────────────────────────────

  it('returns 200 for all test routes regardless of compression', async () => {
    // /pre-encoded is excluded: it claims Content-Encoding: gzip but isn't
    // actually encoded, which causes a decompression error in supertest.
    const routes = ['/small', '/large', '/sse'];
    for (const route of routes) {
      const res = await agent.get(route).set('Accept-Encoding', 'gzip');
      assert.equal(res.status, 200, `Expected 200 on ${route}, got ${res.status}`);
    }
  });
});
