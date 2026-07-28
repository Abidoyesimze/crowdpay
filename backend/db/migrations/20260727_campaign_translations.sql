-- Campaign Translations (#602)
-- Allow creators to provide campaign descriptions in multiple languages.
-- Stored as a separate table to avoid schema changes on the campaigns table.

CREATE TABLE campaign_translations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  language        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, language)
);

CREATE INDEX idx_campaign_translations_campaign ON campaign_translations (campaign_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_translation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_translation_updated_at
  BEFORE UPDATE ON campaign_translations
  FOR EACH ROW
  EXECUTE FUNCTION update_translation_updated_at();
