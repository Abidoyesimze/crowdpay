-- AI-powered campaign recommendations
CREATE TABLE IF NOT EXISTS campaign_recommendations (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  score        NUMERIC(10, 4) NOT NULL DEFAULT 0,
  reasons      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS campaign_recommendations_user_score_idx
  ON campaign_recommendations (user_id, score DESC, campaign_id);

CREATE TABLE IF NOT EXISTS campaign_recommendation_dismissals (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL DEFAULT 'dismissed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);
