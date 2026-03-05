-- ============================================================
-- CONSOLIDATED MIGRATION SCRIPT FOR FLINK_DOOH (nrijgfcdlvuhhudasicd)
-- ============================================================
--
-- Target: New Supabase instance Flink_DooH
-- Generated: 2026-03-05
-- Source: All SQL files from /home/user/flinkdb2/sql/
--
-- WHAT THIS SCRIPT DOES:
-- 1. Creates all tables needed by FlinkDB2 that do NOT already exist
-- 2. Adds missing columns/indexes to tables that already exist in the new instance
-- 3. Creates all RLS policies
-- 4. Creates all RPC functions (dashboard KPIs, KPI summary, mobile KPIs, etc.)
-- 5. Creates all views, triggers, sequences, and grants
--
-- TABLES ALREADY IN NEW INSTANCE (only ALTER/INDEX added):
--   displays, faw_data, installation_checklists, installations,
--   location_status_history, locations, notifications, profiles,
--   task_comments, tasks
--
-- ORDER:
--   1. Utility functions (used by triggers)
--   2. Base tables (no foreign keys)
--   3. Tables with foreign keys
--   4. ALTER TABLE for existing tables
--   5. Indexes
--   6. RLS + Policies
--   7. Views
--   8. RPC Functions
--   9. Triggers
--   10. Sequences & Grants
--   11. Seed data
--
-- USAGE: Run this entire script in the Supabase SQL Editor.
--        All statements are idempotent (IF NOT EXISTS / OR REPLACE).
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 0: UTILITY FUNCTIONS (used by triggers later)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_synced_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.synced_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================
-- SECTION 1: BASE TABLES (no foreign keys)
-- ============================================================


