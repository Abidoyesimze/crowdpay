-- Campaign comment upvotes table (#345)
CREATE TABLE IF NOT EXISTS campaign_comment_upvotes (
  comment_id  UUID NOT NULL REFERENCES campaign_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS campaign_comment_upvotes_comment_idx
  ON campaign_comment_upvotes (comment_id);
