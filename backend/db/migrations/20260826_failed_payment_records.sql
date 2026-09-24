CREATE TABLE IF NOT EXISTS failed_payment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  wallet_public_key TEXT NOT NULL,
  payment_record  JSONB NOT NULL,
  error_message   TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS failed_payment_records_tx_campaign_idx
  ON failed_payment_records ((payment_record->>'transaction_hash'), campaign_id);
