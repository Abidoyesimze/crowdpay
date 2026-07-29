-- Contribution Pools (#600)
-- Allow multiple users to pool contributions into a single larger contribution.
-- A pool has a leader who creates it, and members who contribute shares.

CREATE TABLE contribution_pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id),
  leader_id       UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT,
  target_amount   NUMERIC(20, 7) NOT NULL,
  raised_amount   NUMERIC(20, 7) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'submitted', 'cancelled')),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pool_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         UUID NOT NULL REFERENCES contribution_pools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  share_amount    NUMERIC(20, 7) NOT NULL DEFAULT 0,
  display_name    VARCHAR(50),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined')),
  contributed_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add pool_id to existing contributions
ALTER TABLE contributions ADD COLUMN pool_id UUID REFERENCES contribution_pools(id);
ALTER TABLE contributions ADD COLUMN pool_share_amount NUMERIC(20, 7);

-- Indexes
CREATE INDEX idx_contribution_pools_campaign ON contribution_pools (campaign_id);
CREATE INDEX idx_contribution_pools_leader ON contribution_pools (leader_id);
CREATE INDEX idx_contribution_pools_status ON contribution_pools (status);
CREATE INDEX idx_pool_members_pool ON pool_members (pool_id);
CREATE INDEX idx_pool_members_user ON pool_members (user_id);
CREATE INDEX idx_contributions_pool ON contributions (pool_id) WHERE pool_id IS NOT NULL;

-- Trigger to update updated_at on contribution_pools
CREATE OR REPLACE FUNCTION update_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pool_updated_at
  BEFORE UPDATE ON contribution_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_pool_updated_at();
