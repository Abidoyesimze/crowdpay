-- Campaign draft auto-save (# enhancement)
CREATE TABLE IF NOT EXISTS campaign_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_data   JSONB NOT NULL,
  step        INT NOT NULL DEFAULT 1,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(creator_id)
);

CREATE INDEX IF NOT EXISTS campaign_drafts_creator_idx ON campaign_drafts (creator_id, saved_at DESC);
