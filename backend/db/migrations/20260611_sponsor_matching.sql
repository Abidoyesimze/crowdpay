-- Migration: Sponsor matching pools for campaigns

CREATE TABLE campaign_matches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sponsor_user_id   UUID NOT NULL REFERENCES users(id),
  match_ratio       NUMERIC(10, 2) NOT NULL CHECK (match_ratio > 0),
  pledge_amount     NUMERIC(20, 7) NOT NULL CHECK (pledge_amount > 0),
  matched_amount    NUMERIC(20, 7) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'exhausted', 'completed')),
  contract_id       TEXT,
  soroban_contract_address TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_campaign_matches_campaign_id 
  ON campaign_matches (campaign_id);
CREATE INDEX idx_campaign_matches_sponsor_id 
  ON campaign_matches (sponsor_user_id);
CREATE INDEX idx_campaign_matches_status 
  ON campaign_matches (status) WHERE status = 'active';
CREATE INDEX idx_campaign_matches_campaign_status
  ON campaign_matches (campaign_id, status);

-- Contribution records now track if they used matching funds
ALTER TABLE contributions
ADD COLUMN IF NOT EXISTS match_amount NUMERIC(20, 7) DEFAULT 0,
ADD COLUMN IF NOT EXISTS campaign_match_id UUID REFERENCES campaign_matches(id);

CREATE INDEX IF NOT EXISTS idx_contributions_match_id 
  ON contributions (campaign_match_id);
