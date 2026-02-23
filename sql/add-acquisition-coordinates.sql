-- Add latitude/longitude columns to acquisition table
-- These come from Airtable's Latitude/Longitude fields,
-- eliminating the need for slow Nominatim geocoding in InstallationMapView.

ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Create partial index for geo queries (only rows with coordinates)
CREATE INDEX IF NOT EXISTS idx_acquisition_coordinates
  ON acquisition (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
