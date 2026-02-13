-- ═══════════════════════════════════════════════════════════════════
-- Vistar SSP Integration – Supabase Tables
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Networks (Vistar Network = Display-Sammlung)
CREATE TABLE IF NOT EXISTS vistar_networks (
  id TEXT PRIMARY KEY,
  name TEXT,
  api_key TEXT,
  venue_count INTEGER DEFAULT 0,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venues/Displays (einzelne Screens)
CREATE TABLE IF NOT EXISTS vistar_venues (
  id TEXT PRIMARY KEY,
  network_id TEXT REFERENCES vistar_networks(id),
  partner_venue_id TEXT,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'DE',
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  display_width INTEGER,
  display_height INTEGER,
  allow_audio BOOLEAN DEFAULT FALSE,
  static_duration INTEGER,
  supported_media TEXT[],
  activation_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  venue_type TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venue Health/Diagnostics (täglicher Snapshot)
CREATE TABLE IF NOT EXISTS vistar_venue_health (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id TEXT REFERENCES vistar_venues(id),
  network_id TEXT,
  report_date DATE NOT NULL,
  is_requesting BOOLEAN DEFAULT FALSE,
  requested_spots INTEGER DEFAULT 0,
  leased_spots INTEGER DEFAULT 0,
  spent_spots INTEGER DEFAULT 0,
  spend_rate NUMERIC(5,2),
  expiration_rate NUMERIC(5,2),
  impressions NUMERIC(12,2) DEFAULT 0,
  partner_revenue NUMERIC(10,2) DEFAULT 0,
  partner_profit NUMERIC(10,2) DEFAULT 0,
  partner_ecpm NUMERIC(8,2) DEFAULT 0,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venue_id, report_date)
);

-- Sync-Log
CREATE TABLE IF NOT EXISTS vistar_sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_vistar_venues_network ON vistar_venues(network_id);
CREATE INDEX IF NOT EXISTS idx_vistar_venues_partner_id ON vistar_venues(partner_venue_id);
CREATE INDEX IF NOT EXISTS idx_vistar_venues_active ON vistar_venues(is_active);
CREATE INDEX IF NOT EXISTS idx_vistar_health_venue_date ON vistar_venue_health(venue_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_vistar_health_date ON vistar_venue_health(report_date DESC);

-- View: Aktueller Status aller Venues
CREATE OR REPLACE VIEW v_venue_status AS
SELECT
  v.id AS venue_id,
  v.partner_venue_id,
  v.name AS venue_name,
  n.name AS network_name,
  v.city,
  v.is_active,
  v.latitude,
  v.longitude,
  h.is_requesting,
  h.requested_spots,
  h.spent_spots,
  h.spend_rate,
  h.impressions,
  h.partner_revenue,
  h.partner_profit,
  h.partner_ecpm,
  h.report_date AS last_health_check,
  v.synced_at AS last_sync
FROM vistar_venues v
LEFT JOIN vistar_networks n ON v.network_id = n.id
LEFT JOIN LATERAL (
  SELECT *
  FROM vistar_venue_health vh
  WHERE vh.venue_id = v.id
  ORDER BY report_date DESC
  LIMIT 1
) h ON TRUE;

-- RLS: Allow read for authenticated users
ALTER TABLE vistar_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistar_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistar_venue_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE vistar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON vistar_networks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON vistar_venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON vistar_venue_health FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow read for authenticated" ON vistar_sync_log FOR SELECT TO authenticated USING (true);

-- Also allow anon read (dashboard uses anon key)
CREATE POLICY "Allow anon read" ON vistar_networks FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON vistar_venues FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON vistar_venue_health FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read" ON vistar_sync_log FOR SELECT TO anon USING (true);