-- ═══ 1.1 app_users ═══
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  group_id TEXT,
  active BOOLEAN DEFAULT true,
  installer_team TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON app_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON app_users FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.2 groups ═══
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'Shield',
  tabs TEXT[] DEFAULT '{}',
  actions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_read" ON groups FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON groups FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.3 audit_log ═══
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anon_insert" ON audit_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_all" ON audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.4 stammdaten ═══
CREATE TABLE IF NOT EXISTS stammdaten (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  jet_id TEXT,
  display_ids JSONB,
  location_name TEXT,
  street TEXT,
  street_number TEXT,
  postal_code TEXT,
  city TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  location_email TEXT,
  location_phone TEXT,
  legal_entity TEXT,
  lead_status JSONB,
  display_status TEXT,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stammdaten_jet_id ON stammdaten(jet_id);
CREATE INDEX IF NOT EXISTS idx_stammdaten_city ON stammdaten(city);
CREATE INDEX IF NOT EXISTS idx_stammdaten_location ON stammdaten(location_name);
CREATE INDEX IF NOT EXISTS idx_stammdaten_display_status ON stammdaten(display_status);

ALTER TABLE stammdaten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON stammdaten FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_read" ON stammdaten FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON stammdaten FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Stammdaten extended columns (from add-stammdaten-all-fields.sql)
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS jet_search TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS jet_search_2 TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS location_search TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS location_categories TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS jet_chain TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS restaurant_website TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS lega_entity_adress TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS koordinaten TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS streetview_link TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS image_link TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS formatted_germany_mobile_phone TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS superchat_id TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS weischer_30m_frequency NUMERIC;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS regular_open_time TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS regular_close_time_weekdays TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS regular_close_time_weekdend TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS weekend_close_time TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS closed_days TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS akquise JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS zur_akquise_freigegeben BOOLEAN;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS akquise_freigabedatum TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS akquise_freigegeben_von TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS acquisition_update TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS installationen JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS record_id_from_installationen JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS count_installationen INTEGER;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS status_installation_from_installationen JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS installationstermine JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS displays JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS displays_copy JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS displays_copy_2 JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS live_display_locations_copy JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS ops_nr_from_displays JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS ops_sn_from_displays JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS online_status_from_displays JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS live_since_from_displays JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS related_tasks JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS tasks JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS tasks_copy JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS assigned_from_related_tasks JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS ops_player_inventory JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS deinstallation_ruecknahme JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS chg_approval JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS vertrag_pdf_from_akquise JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS attachments JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS brands_listed TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS date_first_online TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS imported TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS imported_table TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS caller_feedback_locations JSONB;

CREATE INDEX IF NOT EXISTS idx_stammdaten_latitude ON stammdaten (latitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_longitude ON stammdaten (longitude) WHERE longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_jet_chain ON stammdaten (jet_chain) WHERE jet_chain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_location_categories ON stammdaten (location_categories) WHERE location_categories IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_superchat_id ON stammdaten (superchat_id) WHERE superchat_id IS NOT NULL;


-- ═══ 1.5 airtable_displays ═══
CREATE TABLE IF NOT EXISTS airtable_displays (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  display_id TEXT,
  display_table_id TEXT,
  display_name TEXT,
  online_status TEXT,
  live_since DATE,
  deinstall_date DATE,
  screen_type TEXT,
  screen_size TEXT,
  screen_network_category TEXT,
  rtb_venue_type TEXT,
  navori_venue_id TEXT,
  navori_display_id NUMERIC,
  location_name TEXT,
  city TEXT,
  street TEXT,
  street_number TEXT,
  postal_code TEXT,
  jet_id TEXT,
  sov_partner_ad NUMERIC,
  passpartout BOOLEAN DEFAULT false,
  network TEXT DEFAULT 'jet',
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airtable_displays_display_id ON airtable_displays(display_id);
CREATE INDEX IF NOT EXISTS idx_airtable_displays_online_status ON airtable_displays(online_status);
CREATE INDEX IF NOT EXISTS idx_airtable_displays_navori_venue_id ON airtable_displays(navori_venue_id);
CREATE INDEX IF NOT EXISTS idx_airtable_displays_city ON airtable_displays(city);

ALTER TABLE airtable_displays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON airtable_displays FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_read" ON airtable_displays FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON airtable_displays FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.6 acquisition ═══
CREATE TABLE IF NOT EXISTS acquisition (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  akquise_id INTEGER,
  lead_status TEXT,
  frequency_approval TEXT,
  install_approval TEXT,
  approval_status TEXT,
  acquisition_date DATE,
  installations_status TEXT[],
  display_location_status TEXT[],
  city TEXT[],
  location_name TEXT,
  street TEXT,
  street_number TEXT,
  postal_code TEXT,
  jet_id TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  acquisition_partner TEXT,
  dVAC_week NUMERIC,
  schaufenster TEXT,
  hindernisse TEXT,
  mount_type TEXT,
  submitted_by TEXT,
  submitted_at DATE,
  vertrag_vorhanden TEXT,
  akquise_storno BOOLEAN DEFAULT false,
  post_install_storno BOOLEAN DEFAULT false,
  post_install_storno_grund TEXT[],
  ready_for_installation BOOLEAN DEFAULT false,
  -- Extended fields
  unterschriftsdatum TEXT,
  vertragsnummer TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  vertrag_pdf JSONB DEFAULT '[]',
  images JSONB DEFAULT '[]',
  faw_data_attachment JSONB DEFAULT '[]',
  akquise_kommentar TEXT,
  kommentar_installationen TEXT,
  frequency_approval_comment TEXT,
  dvac_month NUMERIC,
  dvac_day NUMERIC,
  hindernisse_beschreibung TEXT,
  fensterbreite TEXT,
  steckdose TEXT,
  -- Booking status
  booking_status TEXT DEFAULT NULL,
  booking_token TEXT DEFAULT NULL,
  booking_link_sent_at TIMESTAMPTZ DEFAULT NULL,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acquisition_lead_status ON acquisition(lead_status);
CREATE INDEX IF NOT EXISTS idx_acquisition_jet_id ON acquisition(jet_id);
CREATE INDEX IF NOT EXISTS idx_acquisition_date ON acquisition(acquisition_date);
CREATE INDEX IF NOT EXISTS idx_acquisition_coordinates ON acquisition (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acquisition_booking_status ON acquisition (booking_status) WHERE booking_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acquisition_extra_fields ON acquisition USING GIN (extra_fields) WHERE extra_fields IS NOT NULL;

ALTER TABLE acquisition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON acquisition FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_select_acquisition" ON acquisition FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON acquisition FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.7 installationen ═══
CREATE TABLE IF NOT EXISTS installationen (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  display_ids JSONB,
  install_date DATE,
  status TEXT,
  installation_type TEXT,
  integrator TEXT,
  technicians TEXT[],
  protocol_url TEXT,
  protocol_filename TEXT,
  screen_type TEXT,
  screen_size TEXT,
  ops_nr TEXT,
  sim_id TEXT,
  install_start TEXT,
  install_end TEXT,
  remarks TEXT,
  partner_name TEXT,
  akquise_links JSONB DEFAULT '[]',
  jet_id TEXT,
  location_name TEXT,
  city TEXT,
  street TEXT,
  street_number TEXT,
  postal_code TEXT,
  freigabe_online_rate BOOLEAN DEFAULT false,
  freigabe_installation_vorort BOOLEAN DEFAULT false,
  freigabe_chg BOOLEAN DEFAULT false,
  freigabe_datum_chg DATE,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installationen_jet_id ON installationen (jet_id);
CREATE INDEX IF NOT EXISTS idx_installationen_city ON installationen (city);
CREATE INDEX IF NOT EXISTS idx_installationen_install_date ON installationen (install_date);
CREATE INDEX IF NOT EXISTS idx_installationen_status ON installationen (status);
CREATE INDEX IF NOT EXISTS idx_installationen_freigabe_pending ON installationen (install_date) WHERE freigabe_online_rate = false AND status = 'Installiert';
CREATE INDEX IF NOT EXISTS idx_installationen_extra_fields ON installationen USING GIN (extra_fields) WHERE extra_fields IS NOT NULL;

ALTER TABLE installationen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON installationen FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_read" ON installationen FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON installationen FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.8 communications ═══
CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  channel TEXT,
  direction TEXT,
  subject TEXT,
  message TEXT,
  timestamp TIMESTAMPTZ,
  status TEXT,
  recipient_name TEXT,
  recipient_contact TEXT,
  sender TEXT,
  external_id TEXT,
  location_ids JSONB DEFAULT '[]',
  location_names JSONB DEFAULT '[]',
  display_ids JSONB DEFAULT '[]',
  jet_ids JSONB DEFAULT '[]',
  related_task JSONB DEFAULT '[]',
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON communications FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON communications FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.9 display_heartbeats ═══
CREATE TABLE IF NOT EXISTS display_heartbeats (
  id BIGSERIAL PRIMARY KEY,
  display_id TEXT NOT NULL,
  raw_display_id TEXT,
  location_name TEXT,
  serial_number TEXT,
  timestamp TEXT,
  timestamp_parsed TIMESTAMPTZ,
  heartbeat TEXT,
  is_alive BOOLEAN,
  display_status TEXT,
  last_online_date TIMESTAMPTZ,
  days_offline TEXT,
  source TEXT DEFAULT 'sheets',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(display_id, timestamp),
  UNIQUE(display_id, timestamp_parsed)
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_display_ts_desc ON display_heartbeats (display_id, timestamp_parsed DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts_parsed ON display_heartbeats (timestamp_parsed);
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts_days_offline ON display_heartbeats (timestamp_parsed, days_offline);
CREATE INDEX IF NOT EXISTS idx_display_heartbeats_source ON display_heartbeats(source);

ALTER TABLE display_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON display_heartbeats FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_read" ON display_heartbeats FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON display_heartbeats FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.10 display_first_seen ═══
CREATE TABLE IF NOT EXISTS display_first_seen (
  display_id TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'heartbeat'
);

ALTER TABLE display_first_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON display_first_seen FOR SELECT TO anon USING (true);
CREATE POLICY "auth_read" ON display_first_seen FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON display_first_seen FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.11 dayn_screens ═══
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
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dayn_screens_screen_id ON dayn_screens(dayn_screen_id);
CREATE INDEX IF NOT EXISTS idx_dayn_screens_status ON dayn_screens(screen_status);
CREATE INDEX IF NOT EXISTS idx_dayn_screens_city ON dayn_screens(city);

ALTER TABLE dayn_screens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON dayn_screens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON dayn_screens FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON dayn_screens FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.12 installationstermine ═══
CREATE TABLE IF NOT EXISTS installationstermine (
  id TEXT PRIMARY KEY,
  airtable_id TEXT UNIQUE,
  install_date_id INTEGER,
  installationsdatum TIMESTAMPTZ,
  erinnerungsdatum DATE,
  installationszeit TEXT,
  grund_notiz TEXT,
  naechste_schritt TEXT,
  kw_geplant TEXT,
  wochentag TEXT,
  installationsdatum_nur_datum TEXT,
  terminstatus TEXT,
  jet_id_links TEXT[],
  location_name TEXT[],
  akquise_links TEXT[],
  street TEXT[],
  street_number TEXT[],
  postal_code TEXT[],
  city TEXT[],
  contact_email TEXT[],
  stammdaten_links TEXT[],
  installationen_links TEXT[],
  status_installation TEXT[],
  jet_id TEXT,
  integrator TEXT[],
  technicians TEXT[],
  installationsart TEXT[],
  aufbau_datum TEXT[],
  abnahme_partner TEXT[],
  acquisition_partner TEXT[],
  contact_person TEXT[],
  contact_phone TEXT[],
  created_by TEXT,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installationstermine_terminstatus ON installationstermine (terminstatus);
CREATE INDEX IF NOT EXISTS idx_installationstermine_installationsdatum ON installationstermine (installationsdatum);
CREATE INDEX IF NOT EXISTS idx_installationstermine_updated_at ON installationstermine (updated_at);

ALTER TABLE installationstermine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read access on installationstermine" ON installationstermine FOR SELECT USING (true);
CREATE POLICY "Allow service role full access on installationstermine" ON installationstermine FOR ALL USING (true) WITH CHECK (true);


-- ═══ 1.13 Hardware Tables ═══

CREATE TABLE IF NOT EXISTS hardware_ops (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  ops_nr TEXT,
  status TEXT,
  ops_sn TEXT,
  hardware_type TEXT,
  navori_venue_id TEXT,
  sim_record_id TEXT,
  sim_id TEXT,
  display_record_id TEXT,
  display_sn TEXT,
  display_location_id TEXT,
  location_online_status TEXT,
  partner_id TEXT,
  note TEXT,
  vistar_venue_id TEXT,
  nocodb_kunden_nr TEXT,
  nocodb_sim_id TEXT,
  nocodb_synced_at TIMESTAMPTZ,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_ops_status ON hardware_ops(status);
CREATE INDEX IF NOT EXISTS idx_hw_ops_nr ON hardware_ops(ops_nr);
CREATE INDEX IF NOT EXISTS idx_hw_ops_location ON hardware_ops(display_location_id);
CREATE INDEX IF NOT EXISTS idx_hw_ops_vistar_venue ON hardware_ops(vistar_venue_id);

ALTER TABLE hardware_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_ops FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON hardware_ops FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS hardware_sim (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  sim_id TEXT,
  activate_date DATE,
  ops_record_id TEXT,
  status TEXT,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_sim_id ON hardware_sim(sim_id);

ALTER TABLE hardware_sim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_sim FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON hardware_sim FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS hardware_displays (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  display_serial_number TEXT,
  location TEXT,
  ops_record_id TEXT,
  status TEXT,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_display_sn ON hardware_displays(display_serial_number);

ALTER TABLE hardware_displays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_displays FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON hardware_displays FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS chg_approvals (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  jet_id_location TEXT,
  asset_id TEXT,
  display_sn TEXT,
  integrator_invoice_no TEXT,
  chg_certificate TEXT,
  invoice_date DATE,
  rental_start DATE,
  rental_end DATE,
  payment_released_on DATE,
  payment_released_by TEXT,
  status TEXT,
  installation_id TEXT,
  inspection_status TEXT[],
  display_id TEXT[],
  location_name TEXT[],
  city TEXT[],
  address TEXT[],
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chg_asset ON chg_approvals(asset_id);
CREATE INDEX IF NOT EXISTS idx_chg_display_sn ON chg_approvals(display_sn);
CREATE INDEX IF NOT EXISTS idx_chg_rental ON chg_approvals(rental_start, rental_end);

ALTER TABLE chg_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON chg_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON chg_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS bank_leasing (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id TEXT UNIQUE,
  serial_number TEXT,
  asset_class TEXT,
  designation TEXT,
  contract_status TEXT,
  customer TEXT,
  customer_id INTEGER,
  rental_certificate TEXT,
  rental_start DATE,
  rental_end_planned DATE,
  rental_end_actual DATE,
  monthly_price NUMERIC(8,2),
  currency TEXT DEFAULT 'EUR',
  order_number TEXT,
  installation_location TEXT,
  cost_center TEXT,
  city TEXT,
  manufacturer TEXT,
  lessor_id INTEGER,
  lessor TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_serial ON bank_leasing(serial_number);
CREATE INDEX IF NOT EXISTS idx_bank_asset ON bank_leasing(asset_id);
CREATE INDEX IF NOT EXISTS idx_bank_rental_cert ON bank_leasing(rental_certificate);

ALTER TABLE bank_leasing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON bank_leasing FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON bank_leasing FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS hardware_swaps (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  swap_id TEXT,
  display_location_id TEXT,
  swap_type TEXT[],
  swap_date DATE,
  swap_reason TEXT,
  partner_id TEXT,
  technician TEXT,
  old_hardware_ids TEXT[],
  new_hardware_ids TEXT[],
  defect_description TEXT,
  status TEXT,
  location_name TEXT,
  city TEXT,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_location ON hardware_swaps(display_location_id);
CREATE INDEX IF NOT EXISTS idx_swap_status ON hardware_swaps(status);

ALTER TABLE hardware_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_swaps FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON hardware_swaps FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS hardware_deinstalls (
  id TEXT PRIMARY KEY,
  airtable_id TEXT,
  deinstall_id TEXT,
  display_location_id TEXT,
  ops_record_id TEXT,
  deinstall_date DATE,
  reason TEXT,
  partner_id TEXT,
  technician TEXT,
  hardware_condition TEXT,
  condition_description TEXT,
  status TEXT,
  location_name TEXT,
  city TEXT,
  extra_fields JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deinstall_location ON hardware_deinstalls(display_location_id);
CREATE INDEX IF NOT EXISTS idx_deinstall_status ON hardware_deinstalls(status);

ALTER TABLE hardware_deinstalls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_deinstalls FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON hardware_deinstalls FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.14 Vistar Tables ═══

CREATE TABLE IF NOT EXISTS vistar_networks (
  id TEXT PRIMARY KEY,
  name TEXT,
  api_key TEXT,
  venue_count INTEGER DEFAULT 0,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vistar_networks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON vistar_networks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON vistar_networks FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON vistar_networks FOR ALL TO service_role USING (true) WITH CHECK (true);


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

CREATE INDEX IF NOT EXISTS idx_vistar_venues_network ON vistar_venues(network_id);
CREATE INDEX IF NOT EXISTS idx_vistar_venues_partner_id ON vistar_venues(partner_venue_id);
CREATE INDEX IF NOT EXISTS idx_vistar_venues_active ON vistar_venues(is_active);

ALTER TABLE vistar_venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON vistar_venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON vistar_venues FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON vistar_venues FOR ALL TO service_role USING (true) WITH CHECK (true);


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

CREATE INDEX IF NOT EXISTS idx_vistar_health_venue_date ON vistar_venue_health(venue_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_vistar_health_date ON vistar_venue_health(report_date DESC);

ALTER TABLE vistar_venue_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON vistar_venue_health FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON vistar_venue_health FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON vistar_venue_health FOR ALL TO service_role USING (true) WITH CHECK (true);


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

ALTER TABLE vistar_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON vistar_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read" ON vistar_sync_log FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON vistar_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ 1.15 Config Tables ═══

CREATE TABLE IF NOT EXISTS sync_metadata (
  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  table_name TEXT UNIQUE NOT NULL,
  last_sync_timestamp TIMESTAMP WITH TIME ZONE,
  last_sync_duration_ms INT,
  last_sync_status TEXT DEFAULT 'pending',
  records_fetched INT DEFAULT 0,
  records_upserted INT DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_table_name ON sync_metadata(table_name);

ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON sync_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read" ON sync_metadata FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_read" ON sync_metadata FOR SELECT TO anon USING (true);

GRANT ALL ON sync_metadata TO service_role;
GRANT SELECT ON sync_metadata TO authenticated;
GRANT SELECT ON sync_metadata TO anon;


CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read feature flags" ON feature_flags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can update feature flags" ON feature_flags FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage feature flags" ON feature_flags FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON feature_flags TO anon;
GRANT SELECT, UPDATE ON feature_flags TO authenticated;
GRANT ALL ON feature_flags TO service_role;


CREATE TABLE IF NOT EXISTS api_usage_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  function_name TEXT NOT NULL,
  service TEXT NOT NULL,
  method TEXT,
  endpoint TEXT,
  duration_ms INTEGER,
  status_code INTEGER,
  success BOOLEAN DEFAULT TRUE,
  tokens_in INTEGER,
  tokens_out INTEGER,
  records_count INTEGER,
  bytes_transferred INTEGER,
  estimated_cost_cents NUMERIC(10,4),
  user_id TEXT,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_function ON api_usage_log (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_service ON api_usage_log (service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_success ON api_usage_log (success, created_at DESC);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON api_usage_log FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated users can read" ON api_usage_log FOR SELECT USING (auth.role() = 'authenticated');


CREATE TABLE IF NOT EXISTS attachment_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  airtable_record_id TEXT NOT NULL,
  airtable_table TEXT NOT NULL DEFAULT 'unknown',
  airtable_field TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  original_url TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(airtable_record_id, airtable_field, original_filename)
);

CREATE INDEX IF NOT EXISTS idx_attachment_cache_record_field ON attachment_cache (airtable_record_id, airtable_field);
CREATE INDEX IF NOT EXISTS idx_attachment_cache_table ON attachment_cache (airtable_table);

ALTER TABLE attachment_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON attachment_cache FOR ALL USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('insight', 'decision', 'preference', 'context', 'pin')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  relevance_score INTEGER DEFAULT 5 CHECK (relevance_score BETWEEN 1 AND 10),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  use_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_memory_active ON agent_memory(active, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_category ON agent_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_created ON agent_memory(created_at DESC);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON agent_memory FOR SELECT TO anon USING (true);
CREATE POLICY "auth_read" ON agent_memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON agent_memory FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS feedback_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  type TEXT NOT NULL CHECK (type IN ('feature', 'bug', 'question', 'feedback')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'planned', 'in_progress', 'done', 'rejected')),
  admin_notes TEXT,
  click_x INTEGER,
  click_y INTEGER,
  url TEXT,
  component TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  user_agent TEXT,
  context_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_requests(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_requests(created_at DESC);

ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON feedback_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON feedback_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anon_read" ON feedback_requests FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON feedback_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update" ON feedback_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON feedback_requests FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- SECTION 2: TABLES WITH FOREIGN KEYS
-- ============================================================


-- ═══ 2.1 install_routen ═══
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routen_city ON install_routen(city);
CREATE INDEX IF NOT EXISTS idx_routen_date ON install_routen(schedule_date);
CREATE INDEX IF NOT EXISTS idx_routen_city_date ON install_routen(city, schedule_date);
CREATE INDEX IF NOT EXISTS idx_routen_status ON install_routen(status);

ALTER TABLE install_routen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access routen" ON install_routen FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON install_routen TO anon, authenticated, service_role;

-- Multi-team unique constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'install_routen_city_date_team_key') THEN
    ALTER TABLE install_routen ADD CONSTRAINT install_routen_city_date_team_key UNIQUE (city, schedule_date, installer_team);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint may already exist: %', SQLERRM;
END $$;


-- ═══ 2.2 install_bookings ═══
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
  confirmed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  installer_team TEXT,
  reminder_sent_at TIMESTAMPTZ DEFAULT NULL,
  reminder_count INT DEFAULT 0,
  callback_date DATE,
  callback_reason TEXT,
  cancelled_by_user_id UUID,
  cancelled_by_user_name TEXT,
  cancelled_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_by_user_id UUID,
  created_by_user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_token ON install_bookings(booking_token);
CREATE INDEX IF NOT EXISTS idx_bookings_city ON install_bookings(city);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON install_bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON install_bookings(booked_date);
CREATE INDEX IF NOT EXISTS idx_bookings_city_date ON install_bookings(city, booked_date);
CREATE INDEX IF NOT EXISTS idx_bookings_route ON install_bookings(route_id);
CREATE INDEX IF NOT EXISTS idx_bookings_akquise ON install_bookings(akquise_airtable_id);
CREATE INDEX IF NOT EXISTS idx_install_bookings_callback ON install_bookings(callback_date) WHERE callback_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_install_bookings_reminder_pending ON install_bookings (status, created_at) WHERE status = 'pending' AND reminder_count = 0;
CREATE INDEX IF NOT EXISTS idx_install_bookings_cancelled_at ON install_bookings (cancelled_at) WHERE cancelled_at IS NOT NULL;

ALTER TABLE install_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access bookings" ON install_bookings FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON install_bookings TO anon, authenticated, service_role;


-- ═══ 2.3 install_teams ═══
CREATE TABLE IF NOT EXISTS install_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#FF8000',
  is_active BOOLEAN DEFAULT true,
  members JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE install_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON install_teams FOR SELECT USING (true);
CREATE POLICY "Allow all for service role" ON install_teams FOR ALL USING (true);


-- ═══ 2.4 phone_call_logs ═══
CREATE TABLE IF NOT EXISTS phone_call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES install_bookings(id) ON DELETE CASCADE,
  called_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('reached', 'not_reached', 'booked', 'callback', 'declined', 'wrong_number', 'voicemail')),
  notes TEXT,
  callback_date DATE,
  duration_seconds INTEGER,
  caller_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_call_logs_booking ON phone_call_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_called_at ON phone_call_logs(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_callback ON phone_call_logs(callback_date) WHERE callback_date IS NOT NULL;

ALTER TABLE phone_call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON phone_call_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON phone_call_logs FOR ALL TO anon USING (true) WITH CHECK (true);


-- ═══ 2.5 booking_activity_log ═══
CREATE TABLE IF NOT EXISTS booking_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'invite_sent', 'reminder_sent', 'phone_call',
    'booking_created', 'booking_confirmed', 'booking_cancelled',
    'booking_completed', 'booking_rescheduled',
    'status_changed', 'airtable_termin_created'
  )),
  booking_id UUID,
  akquise_airtable_id TEXT,
  location_name TEXT,
  city TEXT,
  detail JSONB DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'bot', 'airtable', 'self_booking')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bal_user_id ON booking_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bal_action ON booking_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_bal_source ON booking_activity_log(source);
CREATE INDEX IF NOT EXISTS idx_bal_created_at ON booking_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bal_city ON booking_activity_log(city);

ALTER TABLE booking_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON booking_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON booking_activity_log FOR ALL TO anon USING (true) WITH CHECK (true);


-- ═══ 2.6 attachment_sync_log ═══
CREATE TABLE IF NOT EXISTS attachment_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  tables_processed TEXT[],
  records_synced INTEGER DEFAULT 0,
  attachments_found INTEGER DEFAULT 0,
  already_cached INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_att_sync_log_created ON attachment_sync_log (created_at DESC);

ALTER TABLE attachment_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on attachment_sync_log" ON attachment_sync_log FOR ALL USING (true) WITH CHECK (true);


-- ═══ 2.7 install_verification_log ═══
CREATE TABLE IF NOT EXISTS install_verification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  installation_airtable_id TEXT NOT NULL,
  display_id TEXT,
  check_type TEXT NOT NULL CHECK (check_type IN ('3_day', '10_day')),
  check_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_heartbeats INTEGER DEFAULT 0,
  alive_heartbeats INTEGER DEFAULT 0,
  online_rate_pct NUMERIC(5,2),
  passed BOOLEAN NOT NULL,
  task_airtable_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ivl_unique_check ON install_verification_log(installation_airtable_id, check_type);
CREATE INDEX IF NOT EXISTS idx_ivl_check_date ON install_verification_log(check_date DESC);

ALTER TABLE install_verification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON install_verification_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON install_verification_log FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON install_verification_log TO anon;
GRANT SELECT, INSERT, UPDATE ON install_verification_log TO authenticated;
GRANT ALL ON install_verification_log TO service_role;


-- ============================================================
-- SECTION 3: AKQUISE AUTOMATION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS akquise_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  target_filter JSONB DEFAULT '{}',
  template_id TEXT NOT NULL,
  created_by TEXT,
  total_leads INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  response_count INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE akquise_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON akquise_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read" ON akquise_campaigns FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS akquise_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES akquise_campaigns(id),
  akquise_airtable_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  location_name TEXT,
  city TEXT,
  jet_id TEXT,
  superchat_contact_id TEXT,
  superchat_conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  template_sent_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ,
  signature_sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature_token TEXT UNIQUE,
  signature_data JSONB,
  ai_message_count INT DEFAULT 0,
  total_message_count INT DEFAULT 0,
  ai_sentiment TEXT,
  ai_last_summary TEXT,
  follow_up_count INT DEFAULT 0,
  next_follow_up_at TIMESTAMPTZ,
  error_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_conv_status ON akquise_conversations(status);
CREATE INDEX IF NOT EXISTS idx_akquise_conv_phone ON akquise_conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_akquise_conv_airtable ON akquise_conversations(akquise_airtable_id);
CREATE INDEX IF NOT EXISTS idx_akquise_conv_campaign ON akquise_conversations(campaign_id);
ALTER TABLE akquise_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON akquise_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read" ON akquise_conversations FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS akquise_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES akquise_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  superchat_message_id TEXT,
  template_id TEXT,
  ai_model TEXT,
  ai_tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_msg_conv ON akquise_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_akquise_msg_created ON akquise_messages(created_at);
ALTER TABLE akquise_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON akquise_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read" ON akquise_messages FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS akquise_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT DEFAULT 'KI-Bot',
  action TEXT NOT NULL,
  conversation_id UUID REFERENCES akquise_conversations(id),
  akquise_airtable_id TEXT,
  location_name TEXT,
  city TEXT,
  detail JSONB DEFAULT '{}',
  source TEXT DEFAULT 'automation',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_log_action ON akquise_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_akquise_log_created ON akquise_activity_log(created_at DESC);
ALTER TABLE akquise_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON akquise_activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read" ON akquise_activity_log FOR SELECT TO authenticated USING (true);


-- ============================================================
-- SECTION 4: HARDWARE LIFECYCLE TABLES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS goods_receipt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS qr_code_seq START 1;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id TEXT UNIQUE NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier TEXT,
  delivery_note TEXT,
  order_reference TEXT,
  carrier TEXT,
  component_type TEXT NOT NULL,
  serial_number TEXT,
  hardware_id TEXT,
  quantity INTEGER DEFAULT 1,
  condition TEXT DEFAULT 'ok',
  condition_notes TEXT,
  photo_urls TEXT[],
  received_by TEXT,
  warehouse TEXT DEFAULT 'Hauptlager',
  qr_code_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_id ON goods_receipts(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_date ON goods_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_type ON goods_receipts(component_type);
CREATE INDEX IF NOT EXISTS idx_receipt_sn ON goods_receipts(serial_number);
CREATE INDEX IF NOT EXISTS idx_receipt_hardware ON goods_receipts(hardware_id);

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON goods_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON goods_receipts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON goods_receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON goods_receipts FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON goods_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS hardware_qr_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_code TEXT UNIQUE NOT NULL,
  qr_prefix TEXT DEFAULT 'JET-HW',
  batch_id TEXT,
  component_type TEXT,
  hardware_id TEXT,
  serial_number TEXT,
  status TEXT DEFAULT 'generated',
  assigned_at TIMESTAMPTZ,
  assigned_by TEXT,
  label_printed BOOLEAN DEFAULT FALSE,
  label_printed_at TIMESTAMPTZ,
  label_format TEXT DEFAULT '62x29',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_code ON hardware_qr_codes(qr_code);
CREATE INDEX IF NOT EXISTS idx_qr_batch ON hardware_qr_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_hardware ON hardware_qr_codes(hardware_id);
CREATE INDEX IF NOT EXISTS idx_qr_status ON hardware_qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_qr_sn ON hardware_qr_codes(serial_number);

ALTER TABLE hardware_qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON hardware_qr_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON hardware_qr_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON hardware_qr_codes FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON hardware_qr_codes FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS hardware_positions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  component_type TEXT NOT NULL,
  hardware_id TEXT NOT NULL,
  serial_number TEXT,
  position TEXT NOT NULL,
  sub_position TEXT,
  display_location_id TEXT,
  location_name TEXT,
  city TEXT,
  moved_from TEXT,
  moved_by TEXT,
  move_reason TEXT,
  reference_id TEXT,
  is_current BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_hardware ON hardware_positions(hardware_id, is_current);
CREATE INDEX IF NOT EXISTS idx_pos_type ON hardware_positions(component_type);
CREATE INDEX IF NOT EXISTS idx_pos_position ON hardware_positions(position);
CREATE INDEX IF NOT EXISTS idx_pos_location ON hardware_positions(display_location_id);
CREATE INDEX IF NOT EXISTS idx_pos_current ON hardware_positions(is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_pos_created ON hardware_positions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sn ON hardware_positions(serial_number);

ALTER TABLE hardware_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON hardware_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON hardware_positions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON hardware_positions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON hardware_positions FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON hardware_positions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- SECTION 5: WAREHOUSE MANAGEMENT TABLES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS shipping_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS return_order_seq START 1;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number TEXT UNIQUE NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  supplier TEXT NOT NULL,
  supplier_contact TEXT,
  supplier_reference TEXT,
  notes TEXT,
  status TEXT DEFAULT 'entwurf',
  total_items INTEGER DEFAULT 0,
  received_items INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_expected_delivery ON purchase_orders(expected_delivery);
CREATE INDEX IF NOT EXISTS idx_po_created_at ON purchase_orders(created_at DESC);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON purchase_orders FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_number INTEGER,
  component_type TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2),
  received_quantity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'offen',
  serial_numbers TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_poi_component_type ON purchase_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_poi_status ON purchase_order_items(status);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON purchase_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON purchase_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS warehouse_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  warehouse TEXT NOT NULL DEFAULT 'Hauptlager',
  zone TEXT,
  shelf TEXT,
  name TEXT NOT NULL,
  capacity INTEGER,
  current_count INTEGER DEFAULT 0,
  location_type TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wl_warehouse ON warehouse_locations(warehouse);
CREATE INDEX IF NOT EXISTS idx_wl_zone ON warehouse_locations(zone);
CREATE INDEX IF NOT EXISTS idx_wl_location_type ON warehouse_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_wl_active ON warehouse_locations(active) WHERE active = TRUE;

ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON warehouse_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON warehouse_locations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON warehouse_locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON warehouse_locations FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON warehouse_locations FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS shipping_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipping_id TEXT UNIQUE NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  destination_type TEXT,
  destination_id TEXT,
  destination_name TEXT,
  destination_address TEXT,
  carrier TEXT,
  tracking_number TEXT,
  packaging_type TEXT,
  notes TEXT,
  status TEXT DEFAULT 'kommissioniert',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_shipping_id ON shipping_orders(shipping_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON shipping_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_order_date ON shipping_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_so_destination_type ON shipping_orders(destination_type);
CREATE INDEX IF NOT EXISTS idx_so_destination_id ON shipping_orders(destination_id);
CREATE INDEX IF NOT EXISTS idx_so_carrier ON shipping_orders(carrier);
CREATE INDEX IF NOT EXISTS idx_so_tracking ON shipping_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_so_created_at ON shipping_orders(created_at DESC);

ALTER TABLE shipping_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON shipping_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON shipping_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON shipping_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON shipping_orders FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON shipping_orders FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS shipping_order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipping_order_id BIGINT NOT NULL REFERENCES shipping_orders(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  hardware_id TEXT,
  serial_number TEXT,
  qr_code TEXT,
  picked BOOLEAN DEFAULT FALSE,
  picked_at TIMESTAMPTZ,
  picked_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soi_shipping_order_id ON shipping_order_items(shipping_order_id);
CREATE INDEX IF NOT EXISTS idx_soi_component_type ON shipping_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_soi_hardware_id ON shipping_order_items(hardware_id);
CREATE INDEX IF NOT EXISTS idx_soi_serial_number ON shipping_order_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_soi_qr_code ON shipping_order_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_soi_picked ON shipping_order_items(picked);

ALTER TABLE shipping_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON shipping_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON shipping_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON shipping_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON shipping_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON shipping_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS return_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id TEXT UNIQUE NOT NULL,
  return_date DATE DEFAULT CURRENT_DATE,
  source_type TEXT,
  source_id TEXT,
  source_name TEXT,
  reason TEXT,
  reference_id TEXT,
  carrier TEXT,
  tracking_number TEXT,
  status TEXT DEFAULT 'erwartet',
  inspection_result TEXT,
  inspection_notes TEXT,
  decision TEXT,
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_return_id ON return_orders(return_id);
CREATE INDEX IF NOT EXISTS idx_ro_status ON return_orders(status);
CREATE INDEX IF NOT EXISTS idx_ro_return_date ON return_orders(return_date DESC);
CREATE INDEX IF NOT EXISTS idx_ro_source_type ON return_orders(source_type);
CREATE INDEX IF NOT EXISTS idx_ro_source_id ON return_orders(source_id);
CREATE INDEX IF NOT EXISTS idx_ro_reason ON return_orders(reason);
CREATE INDEX IF NOT EXISTS idx_ro_reference_id ON return_orders(reference_id);
CREATE INDEX IF NOT EXISTS idx_ro_tracking ON return_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ro_decision ON return_orders(decision);
CREATE INDEX IF NOT EXISTS idx_ro_created_at ON return_orders(created_at DESC);

ALTER TABLE return_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON return_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON return_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON return_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON return_orders FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON return_orders FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS return_order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_order_id BIGINT NOT NULL REFERENCES return_orders(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  hardware_id TEXT,
  serial_number TEXT,
  qr_code TEXT,
  condition TEXT DEFAULT 'ungeprueft',
  condition_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roi_return_order_id ON return_order_items(return_order_id);
CREATE INDEX IF NOT EXISTS idx_roi_component_type ON return_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_roi_hardware_id ON return_order_items(hardware_id);
CREATE INDEX IF NOT EXISTS idx_roi_serial_number ON return_order_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_roi_qr_code ON return_order_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_roi_condition ON return_order_items(condition);

ALTER TABLE return_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON return_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON return_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON return_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON return_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON return_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS stock_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  component_type TEXT NOT NULL,
  warehouse TEXT DEFAULT 'Hauptlager',
  min_stock INTEGER DEFAULT 5,
  current_stock INTEGER DEFAULT 0,
  alert_active BOOLEAN DEFAULT TRUE,
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_component_type ON stock_alerts(component_type);
CREATE INDEX IF NOT EXISTS idx_sa_warehouse ON stock_alerts(warehouse);
CREATE INDEX IF NOT EXISTS idx_sa_alert_active ON stock_alerts(alert_active) WHERE alert_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_type_warehouse ON stock_alerts(component_type, warehouse);

ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON stock_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON stock_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON stock_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON stock_alerts FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON stock_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- SECTION 6: NOCODB CACHE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_vorbereitet (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id INTEGER UNIQUE,
  ops_nr INTEGER,
  venue_id TEXT,
  sim_id TEXT,
  kunden_nr TEXT,
  ops_sn TEXT,
  fertig BOOLEAN DEFAULT FALSE,
  vorbereitet BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_ops_nr ON nocodb_vorbereitet(ops_nr);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_venue_id ON nocodb_vorbereitet(venue_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_sim_id ON nocodb_vorbereitet(sim_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_kunden_nr ON nocodb_vorbereitet(kunden_nr);

ALTER TABLE nocodb_vorbereitet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON nocodb_vorbereitet FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON nocodb_vorbereitet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_vorbereitet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON nocodb_vorbereitet FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON nocodb_vorbereitet FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS nocodb_vistar_navori (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id INTEGER UNIQUE,
  venue_id TEXT,
  name TEXT,
  kunden_id TEXT,
  do_id TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_vn_venue_id ON nocodb_vistar_navori(venue_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vn_kunden_id ON nocodb_vistar_navori(kunden_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vn_do_id ON nocodb_vistar_navori(do_id);

ALTER TABLE nocodb_vistar_navori ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON nocodb_vistar_navori FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON nocodb_vistar_navori FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_vistar_navori FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON nocodb_vistar_navori FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON nocodb_vistar_navori FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS nocodb_sim_kunden (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id INTEGER UNIQUE,
  karten_nr TEXT,
  kunden_id TEXT,
  aktivierungsdatum DATE,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_sk_karten_nr ON nocodb_sim_kunden(karten_nr);
CREATE INDEX IF NOT EXISTS idx_nocodb_sk_kunden_id ON nocodb_sim_kunden(kunden_id);

ALTER TABLE nocodb_sim_kunden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON nocodb_sim_kunden FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON nocodb_sim_kunden FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_sim_kunden FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON nocodb_sim_kunden FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON nocodb_sim_kunden FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS nocodb_lieferando (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id INTEGER UNIQUE,
  kunden_id TEXT,
  restaurant TEXT,
  strasse TEXT,
  hausnummer TEXT,
  plz TEXT,
  stadt TEXT,
  ansprechpartner TEXT,
  telefon TEXT,
  mail TEXT,
  akquise_status TEXT,
  standort_status TEXT,
  einreichdatum DATE,
  rollout_info TEXT,
  installationsart TEXT,
  validierungsstatus TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_lief_kunden_id ON nocodb_lieferando(kunden_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_lief_plz ON nocodb_lieferando(plz);
CREATE INDEX IF NOT EXISTS idx_nocodb_lief_stadt ON nocodb_lieferando(stadt);

ALTER TABLE nocodb_lieferando ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON nocodb_lieferando FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON nocodb_lieferando FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_lieferando FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON nocodb_lieferando FOR SELECT TO anon USING (true);
CREATE POLICY "service_all" ON nocodb_lieferando FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- SECTION 7: FAW DATA (already exists, add missing columns/indexes)
-- ============================================================

-- faw_data already exists in new instance, ensure all columns are present
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS akquise_airtable_id TEXT;
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS dvac_gesamt NUMERIC(12,2);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS dvac_kfz NUMERIC(12,2);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS dvac_oepnv NUMERIC(12,2);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS dvac_fussgaenger NUMERIC(12,2);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS schaltung VARCHAR(20);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS sov_factor NUMERIC(5,2);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS vac_id VARCHAR(50);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS gkz VARCHAR(20);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS inda_version VARCHAR(50);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS hourly_gesamt JSONB;
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS hourly_kfz JSONB;
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS hourly_oepnv JSONB;
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS hourly_fussgaenger JSONB;
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS data_source VARCHAR(100);
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS reviewer_name TEXT;
ALTER TABLE faw_data ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_faw_data_akquise ON faw_data(akquise_airtable_id);
CREATE INDEX IF NOT EXISTS idx_faw_data_created ON faw_data(created_at DESC);


-- ============================================================
-- SECTION 8: ALTER EXISTING TABLES (tasks etc.)
-- ============================================================

-- tasks: add missing columns used by Airtable sync
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS online_status TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS live_since TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS installation_status TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS integrator TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS install_date TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS display_serial_number TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS install_remarks TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS install_type TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type_select TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_visibility BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS nacharbeit_kommentar TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS superchat TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_by TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jet_ids TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cities TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_extra_fields ON tasks USING GIN (extra_fields) WHERE extra_fields IS NOT NULL;


-- ============================================================
-- SECTION 9: VIEWS
-- ============================================================

-- Vistar venue status view
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

-- Hardware current positions view
CREATE OR REPLACE VIEW hardware_current_positions AS
SELECT
  hp.id,
  hp.component_type,
  hp.hardware_id,
  hp.serial_number,
  hp.position,
  hp.sub_position,
  hp.display_location_id,
  hp.location_name,
  hp.city,
  hp.moved_from,
  hp.moved_by,
  hp.move_reason,
  hp.reference_id,
  hp.created_at AS position_since,
  ho.ops_nr,
  ho.ops_sn,
  ho.hardware_type AS ops_type,
  ho.status AS ops_status,
  hd.display_serial_number,
  hd.status AS display_status,
  hs.sim_id,
  hs.status AS sim_status
FROM hardware_positions hp
LEFT JOIN hardware_ops ho ON hp.component_type = 'ops' AND hp.hardware_id = ho.id
LEFT JOIN hardware_displays hd ON hp.component_type = 'display' AND hp.hardware_id = hd.id
LEFT JOIN hardware_sim hs ON hp.component_type = 'sim' AND hp.hardware_id = hs.id
WHERE hp.is_current = TRUE;

-- NocoDB enriched view
CREATE OR REPLACE VIEW nocodb_hardware_enriched AS
SELECT
  v.ops_nr,
  v.venue_id,
  v.sim_id,
  v.kunden_nr,
  v.ops_sn AS nocodb_ops_sn,
  v.fertig,
  v.vorbereitet,
  ho.id AS hardware_ops_id,
  ho.ops_sn AS airtable_ops_sn,
  ho.status AS ops_status,
  ho.hardware_type,
  vn.name AS venue_name,
  vn.do_id,
  sk.aktivierungsdatum AS sim_activated,
  l.restaurant,
  l.stadt,
  l.strasse,
  l.hausnummer,
  l.akquise_status,
  l.standort_status
FROM nocodb_vorbereitet v
LEFT JOIN hardware_ops ho ON v.ops_nr::TEXT = ho.ops_nr
LEFT JOIN nocodb_vistar_navori vn ON v.venue_id = vn.venue_id
LEFT JOIN nocodb_sim_kunden sk ON v.sim_id = sk.karten_nr
LEFT JOIN nocodb_lieferando l ON v.kunden_nr = l.kunden_id;

-- Stock overview view
CREATE OR REPLACE VIEW stock_overview AS
SELECT
  hp.component_type,
  COALESCE(hp.sub_position, 'Hauptlager') AS warehouse,
  COUNT(*) AS item_count,
  array_agg(hp.hardware_id ORDER BY hp.hardware_id) AS hardware_ids,
  array_agg(hp.serial_number ORDER BY hp.serial_number) FILTER (WHERE hp.serial_number IS NOT NULL) AS serial_numbers,
  MIN(hp.created_at) AS oldest_entry,
  MAX(hp.created_at) AS newest_entry
FROM hardware_positions hp
WHERE hp.is_current = TRUE
  AND hp.position = 'lager'
GROUP BY hp.component_type, COALESCE(hp.sub_position, 'Hauptlager')
ORDER BY hp.component_type, warehouse;

-- Purchase orders overview
CREATE OR REPLACE VIEW purchase_orders_overview AS
SELECT
  po.id, po.po_number, po.order_date, po.expected_delivery,
  po.supplier, po.supplier_reference, po.status,
  po.total_items, po.received_items, po.created_by,
  po.created_at, po.updated_at,
  COUNT(poi.id) AS line_count,
  COALESCE(SUM(poi.quantity), 0)::INTEGER AS total_quantity,
  COALESCE(SUM(poi.received_quantity), 0)::INTEGER AS total_received,
  COALESCE(SUM(poi.quantity * poi.unit_price), 0)::NUMERIC(12,2) AS total_value,
  CASE
    WHEN po.expected_delivery IS NULL THEN 'kein_termin'
    WHEN po.expected_delivery < CURRENT_DATE AND po.status NOT IN ('vollstaendig', 'storniert') THEN 'ueberfaellig'
    WHEN po.expected_delivery <= CURRENT_DATE + INTERVAL '3 days' AND po.status NOT IN ('vollstaendig', 'storniert') THEN 'bald_faellig'
    ELSE 'im_plan'
  END AS delivery_status
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
GROUP BY po.id;

-- Shipping orders overview
CREATE OR REPLACE VIEW shipping_orders_overview AS
SELECT
  so.id, so.shipping_id, so.order_date, so.destination_type,
  so.destination_name, so.destination_address, so.carrier,
  so.tracking_number, so.packaging_type, so.status,
  so.shipped_at, so.delivered_at, so.created_by, so.created_at,
  COUNT(soi.id) AS item_count,
  COUNT(soi.id) FILTER (WHERE soi.picked = TRUE) AS picked_count,
  CASE
    WHEN COUNT(soi.id) = 0 THEN FALSE
    ELSE COUNT(soi.id) = COUNT(soi.id) FILTER (WHERE soi.picked = TRUE)
  END AS fully_picked
FROM shipping_orders so
LEFT JOIN shipping_order_items soi ON soi.shipping_order_id = so.id
GROUP BY so.id;

ALTER VIEW shipping_orders_overview SET (security_invoker = true);

-- Return orders overview
CREATE OR REPLACE VIEW return_orders_overview AS
SELECT
  ro.id, ro.return_id, ro.return_date, ro.source_type,
  ro.source_name, ro.reason, ro.reference_id, ro.carrier,
  ro.tracking_number, ro.status, ro.inspection_result,
  ro.decision, ro.decided_at, ro.decided_by, ro.created_by, ro.created_at,
  COUNT(roi.id) AS item_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'ok') AS ok_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'beschaedigt') AS damaged_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'defekt') AS defect_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'ungeprueft') AS unchecked_count
FROM return_orders ro
LEFT JOIN return_order_items roi ON roi.return_order_id = ro.id
GROUP BY ro.id;


-- ============================================================
-- SECTION 10: RPC FUNCTIONS
-- ============================================================

-- === Hardware lifecycle RPCs ===

CREATE OR REPLACE FUNCTION generate_receipt_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('goods_receipt_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'WE-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_qr_code(prefix TEXT DEFAULT 'JET-HW')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('qr_code_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN prefix || '-' || year_str || '-' || lpad(next_val::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_qr_codes_bulk(
  count INTEGER,
  prefix TEXT DEFAULT 'JET-HW',
  p_batch_id TEXT DEFAULT NULL
)
RETURNS TABLE(qr_code TEXT, id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  batch TEXT;
  i INTEGER;
  new_code TEXT;
  new_id BIGINT;
BEGIN
  batch := COALESCE(p_batch_id, 'BATCH-' || to_char(NOW(), 'YYYY-MM-DD-HH24MI'));
  FOR i IN 1..count LOOP
    new_code := generate_qr_code(prefix);
    INSERT INTO hardware_qr_codes (qr_code, qr_prefix, batch_id, status)
    VALUES (new_code, prefix, batch, 'generated')
    RETURNING hardware_qr_codes.id, hardware_qr_codes.qr_code
    INTO new_id, new_code;
    id := new_id;
    qr_code := new_code;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION update_hardware_position(
  p_component_type TEXT,
  p_hardware_id TEXT,
  p_serial_number TEXT,
  p_position TEXT,
  p_sub_position TEXT DEFAULT NULL,
  p_display_location_id TEXT DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_moved_by TEXT DEFAULT NULL,
  p_move_reason TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_position TEXT;
  new_id BIGINT;
BEGIN
  SELECT position INTO old_position
  FROM hardware_positions
  WHERE hardware_id = p_hardware_id
    AND component_type = p_component_type
    AND is_current = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  UPDATE hardware_positions
  SET is_current = FALSE
  WHERE hardware_id = p_hardware_id
    AND component_type = p_component_type
    AND is_current = TRUE;

  INSERT INTO hardware_positions (
    component_type, hardware_id, serial_number,
    position, sub_position,
    display_location_id, location_name, city,
    moved_from, moved_by, move_reason, reference_id,
    is_current
  ) VALUES (
    p_component_type, p_hardware_id, p_serial_number,
    p_position, p_sub_position,
    p_display_location_id, p_location_name, p_city,
    old_position, p_moved_by, p_move_reason, p_reference_id,
    TRUE
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;


-- === Warehouse RPCs ===

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE next_val BIGINT; year_str TEXT;
BEGIN
  next_val := nextval('purchase_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'PO-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION generate_shipping_id()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE next_val BIGINT; year_str TEXT;
BEGIN
  next_val := nextval('shipping_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'VS-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION generate_return_id()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE next_val BIGINT; year_str TEXT;
BEGIN
  next_val := nextval('return_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'RMA-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION get_stock_summary()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  WITH
  lager_counts AS (
    SELECT component_type, COALESCE(sub_position, 'Hauptlager') AS warehouse,
      COUNT(*) AS count,
      array_agg(DISTINCT serial_number) FILTER (WHERE serial_number IS NOT NULL) AS serial_numbers
    FROM hardware_positions WHERE is_current = TRUE AND position = 'lager'
    GROUP BY component_type, COALESCE(sub_position, 'Hauptlager')
  ),
  type_totals AS (
    SELECT component_type, SUM(count)::INTEGER AS total_count FROM lager_counts GROUP BY component_type
  ),
  grand_total AS (SELECT COALESCE(SUM(count), 0)::INTEGER AS total FROM lager_counts),
  triggered_alerts AS (
    SELECT json_agg(json_build_object(
      'component_type', sa.component_type, 'warehouse', sa.warehouse,
      'min_stock', sa.min_stock, 'current_stock', COALESCE(lc.count, 0),
      'deficit', sa.min_stock - COALESCE(lc.count, 0)
    )) AS alerts
    FROM stock_alerts sa LEFT JOIN lager_counts lc ON lc.component_type = sa.component_type AND lc.warehouse = sa.warehouse
    WHERE sa.alert_active = TRUE AND COALESCE(lc.count, 0) < sa.min_stock
  ),
  warehouse_breakdown AS (
    SELECT json_agg(json_build_object('component_type', component_type, 'warehouse', warehouse, 'count', count)) AS breakdown FROM lager_counts
  ),
  type_summary AS (SELECT json_object_agg(component_type, total_count) AS by_type FROM type_totals)
  SELECT json_build_object(
    'totalStock', gt.total, 'byType', COALESCE(ts.by_type, '{}'::json),
    'breakdown', COALESCE(wb.breakdown, '[]'::json),
    'alerts', COALESCE(ta.alerts, '[]'::json), 'computedAt', NOW()
  ) INTO result
  FROM grand_total gt CROSS JOIN type_summary ts CROSS JOIN warehouse_breakdown wb CROSS JOIN triggered_alerts ta;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION pick_for_shipping(
  p_shipping_order_id BIGINT, p_serial_number TEXT, p_picked_by TEXT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_id BIGINT; v_component_type TEXT; v_hardware_id TEXT; v_position_id BIGINT;
BEGIN
  SELECT soi.id, soi.component_type, soi.hardware_id
  INTO v_item_id, v_component_type, v_hardware_id
  FROM shipping_order_items soi
  WHERE soi.shipping_order_id = p_shipping_order_id AND soi.serial_number = p_serial_number AND soi.picked = FALSE
  LIMIT 1;
  IF v_item_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Item not found or already picked: ' || p_serial_number);
  END IF;
  UPDATE shipping_order_items SET picked = TRUE, picked_at = NOW(), picked_by = p_picked_by WHERE id = v_item_id;
  IF v_hardware_id IS NOT NULL THEN
    SELECT update_hardware_position(
      p_component_type := v_component_type, p_hardware_id := v_hardware_id,
      p_serial_number := p_serial_number, p_position := 'versand',
      p_sub_position := 'Versandauftrag ' || (SELECT shipping_id FROM shipping_orders WHERE id = p_shipping_order_id),
      p_moved_by := p_picked_by, p_move_reason := 'shipping',
      p_reference_id := (SELECT shipping_id FROM shipping_orders WHERE id = p_shipping_order_id)
    ) INTO v_position_id;
  END IF;
  RETURN json_build_object('success', TRUE, 'item_id', v_item_id, 'position_id', v_position_id,
    'serial_number', p_serial_number, 'picked_by', p_picked_by, 'picked_at', NOW());
END; $$;

CREATE OR REPLACE FUNCTION receive_po_item(
  p_po_id BIGINT, p_item_id BIGINT, p_quantity INTEGER,
  p_serial_numbers TEXT[] DEFAULT NULL, p_received_by TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item RECORD; v_new_received INTEGER; v_item_status TEXT;
  v_po_total INTEGER; v_po_received INTEGER; v_po_status TEXT;
BEGIN
  SELECT * INTO v_item FROM purchase_order_items WHERE id = p_item_id AND po_id = p_po_id;
  IF v_item IS NULL THEN RETURN json_build_object('success', FALSE, 'error', 'Item not found'); END IF;
  v_new_received := v_item.received_quantity + p_quantity;
  IF v_new_received >= v_item.quantity THEN v_item_status := 'vollstaendig'; v_new_received := v_item.quantity;
  ELSE v_item_status := 'teilgeliefert'; END IF;
  UPDATE purchase_order_items SET received_quantity = v_new_received, status = v_item_status,
    serial_numbers = COALESCE(serial_numbers, '{}') || COALESCE(p_serial_numbers, '{}') WHERE id = p_item_id;
  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_po_total, v_po_received FROM purchase_order_items WHERE po_id = p_po_id;
  IF v_po_received >= v_po_total THEN v_po_status := 'vollstaendig';
  ELSIF v_po_received > 0 THEN v_po_status := 'teilgeliefert';
  ELSE v_po_status := 'bestellt'; END IF;
  UPDATE purchase_orders SET total_items = v_po_total, received_items = v_po_received,
    status = v_po_status, updated_at = NOW() WHERE id = p_po_id;
  RETURN json_build_object('success', TRUE, 'item_id', p_item_id, 'received_quantity', v_new_received,
    'item_status', v_item_status, 'po_total_items', v_po_total,
    'po_received_items', v_po_received, 'po_status', v_po_status);
END; $$;


-- === Installationen enrichment RPCs ===

CREATE OR REPLACE FUNCTION enrich_installationen_jet_id()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE updated_count integer;
BEGIN
  UPDATE installationen i SET jet_id = a.jet_id
  FROM acquisition a
  WHERE i.akquise_links IS NOT NULL AND jsonb_array_length(i.akquise_links) > 0
    AND a.airtable_id = (i.akquise_links->>0) AND a.jet_id IS NOT NULL
    AND (i.jet_id IS NULL OR i.jet_id LIKE 'rec%');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('updated', updated_count);
END; $$;
ALTER FUNCTION enrich_installationen_jet_id() SET search_path = '';
GRANT EXECUTE ON FUNCTION enrich_installationen_jet_id() TO service_role;

CREATE OR REPLACE FUNCTION enrich_installationstermine_jet_id()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE updated_count integer;
BEGIN
  UPDATE installationstermine t SET jet_id = a.jet_id
  FROM acquisition a
  WHERE t.akquise_links IS NOT NULL AND array_length(t.akquise_links, 1) > 0
    AND a.airtable_id = t.akquise_links[1] AND a.jet_id IS NOT NULL
    AND (t.jet_id IS NULL OR t.jet_id LIKE 'rec%');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('updated', updated_count);
END; $$;
ALTER FUNCTION enrich_installationstermine_jet_id() SET search_path = '';
GRANT EXECUTE ON FUNCTION enrich_installationstermine_jet_id() TO service_role;


-- ============================================================
-- SECTION 11: DASHBOARD KPI RPC FUNCTIONS
-- ============================================================

-- === get_dashboard_kpis ===
CREATE OR REPLACE FUNCTION get_dashboard_kpis(days_back INT DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  installed AS (
    SELECT display_id FROM airtable_displays WHERE online_status IN ('Live', 'Installed & online')
  ),
  installed_count AS (SELECT COUNT(*) AS total FROM installed),
  latest_hb AS (
    SELECT DISTINCT ON (display_id)
      display_id, COALESCE(NULLIF(days_offline, '')::INT, 0) AS days_off,
      is_alive, display_status, location_name, timestamp_parsed, raw_display_id
    FROM display_heartbeats ORDER BY display_id, timestamp_parsed DESC
  ),
  status_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE days_off < 1) AS online_count,
      COUNT(*) FILTER (WHERE days_off >= 1 AND days_off < 3) AS warning_count,
      COUNT(*) FILTER (WHERE days_off >= 3 AND days_off < 7) AS critical_count,
      COUNT(*) FILTER (WHERE days_off >= 7) AS permanent_offline_count,
      COUNT(*) AS heartbeat_total
    FROM latest_hb
  ),
  dayn AS (
    SELECT COUNT(*) AS total, ROUND(COUNT(*) * 0.9)::INT AS assumed_online
    FROM dayn_screens WHERE do_screen_id IS NOT NULL
  ),
  daily_trend AS (
    SELECT DATE(timestamp_parsed) AS day,
      COUNT(DISTINCT display_id) AS total,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) < 1) AS online,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 1 AND 2) AS warning,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 3 AND 6) AS critical,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) >= 7) AS permanent_offline
    FROM display_heartbeats
    WHERE timestamp_parsed >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY DATE(timestamp_parsed) ORDER BY day
  ),
  health_from_trend AS (
    SELECT COALESCE(SUM(online), 0) AS total_online, COALESCE(SUM(total), 0) AS total_expected FROM daily_trend
  ),
  display_list AS (
    SELECT h.display_id, h.raw_display_id, h.location_name, h.days_off, h.display_status, h.timestamp_parsed,
      CASE
        WHEN h.days_off < 1 THEN 'online' WHEN h.days_off >= 1 AND h.days_off < 3 THEN 'warning'
        WHEN h.days_off >= 3 AND h.days_off < 7 THEN 'critical'
        WHEN h.days_off >= 7 THEN 'permanent_offline' ELSE 'unknown'
      END AS status
    FROM latest_hb h
  )
  SELECT json_build_object(
    'installed', (SELECT total FROM installed_count),
    'online', (SELECT online_count FROM status_counts) + (SELECT assumed_online FROM dayn),
    'warning', (SELECT warning_count FROM status_counts),
    'critical', (SELECT critical_count FROM status_counts),
    'permanentOffline', (SELECT permanent_offline_count FROM status_counts),
    'heartbeatTotal', (SELECT heartbeat_total FROM status_counts),
    'daynTotal', (SELECT total FROM dayn),
    'daynOnline', (SELECT assumed_online FROM dayn),
    'healthRate', CASE
      WHEN (SELECT total_expected FROM health_from_trend) > 0
      THEN ROUND(((SELECT total_online FROM health_from_trend)::NUMERIC /
                   (SELECT total_expected FROM health_from_trend) * 100), 1)
      ELSE 0
    END,
    'totalOnlineHours', (SELECT total_online FROM health_from_trend),
    'totalExpectedHours', (SELECT total_expected FROM health_from_trend),
    'trend', (
      SELECT COALESCE(json_agg(json_build_object(
        'day', day, 'total', total, 'online', online, 'warning', warning,
        'critical', critical, 'permanentOffline', permanent_offline,
        'healthRate', CASE WHEN total > 0 THEN ROUND((online::NUMERIC / total * 100)::NUMERIC, 1) ELSE 0 END
      ) ORDER BY day), '[]'::JSON) FROM daily_trend
    ),
    'snapshotTimestamp', (SELECT MAX(timestamp_parsed) FROM latest_hb),
    'displays', (
      SELECT COALESCE(json_agg(json_build_object(
        'displayId', display_id, 'rawDisplayId', raw_display_id,
        'locationName', location_name, 'daysOffline', days_off,
        'displayStatus', display_status, 'status', status
      )), '[]'::JSON) FROM display_list
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO service_role;

-- === get_daily_trend ===
CREATE OR REPLACE FUNCTION get_daily_trend(days_back INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object(
      'day', day, 'total', total, 'online', online, 'warning', warning,
      'critical', critical, 'permanentOffline', permanent_offline,
      'healthRate', CASE WHEN total > 0 THEN ROUND((online::NUMERIC / total * 100)::NUMERIC, 1) ELSE 0 END
    ) ORDER BY day), '[]'::JSON)
    FROM (
      SELECT DATE(timestamp_parsed) AS day,
        COUNT(DISTINCT display_id) AS total,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) < 1) AS online,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 1 AND 2) AS warning,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 3 AND 6) AS critical,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) >= 7) AS permanent_offline
      FROM display_heartbeats
      WHERE timestamp_parsed >= NOW() - (days_back || ' days')::INTERVAL
      GROUP BY DATE(timestamp_parsed) ORDER BY day
    ) t
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO service_role;


-- === get_kpi_summary (from add-kpi-summary-rpc.sql) ===
-- RPC Function: get_kpi_summary (v3)
-- Aggregates heartbeat data + airtable_displays + dayn_screens server-side
-- Returns compact KPI summary covering the FULL display network (~466 displays)
--
-- v3 CHANGES:
-- - UNION with airtable_displays (Live) for JET displays without heartbeats
-- - UNION with dayn_screens for Dayn displays without heartbeats
-- - City mapping extended for DO-DY-* prefix (Dayn network, all Berlin)
-- - latestSnapshot + byCity + displays reflect FULL network
-- - Trend data remains heartbeat-only (historically accurate)
-- - New 'source' field: 'heartbeat', 'airtable', or 'dayn'

-- Drop old version first to ensure clean replacement
DROP FUNCTION IF EXISTS get_kpi_summary(INTEGER);

CREATE OR REPLACE FUNCTION get_kpi_summary(days_back INTEGER DEFAULT 180)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- Get the latest timestamp from heartbeats
  latest AS (
    SELECT MAX(timestamp_parsed) AS max_ts
    FROM display_heartbeats
  ),
  -- Compute cutoff date
  params AS (
    SELECT
      max_ts,
      max_ts - (days_back || ' days')::INTERVAL AS cutoff
    FROM latest
  ),
  -- ═══════════════════════════════════════════
  -- SOURCE 1: Heartbeat-monitored displays
  -- Per-display latest snapshot per day
  -- ═══════════════════════════════════════════
  daily_display_hb AS (
    SELECT DISTINCT ON (DATE(h.timestamp_parsed), h.display_id)
      DATE(h.timestamp_parsed) AS day,
      h.display_id,
      h.raw_display_id,
      h.location_name,
      h.heartbeat,
      h.days_offline,
      h.display_status,
      h.last_online_date,
      h.timestamp_parsed,
      'heartbeat'::TEXT AS source
    FROM display_heartbeats h, params p
    WHERE h.timestamp_parsed >= p.cutoff
    ORDER BY DATE(h.timestamp_parsed), h.display_id, h.timestamp_parsed DESC
  ),
  -- Collect all heartbeat display_ids
  hb_display_ids AS (
    SELECT DISTINCT display_id FROM daily_display_hb
  ),
  -- ═══════════════════════════════════════════
  -- Heartbeat daily_stats (for trend calculation)
  -- ═══════════════════════════════════════════
  daily_stats_hb AS (
    SELECT
      day,
      display_id,
      raw_display_id,
      location_name,
      heartbeat,
      days_offline,
      display_status,
      source,
      CASE
        WHEN days_offline IS NULL OR days_offline = '' THEN NULL
        ELSE CAST(days_offline AS NUMERIC)
      END AS days_offline_num,
      16.0 AS daily_operating_hours,
      CASE
        WHEN days_offline IS NULL OR days_offline = '' THEN 999.0
        ELSE CAST(days_offline AS NUMERIC) * 24.0
      END AS offline_hours,
      -- Online operating hours (heartbeat-based)
      CASE
        WHEN heartbeat IS NULL AND days_offline IS NULL THEN 0.0
        WHEN display_status = 'live' THEN
          CASE
            WHEN days_offline IS NULL OR days_offline = '' OR days_offline = '0' THEN 16.0
            WHEN CAST(days_offline AS NUMERIC) <= 1 THEN 15.0
            WHEN CAST(days_offline AS NUMERIC) <= 2 THEN 12.0
            WHEN CAST(days_offline AS NUMERIC) <= 3 THEN 8.0
            ELSE GREATEST(0.0, 16.0 - CAST(days_offline AS NUMERIC) * 4.0)
          END
        WHEN display_status = 'zu beobachten' THEN
          CASE
            WHEN days_offline IS NULL OR days_offline = '' THEN 4.0
            WHEN CAST(days_offline AS NUMERIC) <= 2 THEN 10.0
            WHEN CAST(days_offline AS NUMERIC) <= 5 THEN 6.0
            WHEN CAST(days_offline AS NUMERIC) <= 10 THEN 3.0
            ELSE 1.0
          END
        WHEN display_status = 'offline' THEN 0.0
        ELSE 0.0
      END AS online_hours,
      -- Status category
      CASE
        WHEN heartbeat IS NULL AND (days_offline IS NULL OR days_offline = '') THEN 'never_online'
        WHEN display_status = 'live' THEN 'online'
        WHEN display_status = 'zu beobachten' THEN 'warning'
        WHEN display_status = 'offline' THEN
          CASE
            WHEN days_offline IS NOT NULL AND days_offline != '' AND CAST(days_offline AS NUMERIC) > 30 THEN 'permanent_offline'
            ELSE 'critical'
          END
        ELSE 'critical'
      END AS status_category
    FROM daily_display_hb
  ),
  -- ═══════════════════════════════════════════
  -- Trend: aggregate per day (HEARTBEAT ONLY — historically accurate)
  -- ═══════════════════════════════════════════
  daily_aggregated AS (
    SELECT
      day,
      COUNT(*) AS total_displays,
      SUM(CASE WHEN status_category = 'online' THEN 1 ELSE 0 END) AS online_count,
      SUM(CASE WHEN status_category = 'warning' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN status_category = 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN status_category = 'permanent_offline' THEN 1 ELSE 0 END) AS permanent_offline_count,
      SUM(CASE WHEN status_category = 'never_online' THEN 1 ELSE 0 END) AS never_online_count,
      ROUND(SUM(online_hours)::NUMERIC, 1) AS total_online_hours,
      ROUND(SUM(daily_operating_hours)::NUMERIC, 1) AS total_expected_hours,
      CASE
        WHEN SUM(daily_operating_hours) > 0
        THEN ROUND((SUM(online_hours) / SUM(daily_operating_hours) * 100)::NUMERIC, 1)
        ELSE 0
      END AS health_rate
    FROM daily_stats_hb
    GROUP BY day
    ORDER BY day
  ),
  -- ═══════════════════════════════════════════
  -- FULL NETWORK: latest snapshot includes ALL sources
  -- ═══════════════════════════════════════════
  latest_hb_snapshot AS (
    SELECT display_id, raw_display_id, location_name, days_offline, display_status,
           status_category, offline_hours, source
    FROM daily_stats_hb
    WHERE day = (SELECT MAX(day) FROM daily_stats_hb)
  ),
  -- Airtable Live displays NOT in heartbeats
  airtable_extra AS (
    SELECT
      ad.display_id,
      ad.display_id AS raw_display_id,
      ad.location_name,
      NULL::TEXT AS days_offline,
      'live'::TEXT AS display_status,
      'online'::TEXT AS status_category,
      999.0 AS offline_hours,
      'airtable'::TEXT AS source
    FROM airtable_displays ad
    WHERE ad.online_status = 'Live'
      AND ad.display_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hb_display_ids hb WHERE hb.display_id = ad.display_id)
  ),
  -- Dayn screens NOT in heartbeats
  -- Only 'Installed & online' = truly live screens
  dayn_extra AS (
    SELECT
      ds.do_screen_id AS display_id,
      ds.do_screen_id AS raw_display_id,
      ds.location_name,
      NULL::TEXT AS days_offline,
      'live'::TEXT AS display_status,
      'online'::TEXT AS status_category,
      999.0 AS offline_hours,
      'dayn'::TEXT AS source
    FROM dayn_screens ds
    WHERE ds.do_screen_id IS NOT NULL
      AND ds.screen_status = 'Installed & online'
      AND NOT EXISTS (SELECT 1 FROM hb_display_ids hb WHERE hb.display_id = ds.do_screen_id)
  ),
  -- UNION of all three sources = full network snapshot
  full_snapshot AS (
    SELECT * FROM latest_hb_snapshot
    UNION ALL
    SELECT * FROM airtable_extra
    UNION ALL
    SELECT * FROM dayn_extra
  ),
  -- Compute full-network aggregates for latestSnapshot
  full_network_agg AS (
    SELECT
      COUNT(*) AS total_displays,
      SUM(CASE WHEN status_category = 'online' THEN 1 ELSE 0 END) AS online_count,
      SUM(CASE WHEN status_category = 'warning' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN status_category = 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN status_category = 'permanent_offline' THEN 1 ELSE 0 END) AS permanent_offline_count,
      SUM(CASE WHEN status_category = 'never_online' THEN 1 ELSE 0 END) AS never_online_count,
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND((SUM(CASE WHEN status_category = 'online' THEN 16.0 WHEN status_category = 'warning' THEN 8.0 ELSE 0.0 END)
              / (COUNT(*) * 16.0) * 100)::NUMERIC, 1)
        ELSE 0
      END AS health_rate
    FROM full_snapshot
  ),
  -- Per-city breakdown from FULL snapshot
  city_breakdown AS (
    SELECT
      CASE
        WHEN raw_display_id LIKE 'DO-GER-BER-%' OR raw_display_id LIKE 'DO-DY-GER-BER-%' THEN 'Berlin'
        WHEN raw_display_id LIKE 'DO-GER-HAM-%' OR raw_display_id LIKE 'DO-GER-HH-%' THEN 'Hamburg'
        WHEN raw_display_id LIKE 'DO-GER-MUC-%' THEN 'München'
        WHEN raw_display_id LIKE 'DO-GER-CGN-%' THEN 'Köln'
        WHEN raw_display_id LIKE 'DO-GER-DUS-%' THEN 'Düsseldorf'
        WHEN raw_display_id LIKE 'DO-GER-FRA-%' THEN 'Frankfurt'
        WHEN raw_display_id LIKE 'DO-GER-STR-%' THEN 'Stuttgart'
        WHEN raw_display_id LIKE 'DO-GER-DTM-%' OR raw_display_id LIKE 'DO-GER-DO-%' THEN 'Dortmund'
        WHEN raw_display_id LIKE 'DO-GER-NUE-%' THEN 'Nürnberg'
        WHEN raw_display_id LIKE 'DO-GER-LEJ-%' THEN 'Leipzig'
        ELSE 'Andere'
      END AS city,
      COUNT(*) AS total,
      SUM(CASE WHEN status_category = 'online' THEN 1 ELSE 0 END) AS online,
      SUM(CASE WHEN status_category != 'online' THEN 1 ELSE 0 END) AS offline
    FROM full_snapshot
    GROUP BY city
    ORDER BY total DESC
  )
  SELECT JSON_BUILD_OBJECT(
    'generatedAt', NOW(),
    'daysBack', days_back,
    'latestSnapshot', (SELECT JSON_BUILD_OBJECT(
      'date', (SELECT MAX(day) FROM daily_stats_hb),
      'totalDisplays', fna.total_displays,
      'onlineCount', fna.online_count,
      'warningCount', fna.warning_count,
      'criticalCount', fna.critical_count,
      'permanentOfflineCount', fna.permanent_offline_count,
      'neverOnlineCount', fna.never_online_count,
      'healthRate', fna.health_rate
    ) FROM full_network_agg fna),
    'trend', (SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'day', day,
      'total', total_displays,
      'online', online_count,
      'warning', warning_count,
      'critical', critical_count,
      'permanentOffline', permanent_offline_count,
      'neverOnline', never_online_count,
      'healthRate', health_rate,
      'totalOnlineHours', total_online_hours,
      'totalExpectedHours', total_expected_hours
    ) ORDER BY day) FROM daily_aggregated),
    'byCity', (SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'city', city,
      'total', total,
      'online', online,
      'offline', offline
    )) FROM city_breakdown),
    'displays', (SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'displayId', display_id,
      'rawDisplayId', raw_display_id,
      'locationName', location_name,
      'daysOffline', days_offline,
      'displayStatus', display_status,
      'status', status_category,
      'offlineHours', offline_hours,
      'source', source
    )) FROM full_snapshot)
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to anon role so the frontend can call it
GRANT EXECUTE ON FUNCTION get_kpi_summary TO anon;
GRANT EXECUTE ON FUNCTION get_kpi_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_kpi_summary TO service_role;


-- === get_mobile_kpis (from add-mobile-kpis-rpc.sql) ===
-- =============================================
-- Mobile KPIs RPC Function
-- Returns all dashboard KPIs in a single call (~2KB JSON)
-- Includes BOTH Navori heartbeat displays AND Dayn screens
-- Run this in Supabase SQL Editor
-- =============================================

CREATE OR REPLACE FUNCTION get_mobile_kpis()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- 1. Get the LATEST heartbeat snapshot per display_id (Navori displays)
  latest_per_display AS (
    SELECT DISTINCT ON (display_id)
      display_id,
      raw_display_id,
      location_name,
      timestamp_parsed,
      heartbeat,
      is_alive,
      display_status,
      days_offline,
      -- Calculate offline hours from timestamp and heartbeat
      CASE
        WHEN heartbeat IS NOT NULL AND timestamp_parsed IS NOT NULL
        THEN EXTRACT(EPOCH FROM (timestamp_parsed - heartbeat::timestamptz)) / 3600.0
        ELSE NULL
      END AS offline_hours,
      -- Extract city code (3rd segment of display_id split by '-')
      CASE
        WHEN display_id LIKE '%-%-%'
        THEN split_part(display_id, '-', 3)
        ELSE 'UNK'
      END AS city_code
    FROM display_heartbeats
    WHERE timestamp_parsed > NOW() - INTERVAL '30 days'
    ORDER BY display_id, timestamp_parsed DESC
  ),

  -- 2. Check which displays EVER had a heartbeat (across all time)
  ever_online AS (
    SELECT display_id, TRUE AS had_heartbeat
    FROM display_heartbeats
    WHERE heartbeat IS NOT NULL
    GROUP BY display_id
  ),

  -- 3. Classify each display into status categories
  classified AS (
    SELECT
      l.*,
      COALESCE(e.had_heartbeat, FALSE) AS ever_had_heartbeat,
      CASE
        WHEN COALESCE(e.had_heartbeat, FALSE) = FALSE THEN 'never_online'
        WHEN l.offline_hours IS NULL OR l.offline_hours < 0 THEN 'online'
        WHEN l.offline_hours < 24 THEN 'online'
        WHEN l.offline_hours < 72 THEN 'warning'
        WHEN l.offline_hours >= 168 THEN 'permanent_offline'
        ELSE 'critical'
      END AS status
    FROM latest_per_display l
    LEFT JOIN ever_online e ON e.display_id = l.display_id
  ),

  -- 4. City name mapping
  city_mapped AS (
    SELECT
      c.*,
      CASE c.city_code
        WHEN 'CGN' THEN 'Köln'
        WHEN 'BER' THEN 'Berlin'
        WHEN 'MUC' THEN 'München'
        WHEN 'HAM' THEN 'Hamburg'
        WHEN 'HH'  THEN 'Hamburg'
        WHEN 'DUS' THEN 'Düsseldorf'
        WHEN 'FRA' THEN 'Frankfurt'
        WHEN 'STR' THEN 'Stuttgart'
        WHEN 'DTM' THEN 'Dortmund'
        WHEN 'DO'  THEN 'Dortmund'
        WHEN 'LEJ' THEN 'Leipzig'
        WHEN 'DRS' THEN 'Dresden'
        WHEN 'NUE' THEN 'Nürnberg'
        WHEN 'HAN' THEN 'Hannover'
        WHEN 'BRE' THEN 'Bremen'
        WHEN 'ESS' THEN 'Essen'
        WHEN 'KA'  THEN 'Karlsruhe'
        WHEN 'MS'  THEN 'Münster'
        WHEN 'BI'  THEN 'Bielefeld'
        WHEN 'WI'  THEN 'Wiesbaden'
        WHEN 'MA'  THEN 'Mannheim'
        WHEN 'AC'  THEN 'Aachen'
        WHEN 'KI'  THEN 'Kiel'
        WHEN 'ROS' THEN 'Rostock'
        ELSE city_code
      END AS city_name
    FROM classified c
  ),

  -- 5. Aggregate Navori KPIs (uptime-based health rate matching desktop calculation)
  --    Desktop uses estimateOperatingOnlineHours(offlineHours):
  --      <= 3.5h offline → 16h online (within check interval)
  --      3.5h-16h offline → (16 - offlineHours) online
  --      > 16h offline → 0h online
  --    Health Rate = sum(online_hours) / sum(expected_hours) * 100
  --    Expected hours = 16h per active display (excluding never_online)
  navori_agg AS (
    SELECT
      COUNT(*) AS total_active,
      COUNT(*) FILTER (WHERE status = 'online') AS online_count,
      COUNT(*) FILTER (WHERE status = 'warning') AS warning_count,
      COUNT(*) FILTER (WHERE status = 'critical') AS critical_count,
      COUNT(*) FILTER (WHERE status = 'permanent_offline') AS permanent_offline_count,
      COUNT(*) FILTER (WHERE status = 'never_online') AS never_online_count,
      -- Sum of online operating hours (numerator for health rate)
      COALESCE(SUM(
        CASE
          WHEN status = 'never_online' THEN 0
          WHEN offline_hours IS NULL OR offline_hours <= 3.5 THEN 16.0
          WHEN offline_hours <= 16.0 THEN GREATEST(0, 16.0 - offline_hours)
          ELSE 0
        END
      ), 0) AS navori_online_hours,
      -- Total expected operating hours (denominator for health rate)
      COALESCE(COUNT(*) FILTER (WHERE status != 'never_online') * 16.0, 0) AS navori_expected_hours
    FROM city_mapped
  ),

  -- 5b. Dayn Screens aggregation (separate display network)
  --     All installed Dayn screens count as totalActive.
  --     Screens with screen_status ~* 'online' count as online.
  dayn_agg AS (
    SELECT
      COUNT(*) AS dayn_total,
      COUNT(*) FILTER (WHERE screen_status ~* 'online') AS dayn_online
    FROM dayn_screens
  ),

  -- 5c. Combined KPIs (Navori + Dayn)
  kpi_agg AS (
    SELECT
      n.total_active + d.dayn_total AS total_active,
      n.online_count + d.dayn_online AS online_count,
      n.warning_count,
      n.critical_count,
      n.permanent_offline_count,
      n.never_online_count,
      d.dayn_total,
      d.dayn_online,
      -- Combined health rate: Dayn online screens contribute full 16h
      ROUND(
        COALESCE(
          (n.navori_online_hours + d.dayn_online * 16.0)
          / NULLIF(n.navori_expected_hours + d.dayn_total * 16.0, 0)
          * 100,
          0
        ),
        1
      ) AS health_rate
    FROM navori_agg n
    CROSS JOIN dayn_agg d
  ),

  -- 6. Top offline displays (for attention cards)
  top_offline AS (
    SELECT json_agg(t) AS displays
    FROM (
      SELECT
        display_id AS "displayId",
        location_name AS "locationName",
        city_name AS "city",
        status,
        ROUND(COALESCE(offline_hours, 0)::NUMERIC, 1) AS "offlineHours",
        days_offline AS "daysOffline"
      FROM city_mapped
      WHERE status IN ('critical', 'permanent_offline')
      ORDER BY COALESCE(offline_hours, 0) DESC
      LIMIT 10
    ) t
  ),

  -- 7. City breakdown (Navori only — Dayn screens don't have city codes in same format)
  city_breakdown AS (
    SELECT json_object_agg(
      city_name,
      json_build_object(
        'total', total,
        'online', online,
        'warning', warn,
        'critical', crit,
        'offline', perm_off
      )
    ) AS by_city
    FROM (
      SELECT
        city_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'online') AS online,
        COUNT(*) FILTER (WHERE status = 'warning') AS warn,
        COUNT(*) FILTER (WHERE status = 'critical') AS crit,
        COUNT(*) FILTER (WHERE status = 'permanent_offline') AS perm_off
      FROM city_mapped
      GROUP BY city_name
      ORDER BY total DESC
    ) cities
  ),

  -- 8. First-seen counts for "newly installed" (last 7 days)
  new_installs AS (
    SELECT COUNT(*) AS cnt
    FROM display_first_seen
    WHERE first_seen > NOW() - INTERVAL '7 days'
  )

  SELECT json_build_object(
    'healthRate', COALESCE(k.health_rate, 0),
    'totalActive', k.total_active,
    'onlineCount', k.online_count,
    'warningCount', k.warning_count,
    'criticalCount', k.critical_count,
    'permanentOfflineCount', k.permanent_offline_count,
    'neverOnlineCount', k.never_online_count,
    'daynTotal', k.dayn_total,
    'daynOnline', k.dayn_online,
    'newlyInstalled', COALESCE(n.cnt, 0),
    'deinstalled', 0,
    'topOffline', COALESCE(o.displays, '[]'::json),
    'byCity', COALESCE(cb.by_city, '{}'::json),
    'computedAt', NOW()
  ) INTO result
  FROM kpi_agg k
  CROSS JOIN top_offline o
  CROSS JOIN city_breakdown cb
  CROSS JOIN new_installs n;

  RETURN result;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION get_mobile_kpis() TO anon;
GRANT EXECUTE ON FUNCTION get_mobile_kpis() TO authenticated;



-- ============================================================
-- SECTION 12: TRIGGERS
-- ============================================================

-- Auto-update updated_at triggers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_routen_updated_at') THEN
    CREATE TRIGGER trg_routen_updated_at BEFORE UPDATE ON install_routen FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_updated_at') THEN
    CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON install_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_purchase_orders_updated_at') THEN
    CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shipping_orders_updated_at') THEN
    CREATE TRIGGER trg_shipping_orders_updated_at BEFORE UPDATE ON shipping_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_orders_updated_at') THEN
    CREATE TRIGGER trg_return_orders_updated_at BEFORE UPDATE ON return_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stock_alerts_updated_at') THEN
    CREATE TRIGGER trg_stock_alerts_updated_at BEFORE UPDATE ON stock_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- NocoDB synced_at triggers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nocodb_vorbereitet_synced_at') THEN
    CREATE TRIGGER trg_nocodb_vorbereitet_synced_at BEFORE UPDATE ON nocodb_vorbereitet FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nocodb_vistar_navori_synced_at') THEN
    CREATE TRIGGER trg_nocodb_vistar_navori_synced_at BEFORE UPDATE ON nocodb_vistar_navori FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nocodb_sim_kunden_synced_at') THEN
    CREATE TRIGGER trg_nocodb_sim_kunden_synced_at BEFORE UPDATE ON nocodb_sim_kunden FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nocodb_lieferando_synced_at') THEN
    CREATE TRIGGER trg_nocodb_lieferando_synced_at BEFORE UPDATE ON nocodb_lieferando FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();
  END IF;
END $$;


-- ============================================================
-- SECTION 13: GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION generate_po_number() TO anon;
GRANT EXECUTE ON FUNCTION generate_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_shipping_id() TO anon;
GRANT EXECUTE ON FUNCTION generate_shipping_id() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_return_id() TO anon;
GRANT EXECUTE ON FUNCTION generate_return_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_stock_summary() TO anon;
GRANT EXECUTE ON FUNCTION get_stock_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION pick_for_shipping(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION receive_po_item(BIGINT, BIGINT, INTEGER, TEXT[], TEXT) TO authenticated;


-- ============================================================
-- SECTION 14: SEED DATA
-- ============================================================

-- sync_metadata initial rows
INSERT INTO sync_metadata (table_name, last_sync_status) VALUES
  ('heartbeats', 'pending'),
  ('stammdaten', 'pending'),
  ('airtable_displays', 'pending'),
  ('tasks', 'pending'),
  ('acquisition', 'pending'),
  ('dayn_screens', 'pending'),
  ('installationen', 'pending'),
  ('hardware_ops', 'pending'),
  ('hardware_sim', 'pending'),
  ('hardware_displays', 'pending'),
  ('chg_approvals', 'pending'),
  ('hardware_swaps', 'pending'),
  ('hardware_deinstalls', 'pending'),
  ('communications', 'pending'),
  ('installationstermine', 'pending'),
  ('attachment_sync_acquisition', 'pending'),
  ('attachment_sync_tasks', 'pending'),
  ('attachment_sync_installationen', 'pending'),
  ('nocodb_vorbereitet', 'pending'),
  ('nocodb_vistar_navori', 'pending'),
  ('nocodb_sim_kunden', 'pending'),
  ('nocodb_lieferando', 'pending')
ON CONFLICT (table_name) DO NOTHING;

-- Feature flags
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('superchat_enabled', false, 'WhatsApp-Nachrichten via SuperChat API senden'),
  ('superchat_test_phone', false, '+491234567890'),
  ('navori_heartbeat_enabled', false, 'Navori API Heartbeat Sync (stuendlich, ersetzt Google Sheets)'),
  ('install_verification_enabled', false, 'Automatische 3/10-Tage Online-Rate-Pruefung nach Installation'),
  ('akquise_automation_enabled', false, 'Master-Switch: KI-Akquise Automation aktivieren'),
  ('akquise_ai_bot_enabled', false, 'KI-Bot Auto-Antworten auf eingehende WhatsApp-Nachrichten'),
  ('akquise_test_phone', false, '+491234567890'),
  ('akquise_max_daily_sends', true, '50')
ON CONFLICT (key) DO NOTHING;

-- Default groups
INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_admin',
  'Admin',
  'Voller Zugriff inkl. Admin-Panel',
  '#ef4444',
  'Shield',
  ARRAY['*'],
  ARRAY['*']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_vollzugriff',
  'Vollzugriff',
  'Voller Zugriff auf alle Bereiche ausser Admin-Verwaltung',
  '#6366f1',
  'Shield',
  ARRAY[
    'displays', 'displays.overview', 'displays.list', 'displays.cities',
    'hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes',
    'hardware.positionen', 'hardware.bestellwesen', 'hardware.lager-versand', 'hardware.tracking',
    'tasks', 'communication',
    'installations', 'installations.calendar', 'installations.bookings', 'faw'
  ],
  ARRAY[
    'view', 'export', 'view_contacts', 'view_revenue',
    'create_task', 'edit_task', 'delete_task',
    'send_message', 'view_messages',
    'manage_schedule', 'manage_bookings', 'send_booking_invite',
    'manage_hardware', 'manage_warehouse', 'manage_qr'
  ]
) ON CONFLICT (id) DO UPDATE SET tabs = EXCLUDED.tabs, actions = EXCLUDED.actions;

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_monteur',
  'Monteur',
  'Monteur-Tagesroute (mobil)',
  '#f59e0b',
  'Wrench',
  ARRAY['monteur'],
  ARRAY['view', 'manage_installation']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_scheduling',
  'Terminierung',
  'Installationstermine planen und verwalten',
  '#f97316',
  'CalendarCheck',
  ARRAY['installations', 'installations.calendar', 'installations.bookings'],
  ARRAY['view', 'view_contacts', 'manage_schedule', 'manage_bookings', 'send_booking_invite']
) ON CONFLICT (id) DO UPDATE SET tabs = EXCLUDED.tabs, actions = EXCLUDED.actions;

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_partner',
  'Partner / Logistik',
  'Installations- und Hardware-Logistik Partner',
  '#10b981',
  'Truck',
  ARRAY[
    'hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes',
    'hardware.positionen', 'installations', 'installations.calendar', 'installations.bookings'
  ],
  ARRAY['view', 'manage_hardware', 'manage_warehouse', 'manage_qr', 'manage_bookings']
) ON CONFLICT (id) DO UPDATE SET tabs = EXCLUDED.tabs, actions = EXCLUDED.actions;

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_faw_pruefer',
  'FAW Pruefer',
  'Externe Frequenzpruefer -- sehen nur FAW Check Standorte',
  '#d97706',
  'Eye',
  ARRAY['faw'],
  ARRAY['view', 'faw_review']
) ON CONFLICT (id) DO UPDATE SET tabs = EXCLUDED.tabs, actions = EXCLUDED.actions;

-- Default install teams
INSERT INTO install_teams (name, description, color) VALUES
  ('Team Alpha', 'Primaeres Installationsteam', '#3b82f6'),
  ('Team Beta', 'Zweites Installationsteam', '#22c55e'),
  ('Team Gamma', 'Drittes Installationsteam', '#f59e0b')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- SECTION 15: REFRESH POSTGREST SCHEMA CACHE
-- ============================================================

NOTIFY pgrst, 'reload schema';


COMMIT;

-- ============================================================
-- END OF MIGRATION SCRIPT
-- ============================================================
