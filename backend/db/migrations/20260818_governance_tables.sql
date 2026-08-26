-- Governance tables for fee registry and proposal management

CREATE TABLE IF NOT EXISTS governance_proposals_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stellar_proposal_id INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  rationale_text TEXT NOT NULL,
  proposed_fee_bps INTEGER NOT NULL,
  proposed_creator_share_bps INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'passed', 'failed', 'executed')),
  votes_for BIGINT NOT NULL DEFAULT 0,
  votes_against BIGINT NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_governance_proposals_stellar_id ON governance_proposals_meta(stellar_proposal_id);
CREATE INDEX idx_governance_proposals_status ON governance_proposals_meta(status);
CREATE INDEX idx_governance_proposals_created ON governance_proposals_meta(created_at DESC);

CREATE TABLE IF NOT EXISTS governance_votes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES governance_proposals_meta(id) ON DELETE CASCADE,
  voter_public_key TEXT NOT NULL,
  in_favor BOOLEAN NOT NULL,
  token_balance_at_vote NUMERIC(20, 7) NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_governance_votes_proposal ON governance_votes_log(proposal_id);
CREATE INDEX idx_governance_votes_voter ON governance_votes_log(voter_public_key);
CREATE UNIQUE INDEX idx_governance_votes_unique ON governance_votes_log(proposal_id, voter_public_key);
