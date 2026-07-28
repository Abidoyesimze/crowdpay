-- Campaign follow/watch (#592)
CREATE TABLE IF NOT EXISTS campaign_followers (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  notify_updates    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_milestones BOOLEAN NOT NULL DEFAULT TRUE,
  notify_funding    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS campaign_followers_campaign_idx ON campaign_followers (campaign_id);

-- One row per funding threshold announced, so a campaign that crosses 50% only
-- ever notifies its followers once even if raised_amount is recalculated.
CREATE TABLE IF NOT EXISTS campaign_funding_milestones (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  threshold   INT NOT NULL,
  reached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, threshold)
);
