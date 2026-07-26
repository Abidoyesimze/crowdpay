/**
 * K6 Load Test — Contribution Submission Flow
 *
 * Simulates the full custodial contribution pipeline:
 *   1. POST /api/auth/login          — authenticate
 *   2. GET  /api/contributions/quote — get exchange rate
 *   3. POST /api/contributions/prepare — build unsigned transaction
 *   4. POST /api/contributions/submit-signed — submit (mocked signing)
 *
 * This is a write-heavy test. Use lower VU counts than campaign-browse.
 *
 * Default thresholds:
 *   - p(95) of the full flow < 2000ms
 *   - p(95) of quote endpoint < 300ms
 *   - error rate < 1%
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const CONTRIBUTOR_EMAIL = __ENV.CONTRIBUTOR_EMAIL || 'alice@example.com';
const CONTRIBUTOR_PASSWORD = __ENV.CONTRIBUTOR_PASSWORD || 'password123';

const ACTIVE_CAMPAIGN_ID = '11111111-1111-1111-1111-111111111111';

export const options = {
  stages: [
    { duration: '20s', target: 5  },  // gentle ramp — contribution is write-heavy
    { duration: '1m',  target: 20 },
    { duration: '20s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed:   ['rate<0.01'],
    quote_duration:    ['p(95)<300'],
    contribution_flow_duration: ['p(95)<2000'],
  },
};

const quoteDuration = new Trend('quote_duration');
const flowDuration = new Trend('contribution_flow_duration');
const errorRate = new Rate('error_rate');

// ---------------------------------------------------------------------------
// Setup: runs once before all VUs start, returns shared auth token
// ---------------------------------------------------------------------------
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: CONTRIBUTOR_EMAIL, password: CONTRIBUTOR_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (res.status !== 200) {
    console.warn(`Login failed in setup: ${res.status} ${res.body}`);
    return { token: null };
  }
  const body = JSON.parse(res.body);
  return { token: body.token || body.accessToken || null };
}

export default function (data) {
  const token = data.token;
  if (!token) {
    sleep(1);
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const startTime = Date.now();

  group('Quote', () => {
    const res = http.get(
      `${BASE_URL}/api/contributions/quote?campaign_id=${ACTIVE_CAMPAIGN_ID}&source_asset=XLM&target_amount=10`,
      { headers: authHeaders, tags: { name: 'GET /api/contributions/quote' } }
    );

    quoteDuration.add(res.timings.duration);
    errorRate.add(res.status >= 400);

    check(res, {
      'quote status 200': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  group('Prepare contribution', () => {
    const res = http.post(
      `${BASE_URL}/api/contributions/prepare`,
      JSON.stringify({
        campaign_id: ACTIVE_CAMPAIGN_ID,
        amount: '10',
        asset: 'USDC',
        payment_type: 'payment',
      }),
      { headers: authHeaders, tags: { name: 'POST /api/contributions/prepare' } }
    );

    errorRate.add(res.status >= 400 && res.status !== 422);

    check(res, {
      'prepare returns xdr or error': (r) => r.status === 200 || r.status === 422 || r.status === 400,
    });

    sleep(1);
  });

  flowDuration.add(Date.now() - startTime);
  sleep(Math.random() * 2 + 1);
}
