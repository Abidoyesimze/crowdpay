-- Soroban milestone escrow upgrade path (Issue #679)
--
-- campaigns.contract_id / contract_version already exist (20260819_soroban_treasury.sql)
-- but belong to the unrelated campaign_treasury spending-policy feature (#687), keyed
-- off wallet_mode = 'contract'. The milestone escrow pair (escrow_contract_id /
-- milestones_contract_id, added 20260429_add_soroban_contract_ids.sql) is versioned
-- separately here to avoid colliding with that meaning. Only the milestones
-- contract is replaced on upgrade (escrow_contract_id is untouched), so only
-- its previous id needs to be retained for audit purposes.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS escrow_contract_version        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_milestones_contract_id TEXT,
  ADD COLUMN IF NOT EXISTS migration_in_progress           BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS campaigns_migration_in_progress_idx
  ON campaigns (id) WHERE migration_in_progress = TRUE;
