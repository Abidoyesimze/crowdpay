-- GeoIP region/subdivision for session and login records (Issue #493)
--
-- The GeoIP providers all return a subdivision (state/region) alongside city
-- and country. Storing it lets the session UI disambiguate same-named cities
-- and gives fraud review a coarser signal than city without dropping to
-- country level.

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS location_region TEXT;
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS location_region TEXT;
ALTER TABLE login_alerts ADD COLUMN IF NOT EXISTS location_region TEXT;
