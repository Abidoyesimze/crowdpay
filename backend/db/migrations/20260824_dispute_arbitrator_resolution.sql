-- Arbitrator-backed dispute resolution: on-chain escrow freeze, evidence
-- submission with attachments, and platform arbitrator decisions.
-- Extends the existing disputes system (20260428_dispute_resolution.sql)
-- rather than replacing it.

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arbitrator_signer_added BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS decision TEXT
    CHECK (decision IN ('release_to_creator', 'refund_contributors'));

-- POST /admin/disputes/:id/decide resolves via a single generic 'resolved'
-- status (the outcome is captured by the new `decision` column instead of a
-- decision-specific status value like the legacy 'resolved_creator').
ALTER TABLE disputes
  DROP CONSTRAINT IF EXISTS disputes_status_check;

ALTER TABLE disputes
  ADD CONSTRAINT disputes_status_check
    CHECK (status IN (
      'open', 'under_review', 'resolved_creator', 'resolved_contributor',
      'closed', 'resolved'
    ));

CREATE TABLE dispute_evidence (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id       UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  submitted_by     UUID NOT NULL REFERENCES users(id),
  role             TEXT NOT NULL CHECK (role IN ('creator', 'contributor')),
  text             TEXT NOT NULL,
  attachment_urls  JSONB NOT NULL DEFAULT '[]',
  submitted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX dispute_evidence_dispute_idx ON dispute_evidence (dispute_id, submitted_at ASC);

-- 20260819_soroban_treasury.sql rewrote this constraint and accidentally
-- dropped 'on_hold' (added by 20260428_dispute_resolution.sql) from the
-- allowed set, silently breaking the dispute-freeze-withdrawals step. Restore
-- it so raising a dispute can actually put pending withdrawals on hold.
ALTER TABLE withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;

ALTER TABLE withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
    CHECK (status IN (
      'pending', 'submitted', 'failed', 'denied',
      'pending_creator', 'pending_auditor', 'completed', 'rejected',
      'on_hold'
    ));

-- Campaigns are blocked from accepting new contributions while disputed
-- (see routes/contributions.js CAMPAIGN_DISPUTED check).
ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check
    CHECK (status IN (
      'draft', 'active', 'funded', 'in_progress', 'completed',
      'closed', 'withdrawn', 'failed', 'refunded', 'disputed'
    ));
