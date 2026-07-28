'use strict';

/**
 * csrf.test.js
 *
 * Unit tests for the CSRF double-submit cookie middleware.
 * Tests that:
 *   - GET requests set a CSRF cookie and pass through
 *   - POST requests with valid X-CSRF-Token header matching the cookie pass through
 *   - POST requests with missing X-CSRF-Token header are blocked (403)
 *   - POST requests with mismatched X-CSRF-Token header are blocked (403)
 *   - POST requests with no CSRF cookie generate one and pass through (fresh session)
 *   - Webhook/callback endpoints are exempt from CSRF validation
 *   - OPTIONS requests are exempt from CSRF validation
 *   - The CSRF cookie has correct attributes (httpOnly=false, sameSite=strict)
 *
 * Run: NODE_ENV=test node --test src/middleware/csrf.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const supertest = require('supertest');

const { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } = require('./csrf');

// ---------------------------------------------------------------------------
// Helper: build a minimal Express app with CSRF protection
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection);

  // Safe routes (GET)
  app.get('/api/data', (_req, res) => res.json({ ok: true }));

  // State-changing routes (POST, PATCH, DELETE)
  app.post('/api/data', (_req, res) => res.json({ created: true }));
  app.patch('/api/data', (_req, res) => res.json({ updated: true }));
  app.delete('/api/data', (_req, res) => res.json({ deleted: true }));
  app.put('/api/data', (_req, res) => res.json({ replaced: true }));

  // Webhook endpoints (should be exempt from CSRF)
  app.post('/api/webhooks/kyc', (_req, res) => res.json({ webhook: true }));
  app.post('/api/webhooks/incoming/abc123', (_req, res) => res.json({ webhook: true }));
  app.post('/api/anchor/callbacks/sep24', (_req, res) => res.json({ webhook: true }));

  return app;
}

// ---------------------------------------------------------------------------
// Generate a valid CSRF token (simulates what the middleware sets as a cookie)
// ---------------------------------------------------------------------------
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CSRF middleware', () => {
  describe('GET requests', () => {
    it('sets a CSRF cookie on GET requests when none exists', async () => {
      const agent = supertest(buildApp());
      const res = await agent.get('/api/data');

      assert.equal(res.status, 200);
      const setCookie = res.headers['set-cookie'] || [];
      const csrfCookie = setCookie.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
      assert.ok(csrfCookie, 'Expected CSRF cookie to be set');
      assert.ok(csrfCookie.includes('HttpOnly=false') || !csrfCookie.includes('HttpOnly=true'),
        'CSRF cookie should be readable by JavaScript (not httpOnly)');
      assert.ok(csrfCookie.includes('SameSite=Strict'), 'CSRF cookie should have SameSite=Strict');
    });

    it('passes through GET requests without validation', async () => {
      const agent = supertest(buildApp());
      const res = await agent.get('/api/data');

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
    });
  });

  describe('State-changing requests with valid CSRF token', () => {
    it('allows POST when X-CSRF-Token header matches the cookie', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .post('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .set(CSRF_HEADER_NAME, token)
        .send({ name: 'test' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { created: true });
    });

    it('allows PATCH when X-CSRF-Token header matches the cookie', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .patch('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .set(CSRF_HEADER_NAME, token)
        .send({ name: 'updated' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { updated: true });
    });

    it('allows DELETE when X-CSRF-Token header matches the cookie', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .delete('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .set(CSRF_HEADER_NAME, token);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { deleted: true });
    });

    it('allows PUT when X-CSRF-Token header matches the cookie', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .put('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .set(CSRF_HEADER_NAME, token)
        .send({ name: 'replaced' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { replaced: true });
    });
  });

  describe('State-changing requests with invalid CSRF token', () => {
    it('blocks POST when X-CSRF-Token header is missing', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .post('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .send({ name: 'test' });

      assert.equal(res.status, 403);
      assert.ok(res.body.error.includes('CSRF'));
    });

    it('blocks POST when X-CSRF-Token header does not match cookie', async () => {
      const agent = supertest(buildApp());
      const cookieToken = generateToken();
      const headerToken = generateToken();

      const res = await agent
        .post('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${cookieToken}`)
        .set(CSRF_HEADER_NAME, headerToken)
        .send({ name: 'test' });

      assert.equal(res.status, 403);
      assert.ok(res.body.error.includes('CSRF'));
    });

    it('blocks PATCH when X-CSRF-Token header is missing', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .patch('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`)
        .send({ name: 'test' });

      assert.equal(res.status, 403);
    });

    it('blocks DELETE when X-CSRF-Token header is missing', async () => {
      const agent = supertest(buildApp());
      const token = generateToken();

      const res = await agent
        .delete('/api/data')
        .set('Cookie', `${CSRF_COOKIE_NAME}=${token}`);

      assert.equal(res.status, 403);
    });
  });

  describe('Fresh session (no CSRF cookie)', () => {
    it('generates a new CSRF cookie and allows POST when no cookie exists', async () => {
      const agent = supertest(buildApp());

      const res = await agent
        .post('/api/data')
        .send({ name: 'test' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { created: true });

      // Verify a new CSRF cookie was set
      const setCookie = res.headers['set-cookie'] || [];
      const csrfCookie = setCookie.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
      assert.ok(csrfCookie, 'Expected CSRF cookie to be generated for fresh session');
    });
  });

  describe('Webhook/callback exemption', () => {
    it('allows POST to /api/webhooks/kyc without CSRF token', async () => {
      const agent = supertest(buildApp());

      const res = await agent
        .post('/api/webhooks/kyc')
        .send({ event: 'completed' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { webhook: true });
    });

    it('allows POST to /api/webhooks/incoming/:id without CSRF token', async () => {
      const agent = supertest(buildApp());

      const res = await agent
        .post('/api/webhooks/incoming/abc123')
        .send({ event: 'test' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { webhook: true });
    });

    it('allows POST to /api/anchor/callbacks/sep24 without CSRF token', async () => {
      const agent = supertest(buildApp());

      const res = await agent
        .post('/api/anchor/callbacks/sep24')
        .send({ event: 'test' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { webhook: true });
    });
  });

  describe('OPTIONS requests', () => {
    it('allows OPTIONS requests without CSRF validation (CORS preflight)', async () => {
      const agent = supertest(buildApp());

      const res = await agent
        .options('/api/data')
        .set('Access-Control-Request-Method', 'POST');

      assert.equal(res.status, 200);
    });
  });

  describe('Cookie attributes', () => {
    it('sets CSRF cookie with correct attributes', async () => {
      const agent = supertest(buildApp());
      const res = await agent.get('/api/data');

      const setCookie = res.headers['set-cookie'] || [];
      const csrfCookie = setCookie.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
      assert.ok(csrfCookie, 'Expected CSRF cookie');

      // Cookie should be readable by JavaScript (not httpOnly)
      assert.ok(
        !csrfCookie.includes('HttpOnly') || csrfCookie.includes('HttpOnly=false'),
        'CSRF cookie should not be httpOnly'
      );

      // Should have SameSite=Strict
      assert.ok(csrfCookie.includes('SameSite=Strict'), 'Should have SameSite=Strict');

      // Should have path=/
      assert.ok(csrfCookie.includes('Path=/'), 'Should have Path=/');
    });
  });
});
