-- Add missing database indexes for frequently queried columns

CREATE INDEX IF NOT EXISTS idx_contributions_sender_public_key
  ON contributions(sender_public_key);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_campaign_status
  ON withdrawal_requests(campaign_id, status);

DROP INDEX IF EXISTS idx_campaigns_is_hidden;
CREATE INDEX idx_campaigns_is_hidden
  ON campaigns(is_hidden)
  WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_campaigns_is_flagged_duplicate
  ON campaigns(is_flagged_duplicate)
  WHERE is_flagged_duplicate = FALSE;

CREATE INDEX IF NOT EXISTS idx_campaigns_is_flagged_fraud
  ON campaigns(is_flagged_fraud)
  WHERE is_flagged_fraud = TRUE;
