-- Campaign clone + draft status + scheduled publishing (#432)

-- Drafts have no on-chain wallet yet; allow NULL (UNIQUE still permits multiple NULLs).
ALTER TABLE campaigns ALTER COLUMN wallet_public_key DROP NOT NULL;

ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('draft', 'active', 'funded', 'in_progress', 'completed', 'closed', 'withdrawn', 'failed', 'refunded'));

ALTER TABLE campaigns ADD COLUMN scheduled_publish_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN cloned_from UUID REFERENCES campaigns(id);
