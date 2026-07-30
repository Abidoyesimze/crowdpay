CREATE TABLE IF NOT EXISTS campaign_stretch_goals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  amount      NUMERIC(20, 7) NOT NULL CHECK (amount > 0),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_stretch_goals_campaign_idx
  ON campaign_stretch_goals (campaign_id, sort_order);
