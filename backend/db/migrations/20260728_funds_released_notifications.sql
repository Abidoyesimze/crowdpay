-- Funds released notifications (#590)
-- Allow users to opt in/out of email preferences for release transparency
-- events. In-app delivery remains the baseline notification channel.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'notification_preferences'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%channel%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notification_preferences DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE notification_preferences
    ADD CONSTRAINT notification_preferences_channel_check
    CHECK (channel IN ('in_app', 'email', 'push', 'slack', 'discord', 'sms'));
END $$;
