-- Threaded campaign comments + moderation flags (#437)
CREATE TABLE campaign_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id),
  parent_id     UUID REFERENCES campaign_comments(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason TEXT,
  hidden_by     UUID REFERENCES users(id),
  hidden_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX campaign_comments_campaign_created_idx
  ON campaign_comments (campaign_id, created_at DESC);
CREATE INDEX campaign_comments_parent_idx
  ON campaign_comments (parent_id);

CREATE TABLE campaign_comment_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES campaign_comments(id) ON DELETE CASCADE,
  flagged_by  UUID NOT NULL REFERENCES users(id),
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT campaign_comment_flags_unique UNIQUE (comment_id, flagged_by)
);
