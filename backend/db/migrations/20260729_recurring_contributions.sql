CREATE TABLE IF NOT EXISTS recurring_contributions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  amount        NUMERIC(20, 7) NOT NULL CHECK (amount > 0),
  interval      TEXT        NOT NULL CHECK (interval IN ('weekly', 'monthly')),
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  next_run_at   TIMESTAMPTZ NOT NULL,
  last_run_at   TIMESTAMPTZ,
  run_count     INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_contributions_next_run_idx
  ON recurring_contributions (next_run_at)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS recurring_contributions_user_idx
  ON recurring_contributions (user_id);

CREATE INDEX IF NOT EXISTS recurring_contributions_campaign_idx
  ON recurring_contributions (campaign_id);
