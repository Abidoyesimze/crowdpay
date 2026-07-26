CREATE TABLE IF NOT EXISTS platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  severity VARCHAR(20) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),

  details_url TEXT,
  active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_until TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_by UUID NOT NULL
    REFERENCES users(id)
    ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    active_until IS NULL
    OR active_until > active_from
  ),

  CHECK (
    deactivated_at IS NULL
    OR deactivated_at >= active_from
  )
);

CREATE INDEX IF NOT EXISTS idx_announcements_active_period
  ON platform_announcements (active_from, active_until);

CREATE INDEX IF NOT EXISTS idx_announcements_created_by
  ON platform_announcements (created_by);

CREATE INDEX IF NOT EXISTS idx_announcements_current
  ON platform_announcements (active_from DESC)
  WHERE deactivated_at IS NULL;
