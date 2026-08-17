-- Creator analytics cache table
CREATE TABLE IF NOT EXISTS creator_analytics_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cache_key     TEXT NOT NULL,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(creator_id, cache_key)
);

CREATE INDEX idx_creator_analytics_cache_lookup
  ON creator_analytics_cache(creator_id, cache_key);

-- Platform benchmarks table
CREATE TABLE IF NOT EXISTS platform_benchmarks (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket                       VARCHAR(20) NOT NULL CHECK (bracket IN ('small', 'medium', 'large')),
  asset                         TEXT NOT NULL,
  avg_goal_pct                  NUMERIC(10, 2),
  avg_time_to_first_contribution_hours NUMERIC(12, 2),
  avg_contributor_count         NUMERIC(10, 2),
  sample_size                   INT NOT NULL DEFAULT 0,
  computed_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bracket, asset)
);

CREATE INDEX idx_platform_benchmarks_lookup
  ON platform_benchmarks(bracket, asset);

-- Export rate limiting table
CREATE TABLE IF NOT EXISTS creator_export_rate_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  export_count  INT NOT NULL DEFAULT 0,
  UNIQUE(creator_id, export_date)
);
