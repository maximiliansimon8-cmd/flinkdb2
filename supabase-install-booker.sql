-- ============================================
-- Install Date Booker - Supabase Tables
-- Run this SQL in the Supabase SQL Editor
-- ============================================

-- 1. Routen-Kapazitäten (bidirektional: Dashboard + Airtable)
CREATE TABLE IF NOT EXISTS install_routen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_id TEXT UNIQUE,
  city TEXT NOT NULL,
  schedule_date DATE NOT NULL,
  installer_team TEXT,
  max_capacity INTEGER NOT NULL DEFAULT 4,
  time_slots JSONB NOT NULL DEFAULT '["09:00","11:00","14:00","16:00"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_routen_city ON install_routen(city);
CREATE INDEX IF NOT EXISTS idx_routen_date ON install_routen(schedule_date);
CREATE INDEX IF NOT EXISTS idx_routen_city_date ON install_routen(city, schedule_date);
CREATE INDEX IF NOT EXISTS idx_routen_status ON install_routen(status);

-- 2. Einzelne Buchungen
CREATE TABLE IF NOT EXISTS install_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_token TEXT UNIQUE NOT NULL,
  route_id UUID REFERENCES install_routen(id),
  akquise_airtable_id TEXT,
  termin_airtable_id TEXT,
  location_name TEXT,
  city TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  jet_id TEXT,
  booked_date DATE,
  booked_time TEXT,
  booked_end_time TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  booking_source TEXT NOT NULL DEFAULT 'self_booking',
  whatsapp_sent_at TIMESTAMPTZ,
  booked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_token ON install_bookings(booking_token);
CREATE INDEX IF NOT EXISTS idx_bookings_city ON install_bookings(city);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON install_bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON install_bookings(booked_date);
CREATE INDEX IF NOT EXISTS idx_bookings_city_date ON install_bookings(city, booked_date);
CREATE INDEX IF NOT EXISTS idx_bookings_route ON install_bookings(route_id);
CREATE INDEX IF NOT EXISTS idx_bookings_akquise ON install_bookings(akquise_airtable_id);

-- 3. Helper: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_routen_updated_at
  BEFORE UPDATE ON install_routen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON install_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. RLS Policies (service role bypasses RLS, anon can read bookings by token)
ALTER TABLE install_routen ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_bookings ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by Netlify Functions)
CREATE POLICY "Service role full access routen" ON install_routen
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access bookings" ON install_bookings
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 5. New user group: Terminierung (Scheduling)
-- ============================================
INSERT INTO groups (id, name, description, color, icon, tabs, actions) VALUES (
  'grp_scheduling',
  'Terminierung',
  'Installationstermine planen und verwalten',
  '#f97316',
  'CalendarCheck',
  ARRAY['installations', 'installations.calendar', 'installations.bookings'],
  ARRAY['view', 'view_contacts', 'manage_schedule', 'manage_bookings', 'send_booking_invite']
) ON CONFLICT (id) DO UPDATE SET
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions,
  description = EXCLUDED.description;
