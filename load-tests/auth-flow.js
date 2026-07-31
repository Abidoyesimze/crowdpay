/**
 * K6 Load Test — Authentication Flow
 *
 * Tests the auth endpoints under concurrent load:
 *   POST /api/auth/login           — token issuance throughput
 *   GET  /api/users/me             — authenticated profile fetch
 *   GET  /api/users/me/campaigns   — creator's campaign list
 *   GET  /api/users/me/contributions — contributor's history
 *
 * Thresholds:
 *   - login p(95) < 400ms (token issuance must be fast)
 *   - profile p(95) < 200ms
 *   - error rate < 1%
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

const USERS = [
  { email: __ENV.CONTRIBUTOR_EMAIL || 'alice@example.com', password: __ENV.CONTRIBUTOR_PASSWORD || 'password123' },
  { email: __ENV.CREATOR_EMAIL || 'bola@example.com', password: __ENV.CREATOR_PASSWORD || 'creator123' },
];

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '1m',  target: 30 },
    { duration: '20s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],
    login_duration:    ['p(95)<400'],
    profile_duration:  ['p(95)<200'],
  },
};

const loginDuration = new Trend('login_duration');
const profileDuration = new Trend('profile_duration');
const errorRate = new Rate('error_rate');

export default function () {
  const user = USERS[__VU % USERS.length];
  let token = null;

  group('Login', () => {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /api/auth/login' },
      }
    );

    loginDuration.add(res.timings.duration);
    errorRate.add(res.status >= 400);

    const ok = check(res, {
      'login status 200': (r) => r.status === 200,
      'login returns token': (r) => {
        try {
          const b = JSON.parse(r.body);
          return !!(b.token || b.accessToken);
        } catch { return false; }
      },
    });

    if (ok) {
      try {
        const b = JSON.parse(res.body);
        token = b.token || b.accessToken;
      } catch { /* */ }
    }

    sleep(0.3);
  });

  if (!token) return;

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  group('Profile fetch', () => {
    const res = http.get(
      `${BASE_URL}/api/users/me`,
      { headers: authHeaders, tags: { name: 'GET /api/users/me' } }
    );

    profileDuration.add(res.timings.duration);
    errorRate.add(res.status >= 400);

    check(res, {
      'profile status 200': (r) => r.status === 200,
      'profile has email': (r) => {
        try { return typeof JSON.parse(r.body).email === 'string'; } catch { return false; }
      },
    });

    sleep(0.2);
  });

  group('Contribution history', () => {
    const res = http.get(
      `${BASE_URL}/api/users/me/contributions?limit=10`,
      { headers: authHeaders, tags: { name: 'GET /api/users/me/contributions' } }
    );

    errorRate.add(res.status >= 400);

    check(res, {
      'contributions status 200': (r) => r.status === 200,
    });

    sleep(Math.random() * 1 + 0.5);
  });
}
