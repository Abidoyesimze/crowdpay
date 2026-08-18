-- Campaign referral & affiliate system (Issue #675)
--
-- Creators opt a campaign into referrals by creating a referral_programs row.
-- Any registered user can then claim a referral_links row carrying a unique
-- 8-character code; contributions made through that link are attributed via
-- contributions.referral_link_id and paid out as commission at withdrawal time.

CREATE TABLE referral_programs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  commission_percentage NUMERIC(5, 2) NOT NULL CHECK (commission_percentage >= 1 AND commission_percentage <= 20),
  max_referrers         INTEGER NOT NULL CHECK (max_referrers >= 1 AND max_referrers <= 100),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE referral_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9]{8}$'),
  -- Commission already included in a submitted withdrawal, so repeat
  -- withdrawals never pay the same referrer twice.
  commission_paid NUMERIC(20, 7) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX referral_links_campaign_idx ON referral_links (campaign_id);
CREATE INDEX referral_links_user_idx ON referral_links (user_id);

ALTER TABLE contributions ADD COLUMN referral_link_id UUID REFERENCES referral_links(id);

CREATE INDEX contributions_referral_link_idx
  ON contributions (referral_link_id)
  WHERE referral_link_id IS NOT NULL;
