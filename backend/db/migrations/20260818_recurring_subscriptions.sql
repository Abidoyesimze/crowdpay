BEGIN;

-- Recurring pledges. Stellar has no native recurring payment primitive, so a
-- subscription is materialised as one claimable balance per period, created
-- up-front from the contributor's wallet.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contributor_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_per_period   NUMERIC(20, 7) NOT NULL CHECK (amount_per_period > 0),
  asset               TEXT        NOT NULL,
  period_months       INTEGER     NOT NULL CHECK (period_months IN (1, 3, 6)),
  total_periods       INTEGER     NOT NULL CHECK (total_periods BETWEEN 2 AND 24),
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_balances (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    UUID        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  stellar_balance_id TEXT        NOT NULL,
  scheduled_date     TIMESTAMPTZ NOT NULL,
  amount             NUMERIC(20, 7) NOT NULL CHECK (amount > 0),
  status             TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'claimed', 'contributor_reclaimed', 'cancellation_requested')),
  claimed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS subscriptions_contributor_idx
  ON subscriptions (contributor_user_id, status);

CREATE INDEX IF NOT EXISTS subscriptions_campaign_idx
  ON subscriptions (campaign_id);

CREATE INDEX IF NOT EXISTS subscription_balances_due_idx
  ON subscription_balances (scheduled_date)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS subscription_balances_subscription_idx
  ON subscription_balances (subscription_id);

-- Claimed subscription periods are recorded as contributions so they show up in
-- campaign totals, dashboards and exports like any other contribution.
ALTER TABLE contributions
  DROP CONSTRAINT IF EXISTS contributions_payment_type_check;

ALTER TABLE contributions
  ADD CONSTRAINT contributions_payment_type_check
  CHECK (payment_type IN (
    'payment',
    'path_payment_strict_receive',
    'reconciliation_adjustment',
    'subscription_claim'
  ));

COMMIT;
