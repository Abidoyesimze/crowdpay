CREATE TABLE IF NOT EXISTS milestone_votes (
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (milestone_id, user_id)
);

CREATE INDEX IF NOT EXISTS milestone_votes_milestone_vote_idx
  ON milestone_votes (milestone_id, vote);
