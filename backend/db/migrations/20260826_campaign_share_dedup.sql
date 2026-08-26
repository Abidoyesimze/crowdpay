-- Dedups POST /campaigns/:id/share within a rolling window so a repeated
-- click (or a script) from the same actor doesn't keep inflating share_count.
-- See issue #704.
CREATE TABLE IF NOT EXISTS campaign_share_dedup (
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  actor_hash      TEXT NOT NULL,
  last_shared_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, actor_hash)
);
