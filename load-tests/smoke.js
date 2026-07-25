/**
 * K6 Smoke Test — quick sanity check across all major endpoints
 *
 * Runs at 1 VU for 30 seconds. Use this before running the full load tests
 * to ensure the backend is up and all critical routes respond correctly.
 *
 * Usage:
 *   k6 run load-tests/smoke.js
 */
import http from 'k6/http';
import { check, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.05'],  // slightly relaxed for smoke
  },
};

const CAMPAIGN_ID = '11111111-1111-1111-1111-111111111111';

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // ── Public endpoints ──────────────────────────────────────────────────────

  group('Health', () => {
    const r = http.get(`${BASE_URL}/health`, { tags: { name: 'GET /health' } });
    check(r, { 'health 200': (res) => res.status === 200 });
  });

  group('Campaign listing', () => {
    const r = http.get(`${BASE_URL}/api/campaigns?limit=5`, { headers });
    check(r, {
      'list 200': (res) => res.status === 200,
      'list body ok': (res) => {
        try { return 'campaigns' in JSON.parse(res.body); } catch { return false; }
      },
    });
  });

  group('Campaign detail', () => {
    const r = http.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}`, { headers });
    check(r, { 'detail 200': (res) => res.status === 200 });
  });

  group('Campaign embed', () => {
    const r = http.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}/embed`, { headers });
    check(r, { 'embed 200': (res) => res.status === 200 });
  });

  group('Campaign backers', () => {
    const r = http.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}/backers`, { headers });
    check(r, { 'backers 200': (res) => res.status === 200 });
  });

  group('Campaign milestones', () => {
    const r = http.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}/milestones`, { headers });
    check(r, { 'milestones 200': (res) => res.status === 200 });
  });

  // ── Auth endpoints ────────────────────────────────────────────────────────

  group('Login', () => {
    const r = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: 'alice@example.com', password: 'password123' }),
      { headers, tags: { name: 'POST /api/auth/login' } }
    );
    check(r, { 'login 200': (res) => res.status === 200 });
  });

  // ── 401 protection smoke ──────────────────────────────────────────────────

  group('Protected route rejects unauthenticated', () => {
    const r = http.get(`${BASE_URL}/api/users/me`, { headers });
    check(r, { 'me 401 without token': (res) => res.status === 401 });
  });
}
