-- Earned contributor badges (#597). Badges are derived from contribution
-- history, but they are recorded here so a badge is only announced once.
CREATE TABLE IF NOT EXISTS contributor_badges (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS contributor_badges_user_idx ON contributor_badges (user_id);
