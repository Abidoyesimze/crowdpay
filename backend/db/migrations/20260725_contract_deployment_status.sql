-- Track contract deployment lifecycle per campaign
-- Values: 'deploying', 'deployed', 'failed'
-- NULL means legacy campaign created before this tracking was added
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS contract_deployment_status TEXT
    CHECK (contract_deployment_status IN ('deploying', 'deployed', 'failed'))
    DEFAULT NULL;

-- Store the last deployment error so admins can diagnose failures
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS contract_deployment_error TEXT;

-- Timestamp of last deployment attempt (for retry backoff)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS last_deployment_attempt_at TIMESTAMPTZ;

-- Index for the cron retry query
CREATE INDEX IF NOT EXISTS idx_campaigns_deployment_retry
  ON campaigns (contract_deployment_status, last_deployment_attempt_at)
  WHERE contract_deployment_status = 'failed';

-- Backfill existing campaigns that have a deployed contract
UPDATE campaigns
SET contract_deployment_status = 'deployed'
WHERE escrow_contract_id IS NOT NULL
  AND contract_deployment_status IS NULL;
