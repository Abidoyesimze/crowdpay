-- Verification tier system for KYC (#678)
-- Adds tiered verification status alongside existing kyc_status for backward compat.

-- New enum types
DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('unverified', 'pending', 'approved', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_tier AS ENUM ('none', 'basic', 'standard', 'enhanced');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status verification_status NOT NULL DEFAULT 'unverified';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_tier verification_tier NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS persona_inquiry_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_persona_inquiry_id_idx
  ON users (persona_inquiry_id)
  WHERE persona_inquiry_id IS NOT NULL;

-- Sync existing kyc_status data into verification_status
UPDATE users
SET verification_status = CASE
  WHEN kyc_status = 'verified' THEN 'approved'::verification_status
  WHEN kyc_status = 'pending' THEN 'pending'::verification_status
  WHEN kyc_status = 'rejected' THEN 'declined'::verification_status
  ELSE 'unverified'::verification_status
END,
verification_tier = CASE
  WHEN kyc_status = 'verified' THEN 'basic'::verification_tier
  ELSE 'none'::verification_tier
END
WHERE verification_status = 'unverified' AND kyc_status != 'unverified';

-- Audit trail for KYC events
CREATE TABLE IF NOT EXISTS kyc_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_inquiry_id TEXT,
  event_type        TEXT NOT NULL,
  tier_granted      verification_tier,
  decline_reason    TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kyc_events_user_id_idx ON kyc_events (user_id);
CREATE INDEX IF NOT EXISTS kyc_events_persona_inquiry_id_idx ON kyc_events (persona_inquiry_id);
