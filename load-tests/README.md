# CrowdPay Load Tests (K6)

This directory contains [K6](https://k6.io) load-testing scripts for the CrowdPay backend API.

## Prerequisites

Install K6 (one-time):

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows (Chocolatey)
choco install k6
```

## Scripts

| Script | Description |
|---|---|
| `campaign-browse.js` | High-traffic campaign listing — simulates users browsing the home page |
| `contribution-submit.js` | End-to-end contribution flow — quote → prepare → submit |
| `auth-flow.js` | Login and authenticated profile endpoint throughput |
| `smoke.js` | Quick smoke test — runs all scripts at 1 VU for 10 seconds |

## Running

```bash
# Smoke test (all endpoints, 1 VU)
k6 run load-tests/smoke.js

# Campaign browse — 50 concurrent users, 2 minutes
k6 run --vus 50 --duration 2m load-tests/campaign-browse.js

# Contribution flow — 20 concurrent users, 1 minute
k6 run --vus 20 --duration 1m load-tests/contribution-submit.js

# Auth flow — 30 concurrent users, 2 minutes
k6 run --vus 30 --duration 2m load-tests/auth-flow.js

# Full soak test (all, 5 minutes)
BASE_URL=https://api.crowdpay.example.com k6 run --vus 100 --duration 5m load-tests/campaign-browse.js
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3001` | Backend API base URL |
| `CREATOR_EMAIL` | `bola@example.com` | Seed creator credentials |
| `CREATOR_PASSWORD` | `creator123` | |
| `CONTRIBUTOR_EMAIL` | `alice@example.com` | Seed contributor credentials |
| `CONTRIBUTOR_PASSWORD` | `password123` | |

## Acceptance Thresholds

All scripts enforce the following SLOs:
- **p(95) response time ≤ 500 ms** for read endpoints
- **p(99) response time ≤ 2000 ms** for write endpoints
- **Error rate < 1%** across all requests
# Load tests

[k6](https://k6.io) load-testing scripts for the CrowdPay API.

| Script | Scenario |
|---|---|
| `browse.js` | Anonymous browsing — homepage campaign list, campaign detail, contributions (ramps to 100 VUs) |
| `contribute.js` | Authenticated flow — login, view campaign, submit contribution (ramps to 50 VUs) |

## Running

```sh
k6 run load-tests/browse.js
```

Before running, edit the target host (`https://your-app.com`) and the placeholder
`campaignId` / credentials in each script to point at the environment under test.
