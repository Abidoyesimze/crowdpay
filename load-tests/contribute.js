import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const USER_EMAIL = __ENV.USER_EMAIL || __ENV.CONTRIBUTOR_EMAIL || 'alice@example.com';
const USER_PASSWORD = __ENV.USER_PASSWORD || __ENV.CONTRIBUTOR_PASSWORD || 'password123';
const CAMPAIGN_ID = __ENV.CAMPAIGN_ID || '11111111-1111-1111-1111-111111111111';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp up to 50 users
    { duration: '1m', target: 50 },   // stay for 1 minute
    { duration: '10s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'], // error rate < 1%
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
  },
};

export default function () {
  // 1. Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(loginRes, { 'login successful': (r) => r.status === 200 });

  let token = null;
  try {
    const body = JSON.parse(loginRes.body);
    token = body.token || body.accessToken;
  } catch { /* empty */ }

  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };

  // 2. Get campaign details
  const campaignRes = http.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}`, { headers });
  check(campaignRes, { 'campaign loaded': (r) => r.status === 200 });

  // 3. Submit contribution
  const payload = JSON.stringify({
    campaignId: CAMPAIGN_ID,
    amount: '5',
    asset: 'USDC',
  });
  const contribRes = http.post(
    `${BASE_URL}/api/contributions`,
    payload,
    { headers: { 'Content-Type': 'application/json', ...headers } }
  );
  check(contribRes, {
    'contribution created': (r) => r.status === 201 || r.status === 200,
  });

  sleep(1);
}

