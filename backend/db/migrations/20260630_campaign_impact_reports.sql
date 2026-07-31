-- Migration: Campaign Impact Reports
-- Allows creators to publish impact reports for completed campaigns
-- Reports include markdown content, images, videos, and milestone tracking

CREATE TABLE campaign_impact_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id        UUID NOT NULL REFERENCES users(id),
  title             VARCHAR(255) NOT NULL,
  content           TEXT NOT NULL,
  summary           VARCHAR(500),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published')),
  published_at      TIMESTAMPTZ,
  images            JSONB DEFAULT '[]'::jsonb,
  videos            JSONB DEFAULT '[]'::jsonb,
  milestones        JSONB DEFAULT '[]'::jsonb,
  views_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_impact_reports_campaign_id 
  ON campaign_impact_reports(campaign_id);
CREATE INDEX idx_impact_reports_creator_id 
  ON campaign_impact_reports(creator_id);
CREATE INDEX idx_impact_reports_status 
  ON campaign_impact_reports(status);
CREATE INDEX idx_impact_reports_published_at 
  ON campaign_impact_reports(published_at) 
  WHERE status = 'published';

-- Impact report badges awarded to creators
CREATE TABLE creator_impact_badges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id       UUID NOT NULL REFERENCES campaigns(id),
  report_id         UUID NOT NULL REFERENCES campaign_impact_reports(id) ON DELETE CASCADE,
  awarded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, campaign_id)
);

CREATE INDEX idx_impact_badges_user_id 
  ON creator_impact_badges(user_id);
CREATE INDEX idx_impact_badges_campaign_id 
  ON creator_impact_badges(campaign_id);
