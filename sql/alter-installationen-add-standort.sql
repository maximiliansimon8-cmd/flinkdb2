-- Add Standort (location) fields to installationen table
-- These fields are lookups from the linked Akquise table in Airtable
-- and are needed for:
--   1. Joining installations to bookings/routes via akquise_links
--   2. Displaying JET-ID, location name, city in the Team Dashboard
--   3. Showing installation status per Standort

ALTER TABLE installationen ADD COLUMN IF NOT EXISTS akquise_links jsonb DEFAULT '[]'::jsonb;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS jet_id text;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS location_name text;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS street_number text;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS postal_code text;

-- Index on jet_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_installationen_jet_id ON installationen (jet_id);

-- Index on city for filtering by city
CREATE INDEX IF NOT EXISTS idx_installationen_city ON installationen (city);

-- Index on install_date for date-range queries
CREATE INDEX IF NOT EXISTS idx_installationen_install_date ON installationen (install_date);

-- Index on status for filtering by installation status
CREATE INDEX IF NOT EXISTS idx_installationen_status ON installationen (status);

-- Also add superchat_test_phone feature flag if missing
INSERT INTO feature_flags (key, enabled, description)
VALUES ('superchat_test_phone', false, '+491234567890')
ON CONFLICT (key) DO NOTHING;
