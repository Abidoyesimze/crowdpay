-- Enhanced fraud detection: device fingerprinting (#595)
-- Stores a salted HMAC of the client-supplied device fingerprint (never the raw value).
-- Used to detect coordinated contributions originating from the same device cluster.

ALTER TABLE contributions
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- Cluster lookups group contributions by (campaign, device); a partial index keeps it lean.
CREATE INDEX IF NOT EXISTS contributions_device_fingerprint_idx
  ON contributions (campaign_id, device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- Cross-campaign device clustering (coordinated campaigns from one device).
CREATE INDEX IF NOT EXISTS contributions_device_fingerprint_global_idx
  ON contributions (device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;
