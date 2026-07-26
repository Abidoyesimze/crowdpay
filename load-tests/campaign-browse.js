/**
 * K6 Load Test — Campaign Browse
 *
 * Simulates the highest-traffic scenario: many users browsing the public
 * campaign listing. Tests:
 *   GET /api/campaigns             (paginated list)
 *   GET /api/campaigns/:id         (single campaign detail)
 *   GET /api/campaigns/:id/backers (backer list)
 *
 * Default thresholds:
 *   - http_req_duration p(95) < 500ms
 *   - http_req_failed   < 1%
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Seed campaign IDs (match backend/db/seed.sql)
const CAMPAIGN_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up to 20 VUs
    { duration: '1m',  target: 50 },  // hold at 50 VUs
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed:   ['rate<0.01'],
    campaign_list_duration: ['p(95)<400'],
    campaign_detail_duration: ['p(95)<400'],
  },
};

const campaignListDuration = new Trend('campaign_list_duration');
const campaignDetailDuration = new Trend('campaign_detail_duration');
const errorRate = new Rate('error_rate');

// ---------------------------------------------------------------------------
// Default function (executed by each VU)
// ---------------------------------------------------------------------------
export default function () {
  const headers = { 'Content-Type': 'application/json' };

  group('Campaign listing', () => {
    const page = Math.floor(Math.random() * 3);
    const res = http.get(
      `${BASE_URL}/api/campaigns?limit=12&offset=${page * 12}&status=active`,
      { headers, tags: { name: 'GET /api/campaigns' } }
    );

    campaignListDuration.add(res.timings.duration);
    errorRate.add(res.status >= 400);

    check(res, {
      'campaign list status 200': (r) => r.status === 200,
      'campaign list has campaigns key': (r) => {
        try { return Array.isArray(JSON.parse(r.body).campaigns); } catch { return false; }
      },
    });

    sleep(Math.random() * 1 + 0.5); // 0.5–1.5s think time
  });

  group('Campaign detail', () => {
    const campaignId = CAMPAIGN_IDS[Math.floor(Math.random() * CAMPAIGN_IDS.length)];
    const res = http.get(
      `${BASE_URL}/api/campaigns/${campaignId}`,
      { headers, tags: { name: 'GET /api/campaigns/:id' } }
    );

    campaignDetailDuration.add(res.timings.duration);
    errorRate.add(res.status >= 400);

    check(res, {
      'campaign detail status 200': (r) => r.status === 200,
      'campaign has title': (r) => {
        try { return typeof JSON.parse(r.body).title === 'string'; } catch { return false; }
      },
    });

    sleep(Math.random() * 2 + 1); // 1–3s think time (reading page)
  });

  group('Campaign backers', () => {
    const campaignId = CAMPAIGN_IDS[Math.floor(Math.random() * CAMPAIGN_IDS.length)];
    const res = http.get(
      `${BASE_URL}/api/campaigns/${campaignId}/backers`,
      { headers, tags: { name: 'GET /api/campaigns/:id/backers' } }
    );

    errorRate.add(res.status >= 400);

    check(res, {
      'backers status 200': (r) => r.status === 200,
    });

    sleep(Math.random() * 0.5);
  });
}
