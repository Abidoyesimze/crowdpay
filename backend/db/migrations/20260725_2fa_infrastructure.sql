CREATE TABLE trusted_devices (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  ip_address INET,
  trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, device_fingerprint)
);

CREATE TABLE security_audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN enforce_2fa BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_fingerprint ON trusted_devices(user_id, device_fingerprint);
CREATE INDEX idx_security_audit_log_user ON security_audit_log(user_id);
CREATE INDEX idx_security_audit_log_created ON security_audit_log(created_at);
