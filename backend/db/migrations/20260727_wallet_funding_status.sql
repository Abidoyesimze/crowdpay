-- Migration: Add wallet funding status tracking columns to users table
-- Issue #394: Wallet funding failure at registration is silent

ALTER TABLE users
  ADD COLUMN wallet_funded_at TIMESTAMPTZ,
  ADD COLUMN wallet_funding_failed_at TIMESTAMPTZ;

-- Existing non-custodial (freighter) users manage their own wallets externally
UPDATE users
SET wallet_funded_at = created_at
WHERE wallet_type = 'freighter' AND wallet_funded_at IS NULL;
