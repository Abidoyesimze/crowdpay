-- NFT-based contribution reward support for reward tiers.
-- Stores per-tier NFT configuration and per-contribution NFT mint state.

CREATE TABLE nft_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  reward_tier_id  UUID NOT NULL REFERENCES reward_tiers(id) ON DELETE CASCADE,
  contribution_id UUID REFERENCES contributions(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','minting','minted','failed')),
  metadata_url    TEXT,
  artwork_url     TEXT,
  token_id        TEXT,
  tx_hash         TEXT,
  serial_number   TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reward_tier_id, contribution_id)
);

CREATE INDEX ON nft_rewards (campaign_id);
CREATE INDEX ON nft_rewards (reward_tier_id);
CREATE INDEX ON nft_rewards (contribution_id);
