-- Enforce a maximum length on campaign update bodies at the database
-- level — defence-in-depth alongside the API validation (issue #400).
ALTER TABLE campaign_updates
  ADD CONSTRAINT campaign_updates_body_length CHECK (char_length(body) <= 5000);
