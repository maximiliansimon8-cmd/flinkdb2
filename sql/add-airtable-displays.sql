-- ═══════════════════════════════════════════════════════════════════
-- New Supabase Tables for Airtable Sync
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════


-- ═══ 1. Live Display Locations (Displays) ═══
CREATE TABLE IF NOT EXISTS airtable_displays (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  airtable_id TEXT,
  display_id TEXT,                         -- DO-GER-BER-WD-55-362-25 format
  display_table_id TEXT,                   -- Internal table ID
  display_name TEXT,                       -- Computed display name
  online_status TEXT,                      -- "Online", "Offline", "Deinstalliert" etc.
  live_since DATE,                         -- Date display went live
  deinstall_date DATE,                     -- Deinstallation date (if applicable)
  screen_type TEXT,                        -- e.g. "Samsung"
  screen_size TEXT,                        -- e.g. "55 Zoll"
  screen_network_category TEXT,            -- Network category
  rtb_venue_type TEXT,                     -- Vistar RTB venue type
  navori_venue_id TEXT,                    -- Navori Venue ID (= serial number / Vistar partner_venue_id)
  navori_display_id NUMERIC,               -- Navori internal display ID
  location_name TEXT,                      -- Location name (from Stammdaten lookup)
  city TEXT,                               -- City (from Stammdaten lookup)
  street TEXT,
  street_number TEXT,
  postal_code TEXT,
  jet_id TEXT,                             -- JET ID (from JET ID lookup)
  sov_partner_ad NUMERIC,                 -- Share of Voice partner ad (percentage)
  passpartout BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airtable_displays_display_id ON airtable_displays(display_id);
CREATE INDEX IF NOT EXISTS idx_airtable_displays_online_status ON airtable_displays(online_status);
CREATE INDEX IF NOT EXISTS idx_airtable_displays_navori_venue_id ON airtable_displays(navori_venue_id);
CREATE INDEX IF NOT EXISTS idx_airtable_displays_city ON airtable_displays(city);

ALTER TABLE airtable_displays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON airtable_displays
  FOR SELECT TO authenticated USING (true);


-- ═══ 2. Acquisition_DB ═══
CREATE TABLE IF NOT EXISTS acquisition (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  airtable_id TEXT,
  akquise_id INTEGER,                     -- Auto-number from Airtable
  lead_status TEXT,                        -- "Vertrag", "Live", "Storniert", etc.
  frequency_approval TEXT,                 -- FAW Check approval status
  install_approval TEXT,                   -- Installation approval
  approval_status TEXT,                    -- Overall approval
  acquisition_date DATE,
  installations_status TEXT[],             -- Lookup: status from installations
  display_location_status TEXT[],          -- Lookup: online status from displays
  city TEXT[],                             -- City (lookup)
  location_name TEXT,                      -- Location name (lookup)
  street TEXT,                             -- Street (lookup)
  street_number TEXT,                      -- Street number (lookup)
  postal_code TEXT,                        -- Postal code (lookup)
  jet_id TEXT,                             -- JET ID (lookup)
  contact_person TEXT,                     -- Contact (lookup)
  contact_email TEXT,                      -- Email (lookup)
  contact_phone TEXT,                      -- Phone (lookup)
  acquisition_partner TEXT,                -- Partner name (lookup)
  dVAC_week NUMERIC,                       -- dVAC per week (100% SoV)
  schaufenster TEXT,                       -- Window visible
  hindernisse TEXT,                        -- Obstacles present
  mount_type TEXT,                         -- Mount type
  submitted_by TEXT,                       -- Who submitted
  submitted_at DATE,                       -- When submitted
  vertrag_vorhanden TEXT,                  -- Contract PDF present (formula)
  akquise_storno BOOLEAN DEFAULT false,    -- Acquisition cancelled
  post_install_storno BOOLEAN DEFAULT false, -- Post-install cancellation
  post_install_storno_grund TEXT[],        -- Cancellation reasons
  ready_for_installation BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acquisition_lead_status ON acquisition(lead_status);
CREATE INDEX IF NOT EXISTS idx_acquisition_jet_id ON acquisition(jet_id);
CREATE INDEX IF NOT EXISTS idx_acquisition_date ON acquisition(acquisition_date);

ALTER TABLE acquisition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON acquisition
  FOR SELECT TO authenticated USING (true);


-- ═══ 3. Add missing columns to tasks table ═══
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
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS superchat BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_by TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jet_ids TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cities TEXT[];


-- ═══ 4. Stammdaten: add display_status if not exists ═══
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS display_status TEXT;
