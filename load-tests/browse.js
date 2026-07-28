import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const CAMPAIGN_ID = __ENV.CAMPAIGN_ID || '11111111-1111-1111-1111-111111111111';

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // ramp up to 100 anonymous users
    { duration: '1m', target: 100 },   // stay for 1 minute
    { duration: '10s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // error rate < 1%
    http_req_duration: ['p(95)<300'],  // 95% of requests under 300ms (browsing should be faster)
  },
};

export default function () {
  // 1. Browse the homepage (campaign list)
  const homeRes = http.get(`${BASE_URL}/api/campaigns?page=1&limit=20`);
  check(homeRes, {
    'homepage loaded': (r) => r.status === 200,
    'campaigns returned': (r) => {
      try {
        const body = JSON.parse(r.body);
        return (Array.isArray(body) && body.length > 0) || (Array.isArray(body.campaigns) && body.campaigns.length > 0);
      } catch {
        return false;
      }
    },
  });

  // 2. View campaign details
  const detailRes = http.get(`${BASE_URL}/api/campaigns/${CAMPAIGN_ID}`);
  check(detailRes, {
    'campaign detail loaded': (r) => r.status === 200,
    'campaign has title': (r) => {
      try { return typeof JSON.parse(r.body).title === 'string'; } catch { return false; }
    },
  });

  // 3. Optionally, fetch contributions for that campaign
  const contribRes = http.get(`${BASE_URL}/api/contributions?campaignId=${CAMPAIGN_ID}&limit=10`);
  check(contribRes, {
    'contributions list loaded': (r) => r.status === 200,
  });

  // Simulate user thinking / reading
  sleep(2);
}

