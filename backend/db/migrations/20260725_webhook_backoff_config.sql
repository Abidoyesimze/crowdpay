-- Configurable per-webhook retry backoff (#434)
ALTER TABLE webhooks ADD COLUMN backoff_strategy JSONB;
ALTER TABLE campaign_webhooks ADD COLUMN backoff_strategy JSONB;
