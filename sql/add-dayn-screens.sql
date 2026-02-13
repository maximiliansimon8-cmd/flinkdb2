-- ═══════════════════════════════════════════════════════════════════
-- Dayn Screens Integration + Network Support
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Dayn Screens Tabelle (zweites Netzwerk neben JET)
CREATE TABLE IF NOT EXISTS dayn_screens (
  id TEXT PRIMARY KEY,
  airtable_id TEXT UNIQUE,
  dayn_screen_id TEXT,
  do_screen_id TEXT,
  screen_status TEXT,
  network TEXT DEFAULT 'dayn',
  location_name TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  country TEXT DEFAULT 'GER',
  zip_code TEXT,
  venue_type TEXT,
  floor_cpm NUMERIC(8,2),
  screen_width_px INTEGER,
  screen_height_px INTEGER,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  screen_inch TEXT,
  screen_type TEXT,
  max_video_length TEXT,
  min_video_length TEXT,
  static_duration TEXT,
  static_supported BOOLEAN,
  video_supported BOOLEAN,
  dvac_week NUMERIC(12,2),
  dvac_month NUMERIC(12,2),
  dvac_day NUMERIC(12,2),
  impressions_per_spot NUMERIC(10,4),
  install_year TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices für schnelle Lookups
CREATE INDEX IF NOT EXISTS idx_dayn_screens_screen_id ON dayn_screens(dayn_screen_id);
CREATE INDEX IF NOT EXISTS idx_dayn_screens_status ON dayn_screens(screen_status);
CREATE INDEX IF NOT EXISTS idx_dayn_screens_city ON dayn_screens(city);

-- RLS
ALTER TABLE dayn_screens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON dayn_screens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON dayn_screens FOR SELECT TO anon USING (true);

-- Network-Spalte zu airtable_displays (JET Displays)
ALTER TABLE airtable_displays ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'jet';
