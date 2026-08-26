BEGIN;

-- Tracks in-flight self-custody ("Freighter") contribution intent so
-- max_contribution / max_per_user can be enforced atomically across
-- concurrent /prepare calls, not just at custodial-flow submission time
-- (issue #713).
ALTER TABLE stellar_transactions
  ADD COLUMN IF NOT EXISTS sender_public_key TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(20,7),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE stellar_transactions
  DROP CONSTRAINT IF EXISTS stellar_transactions_status_check;

ALTER TABLE stellar_transactions
  ADD CONSTRAINT stellar_transactions_status_check
  CHECK (status IN (
    'reserved',
    'pending_signatures',
    'submitted',
    'indexed',
    'failed'
  ));

CREATE INDEX IF NOT EXISTS idx_stellar_transactions_cap_check
  ON stellar_transactions (campaign_id, sender_public_key, kind, status);

COMMIT;
