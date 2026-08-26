-- Records payments to a campaign wallet whose asset doesn't match the
-- campaign's configured asset_type/issuer, instead of crediting them to
-- raised_amount. See issue #707.
CREATE TABLE IF NOT EXISTS quarantined_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES campaigns(id),
  wallet_public_key   TEXT NOT NULL,
  sender_public_key   TEXT NOT NULL,
  tx_hash             TEXT UNIQUE,
  asset_code          TEXT,
  asset_issuer        TEXT,
  amount              NUMERIC(20,7) NOT NULL,
  expected_asset_type TEXT NOT NULL,
  reason              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantined_payments_campaign_id ON quarantined_payments(campaign_id);
