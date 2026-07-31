-- Advanced faceted campaign search (#599): geographic location facet.
-- Optional ISO-3166-ish country/region string set by the campaign creator.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_campaigns_country
  ON campaigns (country)
  WHERE country IS NOT NULL;
