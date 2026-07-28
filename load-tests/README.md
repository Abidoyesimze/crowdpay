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
| `smoke.js` | Quick smoke test — runs all major endpoints at 1 VU for 30 seconds |
| `browse.js` | Anonymous browsing — homepage campaign list, detail, and contributions (ramps to 100 VUs) |
| `campaign-browse.js` | High-traffic campaign listing — simulates users browsing public campaigns |
| `contribute.js` | Authenticated contribution flow — login, view campaign, submit contribution (ramps to 50 VUs) |
| `contribution-submit.js` | End-to-end custodial contribution flow — quote → prepare → submit |
| `auth-flow.js` | Login and authenticated profile endpoint throughput |

## Environment Variables

All scripts read target hosts, credentials, and parameters from environment variables with sensible defaults for local development.

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3001` | Backend API base URL |
| `CREATOR_EMAIL` | `bola@example.com` | Seed creator email |
| `CREATOR_PASSWORD` | `creator123` | Seed creator password |
| `CONTRIBUTOR_EMAIL` | `alice@example.com` | Seed contributor email |
| `CONTRIBUTOR_PASSWORD` | `password123` | Seed contributor password |
| `USER_EMAIL` | `alice@example.com` | User email for `contribute.js` |
| `USER_PASSWORD` | `password123` | User password for `contribute.js` |
| `CAMPAIGN_ID` | `11111111-1111-1111-1111-111111111111` | Primary target campaign UUID |
| `CAMPAIGN_IDS` | Seed campaign array | Comma-separated list of campaign UUIDs for `campaign-browse.js` |

## Running

```bash
# Quick smoke test with defaults
k6 run load-tests/smoke.js

# Campaign browsing test with custom target environment
k6 run -e BASE_URL=https://api.staging.crowdpay.com load-tests/campaign-browse.js

# Custom credentials and campaign ID
k6 run -e BASE_URL=http://localhost:3001 -e CONTRIBUTOR_EMAIL=user@example.com -e CONTRIBUTOR_PASSWORD=secret load-tests/contribute.js

# Passing environment variables via shell
BASE_URL=https://api.crowdpay.example.com k6 run --vus 50 --duration 2m load-tests/campaign-browse.js
```

## Acceptance Thresholds

All scripts enforce the following SLOs:
- **p(95) response time ≤ 500 ms** for read endpoints
- **p(99) response time ≤ 2000 ms** for write endpoints
- **Error rate < 1%** across all requests

