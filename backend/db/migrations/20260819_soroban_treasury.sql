-- Soroban-enforced spending policies, timelocked withdrawals & audit trail (Issue #687)
--
-- Adds a second campaign wallet tier alongside the existing threshold-2 multisig.
-- A campaign in 'contract' mode has its funds held by a campaign_treasury Soroban
-- contract that enforces the spending policy on-chain; a campaign in 'standard'
-- mode keeps the multisig behaviour and is unaffected by everything here.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS wallet_mode        TEXT NOT NULL DEFAULT 'standard'
                             CHECK (wallet_mode IN ('standard', 'contract')),
  ADD COLUMN IF NOT EXISTS contract_id        TEXT,
  ADD COLUMN IF NOT EXISTS contract_version   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS auditor_public_key TEXT;

-- Only contract-mode campaigns may carry a treasury contract id.
CREATE INDEX IF NOT EXISTS campaigns_contract_id_idx
  ON campaigns (contract_id) WHERE contract_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS treasury_policies (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id                UUID NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  -- Days after the campaign deadline before any withdrawal is permitted.
  min_hold_days              INTEGER NOT NULL DEFAULT 0
                               CHECK (min_hold_days >= 0 AND min_hold_days <= 90),
  -- Largest share of the balance a single withdrawal may take.
  max_single_withdrawal_pct  INTEGER NOT NULL DEFAULT 100
                               CHECK (max_single_withdrawal_pct >= 1 AND max_single_withdrawal_pct <= 100),
  withdrawal_cooldown_hours  INTEGER NOT NULL DEFAULT 0
                               CHECK (withdrawal_cooldown_hours >= 0 AND withdrawal_cooldown_hours <= 168),
  -- Withdrawals strictly above this amount need the auditor as a third signer.
  require_auditor_for_above  NUMERIC(20, 7) NOT NULL DEFAULT 0
                               CHECK (require_auditor_for_above >= 0),
  auto_refund_on_miss        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contract-mode withdrawals are tracked in the same ledger as multisig ones so
-- the two tiers reconcile against one table. The existing columns stay untouched
-- for 'standard' campaigns; the columns below are only populated in contract mode.
ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS asset               TEXT,
  ADD COLUMN IF NOT EXISTS contract_pending_id INTEGER,
  ADD COLUMN IF NOT EXISTS creator_signed_xdr  TEXT,
  ADD COLUMN IF NOT EXISTS submitted_tx_hash   TEXT,
  ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMPTZ;

-- A contract-mode row has no multisig XDR to hold at creation time, so the
-- column can no longer be mandatory. Standard-mode rows still always set it.
ALTER TABLE withdrawal_requests ALTER COLUMN unsigned_xdr DROP NOT NULL;

-- Widen the status vocabulary with the contract-mode lifecycle, keeping every
-- existing value so in-flight multisig withdrawals stay valid.
ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN (
    'pending', 'submitted', 'failed', 'denied',
    'pending_creator', 'pending_auditor', 'completed', 'rejected'
  ));

CREATE INDEX IF NOT EXISTS withdrawal_requests_pending_auditor_idx
  ON withdrawal_requests (campaign_id, contract_pending_id)
  WHERE status = 'pending_auditor';

CREATE TABLE IF NOT EXISTS refund_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  total_refunded    NUMERIC(20, 7) NOT NULL,
  contributor_count INTEGER NOT NULL,
  triggered_by      UUID REFERENCES users(id),
  triggered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stellar_tx_hash   TEXT
);

CREATE INDEX IF NOT EXISTS refund_events_campaign_idx ON refund_events (campaign_id);
