-- Migration: Ensure UNIQUE constraint on referral_code in campaign_referrals table
-- Issue #396: Referral code collision check & defence-in-depth UNIQUE constraint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_referrals_referral_code_key'
  ) THEN
    ALTER TABLE campaign_referrals ADD CONSTRAINT campaign_referrals_referral_code_key UNIQUE (referral_code);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
