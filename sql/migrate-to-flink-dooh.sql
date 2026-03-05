-- ============================================================================
-- FlinkDB2: Consolidated Migration for Flink_DooH Supabase
-- Target: nrijgfcdlvuhhudasicd.supabase.co
-- Generated: 2026-03-05
--
-- Run this in the Supabase SQL Editor to create all tables needed by FlinkDB2.
-- Existing tables (displays, locations, etc.) are not recreated.
-- Uses IF NOT EXISTS everywhere — safe to run multiple times.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────
-- Source: add-airtable-displays.sql
-- ──────────────────────────────────────────────────────────────
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


-- ──────────────────────────────────────────────────────────────
-- Source: add-stammdaten-all-fields.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Add all Airtable Stammdaten fields as named columns
-- Previously these were stored in extra_fields JSONB; now each gets its own column
-- for proper typing, indexing, and easier queries.

-- Computed/formula fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS jet_search TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS jet_search_2 TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS location_search TEXT;

-- Location details
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS location_categories TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS jet_chain TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS restaurant_website TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS lega_entity_adress TEXT;  -- ⚠️ Typo in Airtable original

-- Geo data
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS koordinaten TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS streetview_link TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS image_link TEXT;

-- Contact fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS formatted_germany_mobile_phone TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS superchat_id TEXT;

-- Frequency / opening hours
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS weischer_30m_frequency NUMERIC;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS regular_open_time TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS regular_close_time_weekdays TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS regular_close_time_weekdend TEXT;  -- ⚠️ Typo in Airtable original
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS weekend_close_time TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS closed_days TEXT;

-- Akquise fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS akquise JSONB;  -- linked record IDs
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS zur_akquise_freigegeben BOOLEAN;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS akquise_freigabedatum TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS akquise_freigegeben_von TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS acquisition_update TEXT;

-- Installation fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS installationen JSONB;  -- linked record IDs
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS record_id_from_installationen JSONB;  -- lookup array
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS count_installationen INTEGER;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS status_installation_from_installationen JSONB;  -- lookup array
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS installationstermine JSONB;  -- linked record IDs

-- Display fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS displays JSONB;  -- linked record IDs
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS displays_copy JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS displays_copy_2 JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS live_display_locations_copy JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS ops_nr_from_displays JSONB;  -- lookup array
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS ops_sn_from_displays JSONB;  -- lookup array
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS online_status_from_displays JSONB;  -- lookup array, ⚠️ trailing space in AT
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS live_since_from_displays JSONB;  -- lookup array

-- Task fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS related_tasks JSONB;  -- linked record IDs
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS tasks JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS tasks_copy JSONB;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS assigned_from_related_tasks JSONB;  -- lookup array

-- Hardware fields
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS ops_player_inventory JSONB;  -- linked record IDs
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS deinstallation_ruecknahme JSONB;  -- linked record IDs

-- CHG
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS chg_approval JSONB;  -- linked record IDs
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS vertrag_pdf_from_akquise JSONB;  -- attachment lookup

-- Other
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS attachments JSONB;  -- attachments
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS brands_listed TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS date_first_online TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS imported TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS imported_table TEXT;
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS caller_feedback_locations JSONB;

-- Indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_stammdaten_latitude ON stammdaten (latitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_longitude ON stammdaten (longitude) WHERE longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_jet_chain ON stammdaten (jet_chain) WHERE jet_chain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_location_categories ON stammdaten (location_categories) WHERE location_categories IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stammdaten_superchat_id ON stammdaten (superchat_id) WHERE superchat_id IS NOT NULL;


-- ──────────────────────────────────────────────────────────────
-- Source: add-dayn-screens.sql
-- ──────────────────────────────────────────────────────────────
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


-- ──────────────────────────────────────────────────────────────
-- Source: add-navori-heartbeat.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Add source column to display_heartbeats + Navori feature flag
-- Enables distinguishing Sheets-imported vs Navori API heartbeats

-- 1. Add source column (default 'sheets' for existing data)
ALTER TABLE display_heartbeats ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sheets';

-- 2. Add unique constraint on (display_id, timestamp_parsed) if not exists
-- This is needed for the navori upsert which uses timestamp_parsed (ISO) instead of timestamp (German format)
-- The existing constraint is on (display_id, timestamp) — we need both during parallel operation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'display_heartbeats_display_id_timestamp_parsed_key'
  ) THEN
    ALTER TABLE display_heartbeats
      ADD CONSTRAINT display_heartbeats_display_id_timestamp_parsed_key
      UNIQUE (display_id, timestamp_parsed);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint may already exist or cannot be created: %', SQLERRM;
END $$;

-- 3. Feature flag for Navori heartbeat sync
INSERT INTO feature_flags (key, enabled, description)
VALUES ('navori_heartbeat_enabled', false, 'Navori API Heartbeat Sync (stuendlich, ersetzt Google Sheets)')
ON CONFLICT (key) DO NOTHING;

-- 4. Index on source for easy filtering
CREATE INDEX IF NOT EXISTS idx_display_heartbeats_source ON display_heartbeats(source);


-- ──────────────────────────────────────────────────────────────
-- Source: add-heartbeat-indexes.sql
-- ──────────────────────────────────────────────────────────────
-- Performance-Indexes für display_heartbeats
-- Beschleunigt die get_dashboard_kpis RPC und andere Queries

-- Index für DISTINCT ON (display_id) ORDER BY timestamp_parsed DESC
-- Beschleunigt: latest_hb CTE (neuester Heartbeat pro Display)
CREATE INDEX IF NOT EXISTS idx_heartbeats_display_ts_desc
  ON display_heartbeats (display_id, timestamp_parsed DESC);

-- Index für zeitbasierte Abfragen (Trend, Health Rate)
-- Beschleunigt: hourly_health, daily_trend CTEs
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts_parsed
  ON display_heartbeats (timestamp_parsed);

-- Index für timestamp + days_offline Kombination (Health Rate Berechnung)
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts_days_offline
  ON display_heartbeats (timestamp_parsed, days_offline);


-- ──────────────────────────────────────────────────────────────
-- Source: add-sync-metadata.sql
-- ──────────────────────────────────────────────────────────────
-- =============================================
-- Sync Metadata Table
-- Tracks last sync timestamp per table for incremental syncing
-- Run this in Supabase SQL Editor
-- =============================================

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

-- Index for fast lookup by table name
CREATE INDEX IF NOT EXISTS idx_sync_metadata_table_name ON sync_metadata(table_name);

-- Grant access to service role (used by Netlify functions)
GRANT ALL ON sync_metadata TO service_role;
GRANT SELECT ON sync_metadata TO authenticated;
GRANT SELECT ON sync_metadata TO anon;

-- Insert initial rows for all synced tables (first sync will be full)
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
  ('communications', 'pending')
ON CONFLICT (table_name) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- Source: add-feature-flags.sql
-- ──────────────────────────────────────────────────────────────
-- Feature Flags table for runtime configuration
-- Used to control features like SuperChat/WhatsApp messaging
-- without needing code deployments.

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Everyone can read flags (needed by Netlify Functions + Frontend)
CREATE POLICY "Anyone can read feature flags"
  ON feature_flags FOR SELECT
  USING (true);

-- Only authenticated users can update flags
CREATE POLICY "Authenticated users can update feature flags"
  ON feature_flags FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Only service_role can insert/delete
CREATE POLICY "Service role can manage feature flags"
  ON feature_flags FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed: SuperChat/WhatsApp messaging — OFF by default
INSERT INTO feature_flags (key, enabled, description)
VALUES ('superchat_enabled', false, 'WhatsApp-Nachrichten via SuperChat API senden. Wenn deaktiviert, werden Buchungen/Einladungen trotzdem erstellt, aber keine WhatsApp-Nachrichten versendet.')
ON CONFLICT (key) DO NOTHING;

-- Seed: SuperChat test phone — when enabled, ALL WhatsApp messages are redirected
-- to the phone number in the description field (e.g. +491234567890).
-- Use this for testing the flow without messaging real customers.
INSERT INTO feature_flags (key, enabled, description)
VALUES ('superchat_test_phone', false, '+491234567890')
ON CONFLICT (key) DO NOTHING;

-- Grant access
GRANT SELECT ON feature_flags TO anon;
GRANT SELECT, UPDATE ON feature_flags TO authenticated;
GRANT ALL ON feature_flags TO service_role;


-- ──────────────────────────────────────────────────────────────
-- Source: add-feedback-table.sql
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  type TEXT NOT NULL CHECK (type IN ('feature', 'bug', 'question')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'planned', 'in_progress', 'done', 'rejected')),
  admin_notes TEXT,
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
CREATE POLICY "service_all" ON feedback_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON feedback_requests FOR SELECT TO anon USING (true);


-- ──────────────────────────────────────────────────────────────
-- Source: add-feedback-context-columns.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Add right-click context columns to feedback_requests
-- These columns capture the exact location and environment context
-- when a user reports a bug or gives feedback via the right-click widget.

-- Click coordinates (where the user right-clicked)
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS click_x INTEGER;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS click_y INTEGER;

-- Page context
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS component TEXT;

-- Environment
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS viewport_width INTEGER;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS viewport_height INTEGER;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Extra context (filters, search terms, active tab, etc.)
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS context_data JSONB;

-- Update the type check constraint to include 'feedback' as a valid type
-- (the widget uses 'bug', 'feedback', 'feature' — existing table had 'feature', 'bug', 'question')
ALTER TABLE feedback_requests DROP CONSTRAINT IF EXISTS feedback_requests_type_check;
ALTER TABLE feedback_requests ADD CONSTRAINT feedback_requests_type_check
  CHECK (type IN ('feature', 'bug', 'question', 'feedback'));

-- Allow anon role to insert (the widget uses anon key)
CREATE POLICY IF NOT EXISTS "anon_insert" ON feedback_requests FOR INSERT TO anon WITH CHECK (true);
-- Allow anon role to update (for admin status changes via anon key)
CREATE POLICY IF NOT EXISTS "anon_update" ON feedback_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- Source: add-agent-memory.sql
-- ──────────────────────────────────────────────────────────────
-- Agent Memory Table
-- Persistent memory for the JET Data Assistant
-- Stores insights, decisions, preferences, context, and user-pinned notes

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

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_memory_active ON agent_memory(active, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_category ON agent_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_created ON agent_memory(created_at DESC);

-- Row Level Security
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

-- Policies: service_role can do everything, anon/authenticated can read
CREATE POLICY "anon_read" ON agent_memory FOR SELECT TO anon USING (true);
CREATE POLICY "auth_read" ON agent_memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON agent_memory FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- Source: add-api-usage-log.sql
-- ──────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════
-- API Usage Log — Track all external API calls from Netlify Functions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_usage_log (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Which function / service
  function_name TEXT NOT NULL,          -- e.g. 'chat-proxy', 'airtable-proxy', 'vistar-sync'
  service       TEXT NOT NULL,          -- e.g. 'anthropic', 'airtable', 'supabase', 'vistar', 'google-sheets', 'superchat'

  -- Request details
  method        TEXT,                   -- GET, POST, PATCH, DELETE, STREAM
  endpoint      TEXT,                   -- e.g. '/v1/messages', '/Stammdaten', '/report'

  -- Performance
  duration_ms   INTEGER,               -- Response time in ms
  status_code   INTEGER,               -- HTTP status code (200, 429, 500, etc.)
  success       BOOLEAN DEFAULT TRUE,

  -- Usage metrics
  tokens_in     INTEGER,               -- For LLM calls: input tokens
  tokens_out    INTEGER,               -- For LLM calls: output tokens
  records_count INTEGER,               -- For DB/API calls: number of records fetched/written
  bytes_transferred INTEGER,           -- Response size in bytes (approximate)

  -- Cost tracking (estimated)
  estimated_cost_cents NUMERIC(10,4),  -- Estimated cost in USD cents

  -- Context
  user_id       TEXT,                   -- Who triggered it (if known)
  error_message TEXT,                   -- Error details if failed
  metadata      JSONB                   -- Extra info (cache hit, batch number, etc.)
);

-- ── Indexes for fast queries ──
CREATE INDEX IF NOT EXISTS idx_api_usage_created     ON api_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_function    ON api_usage_log (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_service     ON api_usage_log (service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_success     ON api_usage_log (success, created_at DESC);

-- ── Auto-cleanup: remove entries older than 90 days (optional cron) ──
-- DELETE FROM api_usage_log WHERE created_at < NOW() - INTERVAL '90 days';

-- ── RLS: allow service role full access, authenticated users read-only ──
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON api_usage_log
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Allow authenticated users to read (for Admin panel)
CREATE POLICY "Authenticated users can read" ON api_usage_log
  FOR SELECT USING (auth.role() = 'authenticated');


-- ──────────────────────────────────────────────────────────────
-- Source: add-attachment-cache.sql
-- ──────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════
-- Attachment Cache Table
-- Stores permanent Supabase Storage URLs for Airtable attachments
-- (Airtable attachment URLs expire after ~2 hours)
-- ═══════════════════════════════════════════════

-- 1. Create the attachment_cache table
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

-- 2. Index for fast lookups by record + field
CREATE INDEX IF NOT EXISTS idx_attachment_cache_record_field
  ON attachment_cache (airtable_record_id, airtable_field);

-- 3. Index for lookups by table (useful for stats / cleanup)
CREATE INDEX IF NOT EXISTS idx_attachment_cache_table
  ON attachment_cache (airtable_table);

-- 4. Enable Row Level Security (but allow service role full access)
ALTER TABLE attachment_cache ENABLE ROW LEVEL SECURITY;

-- Policy: service role can do everything
CREATE POLICY "Service role full access" ON attachment_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Create the Storage bucket (run this via Supabase dashboard or API)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('attachments', 'attachments', true)
-- ON CONFLICT (id) DO NOTHING;

-- NOTE: You must create the 'attachments' bucket in Supabase Storage
-- via the dashboard (Storage > New Bucket > name: "attachments" > Public: ON).
-- The SQL above is commented out because storage.buckets may require
-- superuser privileges depending on your Supabase setup.


-- ──────────────────────────────────────────────────────────────
-- Source: create-attachment-sync-log.sql
-- ──────────────────────────────────────────────────────────────
-- =============================================
-- Attachment Sync Log Table
-- Tracks each attachment sync run for monitoring and debugging.
-- Also adds sync_metadata rows for per-table attachment sync tracking.
-- =============================================

CREATE TABLE IF NOT EXISTS attachment_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,                -- 'full', 'incremental', 'manual'
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'partial', 'error'
  tables_processed TEXT[],               -- e.g. {'acquisition', 'tasks', 'installationen'}
  records_synced INTEGER DEFAULT 0,      -- Files successfully uploaded
  attachments_found INTEGER DEFAULT 0,   -- Total attachments discovered
  already_cached INTEGER DEFAULT 0,      -- Skipped (already in cache)
  errors_count INTEGER DEFAULT 0,        -- Failed uploads
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  details JSONB,                         -- Per-table stats, remaining count, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent sync runs
CREATE INDEX IF NOT EXISTS idx_att_sync_log_created
  ON attachment_sync_log (created_at DESC);

-- Enable RLS (service role key has full access)
ALTER TABLE attachment_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on attachment_sync_log"
  ON attachment_sync_log FOR ALL
  USING (true) WITH CHECK (true);

-- =============================================
-- sync_metadata rows for attachment sync tracking
-- =============================================
INSERT INTO sync_metadata (table_name, last_sync_status) VALUES
  ('attachment_sync_acquisition', 'pending'),
  ('attachment_sync_tasks', 'pending'),
  ('attachment_sync_installationen', 'pending')
ON CONFLICT (table_name) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- Source: vistar-tables.sql
-- ──────────────────────────────────────────────────────────────
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


-- ──────────────────────────────────────────────────────────────
-- Source: add-hardware-tables.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- Hardware Inventory & Lifecycle Management Tables
-- Run this in the Supabase SQL Editor
-- ============================================================


-- === 1. OPS Player Inventory ===
CREATE TABLE IF NOT EXISTS hardware_ops (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  ops_nr TEXT,                            -- OPS Nummer (z.B. "239")
  status TEXT,                            -- active | defect | prep/warehouse | out for installation | test device
  ops_sn TEXT,                            -- Seriennummer (z.B. ISS088X255G0196)
  hardware_type TEXT,                     -- z.B. JWIPC_S088
  navori_venue_id TEXT,
  sim_record_id TEXT,                     -- Link zur SIM
  sim_id TEXT,                            -- SIM-ID (lookup)
  display_record_id TEXT,                 -- Link zum Display
  display_sn TEXT,                        -- Display SN (lookup)
  display_location_id TEXT,               -- Link zur Live Display Location
  location_online_status TEXT,            -- Online Status (lookup)
  partner_id TEXT,                        -- Link zum Partner/Warehouse
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_ops_status ON hardware_ops(status);
CREATE INDEX IF NOT EXISTS idx_hw_ops_nr ON hardware_ops(ops_nr);
CREATE INDEX IF NOT EXISTS idx_hw_ops_location ON hardware_ops(display_location_id);


-- === 2. SIM Card Inventory ===
CREATE TABLE IF NOT EXISTS hardware_sim (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  sim_id TEXT,                            -- ICCID Nummer
  activate_date DATE,
  ops_record_id TEXT,                     -- Link zum OPS Player
  status TEXT,                            -- active | defect | prep/warehouse
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_sim_id ON hardware_sim(sim_id);


-- === 3. Display Inventory ===
CREATE TABLE IF NOT EXISTS hardware_displays (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  display_serial_number TEXT,
  location TEXT,
  ops_record_id TEXT,                     -- Link zum OPS Player
  status TEXT,                            -- active | defect | prep/warehouse
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_display_sn ON hardware_displays(display_serial_number);


-- === 4. CHG Approval (Leasing aus Airtable) ===
CREATE TABLE IF NOT EXISTS chg_approvals (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  jet_id_location TEXT,
  asset_id TEXT,                          -- Bank Asset-ID
  display_sn TEXT,                        -- Display Seriennummer (Matching-Key!)
  integrator_invoice_no TEXT,
  chg_certificate TEXT,                   -- Installation certificate at the bank (CHG)
  invoice_date DATE,
  rental_start DATE,
  rental_end DATE,
  payment_released_on DATE,
  payment_released_by TEXT,
  status TEXT,                            -- Approved, etc.
  installation_id TEXT,                   -- Link zur Installation
  inspection_status TEXT[],               -- Lookup
  display_id TEXT[],                      -- Lookup DisplayID
  location_name TEXT[],
  city TEXT[],
  address TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chg_asset ON chg_approvals(asset_id);
CREATE INDEX IF NOT EXISTS idx_chg_display_sn ON chg_approvals(display_sn);
CREATE INDEX IF NOT EXISTS idx_chg_rental ON chg_approvals(rental_start, rental_end);


-- === 5. Bank Leasing (TESMA/CHG-MERIDIAN Export) ===
CREATE TABLE IF NOT EXISTS bank_leasing (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id TEXT UNIQUE,                   -- CHG Asset ID (Matching-Key!)
  serial_number TEXT,                     -- Display Seriennummer
  asset_class TEXT,
  designation TEXT,                       -- Produktbezeichnung (z.B. "55BDL4002H/00")
  contract_status TEXT,                   -- "In Miete" etc.
  customer TEXT,
  customer_id INTEGER,
  rental_certificate TEXT,                -- Mietschein-Nr
  rental_start DATE,
  rental_end_planned DATE,
  rental_end_actual DATE,
  monthly_price NUMERIC(8,2),
  currency TEXT DEFAULT 'EUR',
  order_number TEXT,                      -- Bestellnummer (can match JET ID)
  installation_location TEXT,             -- Standort-Name
  cost_center TEXT,                       -- Adresse (Straße)
  city TEXT,
  manufacturer TEXT,                      -- "Philips"
  lessor_id INTEGER,
  lessor TEXT,                            -- "CHG-MERIDIAN AG"
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_serial ON bank_leasing(serial_number);
CREATE INDEX IF NOT EXISTS idx_bank_asset ON bank_leasing(asset_id);
CREATE INDEX IF NOT EXISTS idx_bank_rental_cert ON bank_leasing(rental_certificate);


-- === 6. Hardware Swaps (Tausch-Auftraege) ===
CREATE TABLE IF NOT EXISTS hardware_swaps (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  swap_id TEXT,                           -- SWAP-2025-0001
  display_location_id TEXT,               -- Link zur Live Display Location
  swap_type TEXT[],                       -- OPS | Display | SIM | Komplett-Set
  swap_date DATE,
  swap_reason TEXT,                       -- Defekt | Upgrade | Kundenanfrage | Sonstiges
  partner_id TEXT,
  technician TEXT,
  old_hardware_ids TEXT[],                -- Links zu alten OPS/SIM/Display
  new_hardware_ids TEXT[],                -- Links zu neuen OPS/SIM/Display
  defect_description TEXT,
  status TEXT,                            -- Geplant | Abgeschlossen
  location_name TEXT,                     -- Lookup
  city TEXT,                              -- Lookup
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_location ON hardware_swaps(display_location_id);
CREATE INDEX IF NOT EXISTS idx_swap_status ON hardware_swaps(status);


-- === 7. Deinstallations-Auftraege ===
CREATE TABLE IF NOT EXISTS hardware_deinstalls (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  deinstall_id TEXT,                      -- DEINST-2025-0001
  display_location_id TEXT,
  ops_record_id TEXT,                     -- Link zum OPS/Hardware-Set
  deinstall_date DATE,
  reason TEXT,                            -- Kuendigung | Umbau | Vertragsende | Sonstiges
  partner_id TEXT,                        -- Ausfuehrender Partner = neues Warehouse
  technician TEXT,
  hardware_condition TEXT,                -- Einwandfrei | Beschaedigt | Defekt | Pruefung noetig
  condition_description TEXT,
  status TEXT,                            -- Geplant | In Bearbeitung | Abgeschlossen
  location_name TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deinstall_location ON hardware_deinstalls(display_location_id);
CREATE INDEX IF NOT EXISTS idx_deinstall_status ON hardware_deinstalls(status);


-- === RLS fuer alle neuen Tabellen ===
ALTER TABLE hardware_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_sim ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE chg_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_leasing ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_deinstalls ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "auth_read" ON hardware_ops FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_sim FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_displays FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON chg_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON bank_leasing FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_swaps FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_deinstalls FOR SELECT TO authenticated USING (true);

-- Service Role full access (for sync functions + bank import)
CREATE POLICY "service_all" ON hardware_ops FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_sim FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_displays FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON chg_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON bank_leasing FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_swaps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_deinstalls FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- Source: add-hardware-lifecycle.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- Hardware Lifecycle Extension Tables
-- Wareneingang → QR-Codes → Position-Tracking
-- Run this in the Supabase SQL Editor
-- ============================================================


-- === 1. Wareneingang (Goods Receipt) ===
-- Erfasst eingehende Hardware-Lieferungen mit Zustandsprüfung
CREATE TABLE IF NOT EXISTS goods_receipts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id      TEXT UNIQUE NOT NULL,             -- WE-2026-0001 (auto-generated)
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Lieferungs-Details
  supplier        TEXT,                             -- Lieferant (z.B. "Philips", "JWIPC", "1NCE")
  delivery_note   TEXT,                             -- Lieferschein-Nr
  order_reference TEXT,                             -- Bestellnummer / PO Number
  carrier         TEXT,                             -- Spediteur / Paketdienst

  -- Hardware-Zuordnung
  component_type  TEXT NOT NULL,                    -- 'ops' | 'display' | 'sim' | 'mount' | 'accessory'
  serial_number   TEXT,                             -- Seriennummer (falls vorhanden)
  hardware_id     TEXT,                             -- Link zu hardware_ops.id / hardware_displays.id / hardware_sim.id
  quantity        INTEGER DEFAULT 1,                -- Anzahl (für Bulk-Lieferungen)

  -- Zustandsprüfung
  condition       TEXT DEFAULT 'ok',                -- ok | damaged | defect | incomplete
  condition_notes TEXT,                             -- Beschreibung von Schäden etc.
  photo_urls      TEXT[],                           -- Fotos vom Wareneingang

  -- Empfänger
  received_by     TEXT,                             -- Wer hat angenommen
  warehouse       TEXT DEFAULT 'Hauptlager',        -- Ziellager

  -- QR-Code-Verknüpfung
  qr_code_id      BIGINT,                          -- Link zu hardware_qr_codes.id (nach Zuweisung)

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_id ON goods_receipts(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_date ON goods_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_type ON goods_receipts(component_type);
CREATE INDEX IF NOT EXISTS idx_receipt_sn ON goods_receipts(serial_number);
CREATE INDEX IF NOT EXISTS idx_receipt_hardware ON goods_receipts(hardware_id);

-- Sequence für receipt_id
CREATE SEQUENCE IF NOT EXISTS goods_receipt_seq START 1;


-- === 2. QR-Code Registry ===
-- Zentrale QR-Code-Verwaltung mit Bulk-Generierung
CREATE TABLE IF NOT EXISTS hardware_qr_codes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_code         TEXT UNIQUE NOT NULL,             -- Der QR-Code-Inhalt (z.B. "JET-HW-2026-00001")
  qr_prefix       TEXT DEFAULT 'JET-HW',            -- Prefix für Gruppierung
  batch_id        TEXT,                             -- Batch-ID für Bulk-Generierung (z.B. "BATCH-2026-02-15")

  -- Zuordnung
  component_type  TEXT,                             -- 'ops' | 'display' | 'sim' | 'mount' | 'set'
  hardware_id     TEXT,                             -- Link zu hardware_ops.id etc.
  serial_number   TEXT,                             -- Verknüpfte Seriennummer

  -- Status
  status          TEXT DEFAULT 'generated',          -- generated | assigned | printed | active | deactivated
  assigned_at     TIMESTAMPTZ,                      -- Wann zugewiesen
  assigned_by     TEXT,                             -- Wer zugewiesen

  -- Label-Druck
  label_printed   BOOLEAN DEFAULT FALSE,
  label_printed_at TIMESTAMPTZ,
  label_format    TEXT DEFAULT '62x29',             -- Label-Größe in mm

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_code ON hardware_qr_codes(qr_code);
CREATE INDEX IF NOT EXISTS idx_qr_batch ON hardware_qr_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_hardware ON hardware_qr_codes(hardware_id);
CREATE INDEX IF NOT EXISTS idx_qr_status ON hardware_qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_qr_sn ON hardware_qr_codes(serial_number);

-- Sequence für QR-Code-Nummern
CREATE SEQUENCE IF NOT EXISTS qr_code_seq START 1;


-- === 3. Hardware-Positionen (Position Tracking) ===
-- Lückenlose Nachverfolgung wo sich Hardware befindet
CREATE TABLE IF NOT EXISTS hardware_positions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Hardware-Referenz
  component_type      TEXT NOT NULL,                -- 'ops' | 'display' | 'sim' | 'mount' | 'set'
  hardware_id         TEXT NOT NULL,                -- Link zu hardware_ops.id etc.
  serial_number       TEXT,                         -- Seriennummer

  -- Position
  position            TEXT NOT NULL,                -- zulieferung | lager | versand | standort | ruecksendung | reparatur | entsorgung
  sub_position        TEXT,                         -- Konkreter Ort (z.B. "Regal A3", "Techniker Müller")

  -- Standort-Verknüpfung (wenn an Location installiert)
  display_location_id TEXT,                         -- FK → airtable_displays.id (wenn position = 'standort')
  location_name       TEXT,                         -- Standort-Name (denormalisiert für Anzeige)
  city                TEXT,                         -- Stadt (denormalisiert)

  -- Bewegung
  moved_from          TEXT,                         -- Vorherige Position
  moved_by            TEXT,                         -- Wer hat bewegt
  move_reason         TEXT,                         -- Grund: installation | swap | deinstall | repair | transfer | receipt
  reference_id        TEXT,                         -- Link zu Swap/Deinstall/Receipt ID

  -- Status
  is_current          BOOLEAN DEFAULT TRUE,         -- TRUE = aktuelle Position (FALSE = historisch)

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_hardware ON hardware_positions(hardware_id, is_current);
CREATE INDEX IF NOT EXISTS idx_pos_type ON hardware_positions(component_type);
CREATE INDEX IF NOT EXISTS idx_pos_position ON hardware_positions(position);
CREATE INDEX IF NOT EXISTS idx_pos_location ON hardware_positions(display_location_id);
CREATE INDEX IF NOT EXISTS idx_pos_current ON hardware_positions(is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_pos_created ON hardware_positions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sn ON hardware_positions(serial_number);


-- === RLS für alle neuen Tabellen ===
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_positions ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "auth_read" ON goods_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_positions FOR SELECT TO authenticated USING (true);

-- Write policies for authenticated users (Wareneingang + QR können vom Dashboard erstellt werden)
CREATE POLICY "auth_insert" ON goods_receipts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON hardware_qr_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON hardware_positions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update" ON goods_receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON hardware_qr_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON hardware_positions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Service Role full access (for sync functions)
CREATE POLICY "service_all" ON goods_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_qr_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_positions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === Anon read access (für Dashboard ohne Login) ===
CREATE POLICY "anon_read" ON goods_receipts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON hardware_qr_codes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON hardware_positions FOR SELECT TO anon USING (true);


-- === RPC: Nächste Receipt-ID generieren ===
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


-- === RPC: Nächsten QR-Code generieren ===
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


-- === RPC: Bulk QR-Codes generieren ===
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


-- === RPC: Hardware-Position aktualisieren ===
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
  -- Vorherige Position ermitteln
  SELECT position INTO old_position
  FROM hardware_positions
  WHERE hardware_id = p_hardware_id
    AND component_type = p_component_type
    AND is_current = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  -- Alte Position als nicht-aktuell markieren
  UPDATE hardware_positions
  SET is_current = FALSE
  WHERE hardware_id = p_hardware_id
    AND component_type = p_component_type
    AND is_current = TRUE;

  -- Neue Position einfügen
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


-- === View: Aktuelle Hardware-Positionen ===
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
  -- OPS Details (if ops)
  ho.ops_nr,
  ho.ops_sn,
  ho.hardware_type AS ops_type,
  ho.status AS ops_status,
  -- Display Details (if display)
  hd.display_serial_number,
  hd.status AS display_status,
  -- SIM Details (if sim)
  hs.sim_id,
  hs.status AS sim_status
FROM hardware_positions hp
LEFT JOIN hardware_ops ho ON hp.component_type = 'ops' AND hp.hardware_id = ho.id
LEFT JOIN hardware_displays hd ON hp.component_type = 'display' AND hp.hardware_id = hd.id
LEFT JOIN hardware_sim hs ON hp.component_type = 'sim' AND hp.hardware_id = hs.id
WHERE hp.is_current = TRUE;


-- ──────────────────────────────────────────────────────────────
-- Source: add-nocodb-tables.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- NocoDB Cache-Tabellen & Hardware-Enrichment
-- Cached NocoDB-Daten lokal in Supabase fuer schnelle Abfragen
-- und reichert hardware_ops mit Zusatzinformationen an.
-- Run this in the Supabase SQL Editor
-- ============================================================


-- ============================================================
-- 1. NOCODB_VORBEREITET
-- Verknuepft OPS, SIM, Venue und Kunden aus der NocoDB "Vorbereitet"-Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_vorbereitet (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,                   -- NocoDB Row-ID
  ops_nr          INTEGER,                          -- OPS-Nummer (Verknuepfung zu hardware_ops.ops_nr)
  venue_id        TEXT,                             -- Vistar Venue ID
  sim_id          TEXT,                             -- SIM ICCID
  kunden_nr       TEXT,                             -- Kunden-Nummer
  ops_sn          TEXT,                             -- OPS Seriennummer
  fertig          BOOLEAN DEFAULT FALSE,
  vorbereitet     BOOLEAN DEFAULT FALSE,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_ops_nr ON nocodb_vorbereitet(ops_nr);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_venue_id ON nocodb_vorbereitet(venue_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_sim_id ON nocodb_vorbereitet(sim_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_kunden_nr ON nocodb_vorbereitet(kunden_nr);


-- ============================================================
-- 2. NOCODB_VISTAR_NAVORI
-- Vistar-Navori Venue-Zuordnungen (Standort-Name, DO-ID, Kunden-ID)
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_vistar_navori (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,
  venue_id        TEXT,                             -- Vistar Venue ID (langer Hash)
  name            TEXT,                             -- Standort-Name
  kunden_id       TEXT,                             -- Kunden-ID
  do_id           TEXT,                             -- DO-ID (z.B. "DO-GER-BER-WD-55-003-25")
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_vn_venue_id ON nocodb_vistar_navori(venue_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vn_kunden_id ON nocodb_vistar_navori(kunden_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vn_do_id ON nocodb_vistar_navori(do_id);


-- ============================================================
-- 3. NOCODB_SIM_KUNDEN
-- SIM-Karten zu Kunden-Zuordnung (ICCID -> Kunden-ID)
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_sim_kunden (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,
  karten_nr       TEXT,                             -- SIM ICCID (z.B. "89882280000121940080")
  kunden_id       TEXT,                             -- Kunden-ID
  aktivierungsdatum DATE,                           -- Aktivierungsdatum
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_sk_karten_nr ON nocodb_sim_kunden(karten_nr);
CREATE INDEX IF NOT EXISTS idx_nocodb_sk_kunden_id ON nocodb_sim_kunden(kunden_id);


-- ============================================================
-- 4. NOCODB_LIEFERANDO
-- Lieferando Restaurant-/Standortdaten (Akquise, Rollout, Validierung)
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_lieferando (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,
  kunden_id       TEXT,                             -- Kunden-ID
  restaurant      TEXT,                             -- Restaurant-Name
  strasse         TEXT,
  hausnummer      TEXT,
  plz             TEXT,
  stadt           TEXT,
  ansprechpartner TEXT,
  telefon         TEXT,
  mail            TEXT,
  akquise_status  TEXT,
  standort_status TEXT,
  einreichdatum   DATE,
  rollout_info    TEXT,
  installationsart TEXT,
  validierungsstatus TEXT,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_lief_kunden_id ON nocodb_lieferando(kunden_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_lief_plz ON nocodb_lieferando(plz);
CREATE INDEX IF NOT EXISTS idx_nocodb_lief_stadt ON nocodb_lieferando(stadt);


-- ============================================================
-- 5. HARDWARE_OPS ENRICHMENT
-- Zusaetzliche Spalten fuer NocoDB-Anreicherung auf hardware_ops
-- ============================================================

ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS vistar_venue_id TEXT;
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS nocodb_kunden_nr TEXT;
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS nocodb_sim_id TEXT;
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS nocodb_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hw_ops_vistar_venue ON hardware_ops(vistar_venue_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- RLS aktivieren
ALTER TABLE nocodb_vorbereitet ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocodb_vistar_navori ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocodb_sim_kunden ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocodb_lieferando ENABLE ROW LEVEL SECURITY;

-- Lese-Zugriff fuer authentifizierte Benutzer
CREATE POLICY "auth_read" ON nocodb_vorbereitet FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON nocodb_vistar_navori FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON nocodb_sim_kunden FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON nocodb_lieferando FOR SELECT TO authenticated USING (true);

-- Schreib-Zugriff fuer authentifizierte Benutzer (Dashboard-Korrekturen)
CREATE POLICY "auth_insert" ON nocodb_vorbereitet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON nocodb_vistar_navori FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON nocodb_sim_kunden FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON nocodb_lieferando FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update" ON nocodb_vorbereitet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_vistar_navori FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_sim_kunden FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_lieferando FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Anon Lese-Zugriff (Dashboard ohne Login)
CREATE POLICY "anon_read" ON nocodb_vorbereitet FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON nocodb_vistar_navori FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON nocodb_sim_kunden FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON nocodb_lieferando FOR SELECT TO anon USING (true);

-- Service-Role Vollzugriff (fuer Sync-Funktionen)
CREATE POLICY "service_all" ON nocodb_vorbereitet FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON nocodb_vistar_navori FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON nocodb_sim_kunden FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON nocodb_lieferando FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- VIEW: NOCODB_HARDWARE_ENRICHED
-- Zusammenfuehrung von NocoDB-Vorbereitet mit Hardware-OPS,
-- Vistar-Navori Venues, SIM-Kunden und Lieferando-Standortdaten
-- ============================================================

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


-- ============================================================
-- SYNC METADATA
-- Eintraege fuer NocoDB-Sync-Tracking in sync_metadata
-- ============================================================

INSERT INTO sync_metadata (table_name, last_sync_status) VALUES
  ('nocodb_vorbereitet', 'pending'),
  ('nocodb_vistar_navori', 'pending'),
  ('nocodb_sim_kunden', 'pending'),
  ('nocodb_lieferando', 'pending')
ON CONFLICT (table_name) DO NOTHING;


-- ============================================================
-- TRIGGER: Auto-Update synced_at bei Aenderungen
-- ============================================================

-- Reusable Trigger-Funktion (erstellt nur falls noch nicht vorhanden)
CREATE OR REPLACE FUNCTION update_synced_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.synced_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nocodb_vorbereitet_synced_at
  BEFORE UPDATE ON nocodb_vorbereitet
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();

CREATE TRIGGER trg_nocodb_vistar_navori_synced_at
  BEFORE UPDATE ON nocodb_vistar_navori
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();

CREATE TRIGGER trg_nocodb_sim_kunden_synced_at
  BEFORE UPDATE ON nocodb_sim_kunden
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();

CREATE TRIGGER trg_nocodb_lieferando_synced_at
  BEFORE UPDATE ON nocodb_lieferando
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();


-- ──────────────────────────────────────────────────────────────
-- Source: add-phone-call-logs.sql
-- ──────────────────────────────────────────────────────────────
-- =============================================
-- Phone Call Logs + Wiedervorlage (Callback Scheduling)
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add callback_date to install_bookings
ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS callback_date DATE,
  ADD COLUMN IF NOT EXISTS callback_reason TEXT;

-- 2. Create phone_call_logs table for full call history
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

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_booking ON phone_call_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_called_at ON phone_call_logs(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_callback ON phone_call_logs(callback_date) WHERE callback_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_install_bookings_callback ON install_bookings(callback_date) WHERE callback_date IS NOT NULL;

-- 3. Enable RLS
ALTER TABLE phone_call_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write
CREATE POLICY "Allow all for authenticated users" ON phone_call_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon access (for Netlify Functions with service role key)
CREATE POLICY "Allow all for anon" ON phone_call_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────
-- Source: create-booking-activity-log.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Create booking_activity_log table
-- Date: 2026-02-20
-- Purpose: Central event log for ALL booking-related activities
--          (invites, calls, bookings, reminders, status changes)
--          Required for Team Analytics Dashboard

-- ═══ Table ═══
CREATE TABLE IF NOT EXISTS booking_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Actor (who performed the action)
  user_id   UUID REFERENCES app_users(id),
  user_name TEXT NOT NULL,

  -- Event type
  action TEXT NOT NULL CHECK (action IN (
    'invite_sent',              -- WhatsApp-Einladung gesendet
    'reminder_sent',            -- Erinnerung gesendet (automatisch)
    'phone_call',               -- Telefonat gefuehrt
    'booking_created',          -- Buchung manuell erstellt (Telefon/Portal)
    'booking_confirmed',        -- Buchung bestaetigt (Kunde hat gewaehlt)
    'booking_cancelled',        -- Buchung storniert
    'booking_completed',        -- Installation abgeschlossen
    'booking_rescheduled',      -- Termin verschoben
    'status_changed',           -- Status manuell geaendert
    'airtable_termin_created'   -- Termin in Airtable erstellt (via Sync erkannt)
  )),

  -- Context
  booking_id          UUID REFERENCES install_bookings(id) ON DELETE SET NULL,
  akquise_airtable_id TEXT,
  location_name       TEXT,
  city                TEXT,

  -- Flexible payload for action-specific data
  -- Examples:
  --   invite_sent:            { "channel": "whatsapp", "template": "InstallDate2" }
  --   phone_call:             { "outcome": "booked", "notes": "..." }
  --   booking_confirmed:      { "date": "2026-03-15", "time": "10:00", "source": "self_booking" }
  --   airtable_termin_created: { "created_by_airtable": "Max Simon", "terminstatus": "Geplant" }
  --   status_changed:         { "old_status": "pending", "new_status": "cancelled" }
  detail JSONB DEFAULT '{}',

  -- Origin of the action
  source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN (
    'portal',       -- Ueber das JET-Dashboard
    'bot',          -- KI-Chat-Agent / WhatsApp-Bot
    'airtable',     -- Direkt in Airtable erstellt
    'self_booking'  -- Kunde hat selbst gebucht (ueber Booking-Link)
  )),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ═══ Performance Indices ═══
CREATE INDEX IF NOT EXISTS idx_bal_user_id    ON booking_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bal_action     ON booking_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_bal_source     ON booking_activity_log(source);
CREATE INDEX IF NOT EXISTS idx_bal_created_at ON booking_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bal_city       ON booking_activity_log(city);

-- ═══ RLS (same pattern as phone_call_logs) ═══
ALTER TABLE booking_activity_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users (frontend via Supabase Anon Key with JWT)
CREATE POLICY "Allow all for authenticated users" ON booking_activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon role (Netlify Functions via Service Role Key bypass RLS anyway,
-- but this ensures direct Supabase client writes from scheduling app work)
CREATE POLICY "Allow all for anon" ON booking_activity_log
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ──────────────────────────────────────────────────────────────
-- Source: add-warehouse-management.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- Warenwirtschaft (Warehouse Management) Extension Tables
-- Bestellungen -> Versand -> Retouren -> Lager -> Alerts
-- Run this in the Supabase SQL Editor
-- ============================================================


-- ============================================================
-- SEQUENCES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS shipping_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS return_order_seq START 1;


-- ============================================================
-- 1. PURCHASE ORDERS (Bestellungen)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number           TEXT UNIQUE NOT NULL,               -- PO-2026-0042 (auto-generated)
  order_date          DATE DEFAULT CURRENT_DATE,
  expected_delivery   DATE,
  supplier            TEXT NOT NULL,                       -- Lieferant (z.B. "JWIPC", "Philips", "1NCE")
  supplier_contact    TEXT,                                -- Ansprechpartner beim Lieferanten
  supplier_reference  TEXT,                                -- Lieferanten-Bestellbestaetigung
  notes               TEXT,
  status              TEXT DEFAULT 'entwurf',              -- entwurf | bestellt | teilgeliefert | vollstaendig | storniert
  total_items         INTEGER DEFAULT 0,
  received_items      INTEGER DEFAULT 0,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_expected_delivery ON purchase_orders(expected_delivery);
CREATE INDEX IF NOT EXISTS idx_po_created_at ON purchase_orders(created_at DESC);


-- ============================================================
-- 2. PURCHASE ORDER ITEMS (Bestellpositionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id               BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_number         INTEGER,                             -- Position 1, 2, 3...
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  description         TEXT,                                -- z.B. "JWIPC S088 OPS Player"
  quantity            INTEGER NOT NULL,
  unit_price          NUMERIC(10,2),
  received_quantity   INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'offen',                -- offen | teilgeliefert | vollstaendig
  serial_numbers      TEXT[],                              -- Assigned serial numbers after receipt
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_poi_component_type ON purchase_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_poi_status ON purchase_order_items(status);


-- ============================================================
-- 3. WAREHOUSE LOCATIONS (Lagerplaetze)
-- ============================================================

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  warehouse           TEXT NOT NULL DEFAULT 'Hauptlager',  -- Lager-Name
  zone                TEXT,                                -- z.B. "A", "B", "Defekt"
  shelf               TEXT,                                -- z.B. "A3", "B1"
  name                TEXT NOT NULL,                       -- Human-readable: "Regal A3 - OPS Neu"
  capacity            INTEGER,                             -- Max items
  current_count       INTEGER DEFAULT 0,
  location_type       TEXT,                                -- ops | display | sim | mixed | defect | repair
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wl_warehouse ON warehouse_locations(warehouse);
CREATE INDEX IF NOT EXISTS idx_wl_zone ON warehouse_locations(zone);
CREATE INDEX IF NOT EXISTS idx_wl_location_type ON warehouse_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_wl_active ON warehouse_locations(active) WHERE active = TRUE;


-- ============================================================
-- 4. SHIPPING ORDERS (Versandauftraege)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_orders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipping_id         TEXT UNIQUE NOT NULL,                -- VS-2026-0123 (auto-generated)
  order_date          DATE DEFAULT CURRENT_DATE,
  destination_type    TEXT,                                -- installation | partner | warehouse | return
  destination_id      TEXT,                                -- FK to installation/partner/warehouse
  destination_name    TEXT,                                -- Denormalisiert fuer Anzeige
  destination_address TEXT,
  carrier             TEXT,                                -- DHL, UPS, Spediteur, Selbstabholung
  tracking_number     TEXT,
  packaging_type      TEXT,                                -- Paket, Palette, Express
  notes               TEXT,
  status              TEXT DEFAULT 'kommissioniert',       -- kommissioniert | verpackt | versendet | zugestellt | problem
  shipped_at          TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_shipping_id ON shipping_orders(shipping_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON shipping_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_order_date ON shipping_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_so_destination_type ON shipping_orders(destination_type);
CREATE INDEX IF NOT EXISTS idx_so_destination_id ON shipping_orders(destination_id);
CREATE INDEX IF NOT EXISTS idx_so_carrier ON shipping_orders(carrier);
CREATE INDEX IF NOT EXISTS idx_so_tracking ON shipping_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_so_created_at ON shipping_orders(created_at DESC);


-- ============================================================
-- 5. SHIPPING ORDER ITEMS (Versand-Positionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_order_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipping_order_id   BIGINT NOT NULL REFERENCES shipping_orders(id) ON DELETE CASCADE,
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  hardware_id         TEXT,                                -- Link zu hardware_ops.id etc.
  serial_number       TEXT,
  qr_code             TEXT,
  picked              BOOLEAN DEFAULT FALSE,               -- Aus Lager kommissioniert
  picked_at           TIMESTAMPTZ,
  picked_by           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soi_shipping_order_id ON shipping_order_items(shipping_order_id);
CREATE INDEX IF NOT EXISTS idx_soi_component_type ON shipping_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_soi_hardware_id ON shipping_order_items(hardware_id);
CREATE INDEX IF NOT EXISTS idx_soi_serial_number ON shipping_order_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_soi_qr_code ON shipping_order_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_soi_picked ON shipping_order_items(picked);


-- ============================================================
-- 6. RETURN ORDERS (Ruecksendungen / RMA)
-- ============================================================

CREATE TABLE IF NOT EXISTS return_orders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id           TEXT UNIQUE NOT NULL,                -- RMA-2026-0001
  return_date         DATE DEFAULT CURRENT_DATE,
  source_type         TEXT,                                -- standort | partner | techniker
  source_id           TEXT,
  source_name         TEXT,                                -- Denormalisiert fuer Anzeige
  reason              TEXT,                                -- defekt | tausch | vertragsende | upgrade | sonstiges
  reference_id        TEXT,                                -- Link zu swap/deinstall
  carrier             TEXT,
  tracking_number     TEXT,
  status              TEXT DEFAULT 'erwartet',             -- erwartet | eingegangen | geprueft | entschieden
  inspection_result   TEXT,                                -- reparierbar | schrott | wie_neu | refurbished
  inspection_notes    TEXT,
  decision            TEXT,                                -- lager | reparatur | entsorgung | lieferant
  decided_at          TIMESTAMPTZ,
  decided_by          TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
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


-- ============================================================
-- 7. RETURN ORDER ITEMS (Ruecksendungs-Positionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS return_order_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_order_id     BIGINT NOT NULL REFERENCES return_orders(id) ON DELETE CASCADE,
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  hardware_id         TEXT,
  serial_number       TEXT,
  qr_code             TEXT,
  condition           TEXT DEFAULT 'ungeprueft',           -- ungeprueft | ok | beschaedigt | defekt
  condition_notes     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roi_return_order_id ON return_order_items(return_order_id);
CREATE INDEX IF NOT EXISTS idx_roi_component_type ON return_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_roi_hardware_id ON return_order_items(hardware_id);
CREATE INDEX IF NOT EXISTS idx_roi_serial_number ON return_order_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_roi_qr_code ON return_order_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_roi_condition ON return_order_items(condition);


-- ============================================================
-- 8. STOCK ALERTS (Mindestbestand-Warnungen)
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_alerts (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  warehouse           TEXT DEFAULT 'Hauptlager',
  min_stock           INTEGER DEFAULT 5,
  current_stock       INTEGER DEFAULT 0,
  alert_active        BOOLEAN DEFAULT TRUE,
  last_alerted_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_component_type ON stock_alerts(component_type);
CREATE INDEX IF NOT EXISTS idx_sa_warehouse ON stock_alerts(warehouse);
CREATE INDEX IF NOT EXISTS idx_sa_alert_active ON stock_alerts(alert_active) WHERE alert_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_type_warehouse ON stock_alerts(component_type, warehouse);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "auth_read" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON warehouse_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON shipping_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON shipping_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON return_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON return_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON stock_alerts FOR SELECT TO authenticated USING (true);

-- Insert policies for authenticated users
CREATE POLICY "auth_insert" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON warehouse_locations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON shipping_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON shipping_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON return_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON return_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON stock_alerts FOR INSERT TO authenticated WITH CHECK (true);

-- Update policies for authenticated users
CREATE POLICY "auth_update" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON warehouse_locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON shipping_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON shipping_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON return_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON return_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON stock_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Anon read access (for dashboard without login)
CREATE POLICY "anon_read" ON purchase_orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON purchase_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON warehouse_locations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON shipping_orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON shipping_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON return_orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON return_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON stock_alerts FOR SELECT TO anon USING (true);

-- Service role full access (for sync functions + API)
CREATE POLICY "service_all" ON purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON purchase_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON warehouse_locations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON shipping_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON shipping_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON return_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON return_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON stock_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- RPC FUNCTIONS
-- ============================================================


-- === RPC: Naechste PO-Nummer generieren ===
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('purchase_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'PO-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Naechste Versand-ID generieren ===
CREATE OR REPLACE FUNCTION generate_shipping_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('shipping_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'VS-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Naechste Return-ID generieren ===
CREATE OR REPLACE FUNCTION generate_return_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('return_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'RMA-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Lagerbestand-Zusammenfassung ===
-- Returns aggregated stock counts per component_type and warehouse
-- Counts from hardware_positions WHERE is_current = true AND position = 'lager'
CREATE OR REPLACE FUNCTION get_stock_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- Stock counts from current lager positions
  lager_counts AS (
    SELECT
      component_type,
      COALESCE(sub_position, 'Hauptlager') AS warehouse,
      COUNT(*) AS count,
      -- Group by sub_position for warehouse zone breakdown
      array_agg(DISTINCT serial_number) FILTER (WHERE serial_number IS NOT NULL) AS serial_numbers
    FROM hardware_positions
    WHERE is_current = TRUE
      AND position = 'lager'
    GROUP BY component_type, COALESCE(sub_position, 'Hauptlager')
  ),

  -- Total per component type (across all warehouses)
  type_totals AS (
    SELECT
      component_type,
      SUM(count)::INTEGER AS total_count
    FROM lager_counts
    GROUP BY component_type
  ),

  -- Grand total
  grand_total AS (
    SELECT COALESCE(SUM(count), 0)::INTEGER AS total
    FROM lager_counts
  ),

  -- Stock alerts that are currently triggered
  triggered_alerts AS (
    SELECT json_agg(
      json_build_object(
        'component_type', sa.component_type,
        'warehouse', sa.warehouse,
        'min_stock', sa.min_stock,
        'current_stock', COALESCE(lc.count, 0),
        'deficit', sa.min_stock - COALESCE(lc.count, 0)
      )
    ) AS alerts
    FROM stock_alerts sa
    LEFT JOIN lager_counts lc
      ON lc.component_type = sa.component_type
      AND lc.warehouse = sa.warehouse
    WHERE sa.alert_active = TRUE
      AND COALESCE(lc.count, 0) < sa.min_stock
  ),

  -- Breakdown per warehouse and type
  warehouse_breakdown AS (
    SELECT json_agg(
      json_build_object(
        'component_type', component_type,
        'warehouse', warehouse,
        'count', count
      )
    ) AS breakdown
    FROM lager_counts
  ),

  -- Type summary
  type_summary AS (
    SELECT json_object_agg(
      component_type, total_count
    ) AS by_type
    FROM type_totals
  )

  SELECT json_build_object(
    'totalStock', gt.total,
    'byType', COALESCE(ts.by_type, '{}'::json),
    'breakdown', COALESCE(wb.breakdown, '[]'::json),
    'alerts', COALESCE(ta.alerts, '[]'::json),
    'computedAt', NOW()
  ) INTO result
  FROM grand_total gt
  CROSS JOIN type_summary ts
  CROSS JOIN warehouse_breakdown wb
  CROSS JOIN triggered_alerts ta;

  RETURN result;
END;
$$;


-- === RPC: Kommissionierung (Pick for Shipping) ===
-- Marks an item as picked from warehouse and updates hardware position
CREATE OR REPLACE FUNCTION pick_for_shipping(
  p_shipping_order_id BIGINT,
  p_serial_number TEXT,
  p_picked_by TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id BIGINT;
  v_component_type TEXT;
  v_hardware_id TEXT;
  v_position_id BIGINT;
BEGIN
  -- Find the shipping order item by serial number
  SELECT soi.id, soi.component_type, soi.hardware_id
  INTO v_item_id, v_component_type, v_hardware_id
  FROM shipping_order_items soi
  WHERE soi.shipping_order_id = p_shipping_order_id
    AND soi.serial_number = p_serial_number
    AND soi.picked = FALSE
  LIMIT 1;

  -- Check if item was found
  IF v_item_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Item not found or already picked: ' || p_serial_number
    );
  END IF;

  -- Mark shipping order item as picked
  UPDATE shipping_order_items
  SET
    picked = TRUE,
    picked_at = NOW(),
    picked_by = p_picked_by
  WHERE id = v_item_id;

  -- Update hardware position from 'lager' to 'versand' using existing RPC
  IF v_hardware_id IS NOT NULL THEN
    SELECT update_hardware_position(
      p_component_type := v_component_type,
      p_hardware_id := v_hardware_id,
      p_serial_number := p_serial_number,
      p_position := 'versand',
      p_sub_position := 'Versandauftrag ' || (
        SELECT shipping_id FROM shipping_orders WHERE id = p_shipping_order_id
      ),
      p_moved_by := p_picked_by,
      p_move_reason := 'shipping',
      p_reference_id := (
        SELECT shipping_id FROM shipping_orders WHERE id = p_shipping_order_id
      )
    ) INTO v_position_id;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'item_id', v_item_id,
    'position_id', v_position_id,
    'serial_number', p_serial_number,
    'picked_by', p_picked_by,
    'picked_at', NOW()
  );
END;
$$;


-- === RPC: Receive Purchase Order Items (Wareneingang fuer Bestellung) ===
-- Convenience function to receive items against a PO and update counts
CREATE OR REPLACE FUNCTION receive_po_item(
  p_po_id BIGINT,
  p_item_id BIGINT,
  p_quantity INTEGER,
  p_serial_numbers TEXT[] DEFAULT NULL,
  p_received_by TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_new_received INTEGER;
  v_item_status TEXT;
  v_po_total INTEGER;
  v_po_received INTEGER;
  v_po_status TEXT;
BEGIN
  -- Get current item state
  SELECT * INTO v_item
  FROM purchase_order_items
  WHERE id = p_item_id AND po_id = p_po_id;

  IF v_item IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Item not found');
  END IF;

  -- Calculate new received quantity
  v_new_received := v_item.received_quantity + p_quantity;

  -- Determine item status
  IF v_new_received >= v_item.quantity THEN
    v_item_status := 'vollstaendig';
    v_new_received := v_item.quantity; -- Cap at ordered quantity
  ELSE
    v_item_status := 'teilgeliefert';
  END IF;

  -- Update item
  UPDATE purchase_order_items
  SET
    received_quantity = v_new_received,
    status = v_item_status,
    serial_numbers = COALESCE(serial_numbers, '{}') || COALESCE(p_serial_numbers, '{}')
  WHERE id = p_item_id;

  -- Recalculate PO totals
  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(received_quantity), 0)
  INTO v_po_total, v_po_received
  FROM purchase_order_items
  WHERE po_id = p_po_id;

  -- Determine PO status
  IF v_po_received >= v_po_total THEN
    v_po_status := 'vollstaendig';
  ELSIF v_po_received > 0 THEN
    v_po_status := 'teilgeliefert';
  ELSE
    v_po_status := 'bestellt';
  END IF;

  -- Update PO
  UPDATE purchase_orders
  SET
    total_items = v_po_total,
    received_items = v_po_received,
    status = v_po_status,
    updated_at = NOW()
  WHERE id = p_po_id;

  RETURN json_build_object(
    'success', TRUE,
    'item_id', p_item_id,
    'received_quantity', v_new_received,
    'item_status', v_item_status,
    'po_total_items', v_po_total,
    'po_received_items', v_po_received,
    'po_status', v_po_status
  );
END;
$$;


-- ============================================================
-- VIEWS
-- ============================================================


-- === View: Lagerbestand-Uebersicht ===
-- Aggregates current lager positions by component_type with counts
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


-- === View: Purchase Orders mit Item-Counts ===
CREATE OR REPLACE VIEW purchase_orders_overview AS
SELECT
  po.id,
  po.po_number,
  po.order_date,
  po.expected_delivery,
  po.supplier,
  po.supplier_reference,
  po.status,
  po.total_items,
  po.received_items,
  po.created_by,
  po.created_at,
  po.updated_at,
  COUNT(poi.id) AS line_count,
  COALESCE(SUM(poi.quantity), 0)::INTEGER AS total_quantity,
  COALESCE(SUM(poi.received_quantity), 0)::INTEGER AS total_received,
  COALESCE(SUM(poi.quantity * poi.unit_price), 0)::NUMERIC(12,2) AS total_value,
  -- Delivery status
  CASE
    WHEN po.expected_delivery IS NULL THEN 'kein_termin'
    WHEN po.expected_delivery < CURRENT_DATE AND po.status NOT IN ('vollstaendig', 'storniert') THEN 'ueberfaellig'
    WHEN po.expected_delivery <= CURRENT_DATE + INTERVAL '3 days' AND po.status NOT IN ('vollstaendig', 'storniert') THEN 'bald_faellig'
    ELSE 'im_plan'
  END AS delivery_status
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
GROUP BY po.id;


-- === View: Shipping Orders mit Item-Counts ===
CREATE OR REPLACE VIEW shipping_orders_overview AS
SELECT
  so.id,
  so.shipping_id,
  so.order_date,
  so.destination_type,
  so.destination_name,
  so.destination_address,
  so.carrier,
  so.tracking_number,
  so.packaging_type,
  so.status,
  so.shipped_at,
  so.delivered_at,
  so.created_by,
  so.created_at,
  COUNT(soi.id) AS item_count,
  COUNT(soi.id) FILTER (WHERE soi.picked = TRUE) AS picked_count,
  -- All items picked?
  CASE
    WHEN COUNT(soi.id) = 0 THEN FALSE
    ELSE COUNT(soi.id) = COUNT(soi.id) FILTER (WHERE soi.picked = TRUE)
  END AS fully_picked
FROM shipping_orders so
LEFT JOIN shipping_order_items soi ON soi.shipping_order_id = so.id
GROUP BY so.id;


-- === View: Return Orders mit Item-Counts ===
CREATE OR REPLACE VIEW return_orders_overview AS
SELECT
  ro.id,
  ro.return_id,
  ro.return_date,
  ro.source_type,
  ro.source_name,
  ro.reason,
  ro.reference_id,
  ro.carrier,
  ro.tracking_number,
  ro.status,
  ro.inspection_result,
  ro.decision,
  ro.decided_at,
  ro.decided_by,
  ro.created_by,
  ro.created_at,
  COUNT(roi.id) AS item_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'ok') AS ok_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'beschaedigt') AS damaged_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'defekt') AS defect_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'ungeprueft') AS unchecked_count
FROM return_orders ro
LEFT JOIN return_order_items roi ON roi.return_order_id = ro.id
GROUP BY ro.id;


-- ============================================================
-- TRIGGER: Auto-update updated_at on modification
-- ============================================================

-- Reusable trigger function (create only if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_shipping_orders_updated_at
  BEFORE UPDATE ON shipping_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_return_orders_updated_at
  BEFORE UPDATE ON return_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_stock_alerts_updated_at
  BEFORE UPDATE ON stock_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- GRANT EXECUTE on RPC functions
-- ============================================================

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


-- ──────────────────────────────────────────────────────────────
-- Source: create-akquise-automation.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- Akquise Automation: 4 Tabellen + Feature Flags
-- Für WhatsApp KI-Akquise (SuperChat + Anthropic)
-- ============================================================

-- 1. Kampagnen
CREATE TABLE IF NOT EXISTS akquise_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, active, paused, completed
  target_filter JSONB DEFAULT '{}',      -- { cities: [], lead_statuses: ['New Lead'] }
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

-- 2. Gespräche (State Machine)
CREATE TABLE IF NOT EXISTS akquise_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES akquise_campaigns(id),
  akquise_airtable_id TEXT NOT NULL,

  -- Kontakt (denormalisiert)
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  location_name TEXT,
  city TEXT,
  jet_id TEXT,

  -- SuperChat Referenzen
  superchat_contact_id TEXT,
  superchat_conversation_id TEXT,

  -- State Machine
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending → template_sent → in_conversation → interested → qualified → convinced → signed
  -- Alternativ: → disqualified / declined / unresponsive / error

  -- Zeitpunkte
  template_sent_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ,       -- 24h ab first_response
  signature_sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,

  -- Signatur
  signature_token TEXT UNIQUE,
  signature_data JSONB,                 -- { image_base64, signed_at, ip_address }

  -- KI-Tracking
  ai_message_count INT DEFAULT 0,
  total_message_count INT DEFAULT 0,
  ai_sentiment TEXT,                    -- positive, neutral, negative, objection
  ai_last_summary TEXT,

  -- Follow-Up
  follow_up_count INT DEFAULT 0,
  next_follow_up_at TIMESTAMPTZ,

  -- Meta
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

-- 3. Nachrichten
CREATE TABLE IF NOT EXISTS akquise_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES akquise_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,               -- outbound / inbound
  sender TEXT NOT NULL,                  -- bot, ai, user, prospect, system
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',      -- text, template, image, system
  superchat_message_id TEXT,
  template_id TEXT,
  ai_model TEXT,
  ai_tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_msg_conv ON akquise_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_akquise_msg_created ON akquise_messages(created_at);
ALTER TABLE akquise_messages ENABLE ROW LEVEL SECURITY;

-- 4. Activity Log
CREATE TABLE IF NOT EXISTS akquise_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT DEFAULT 'KI-Bot',
  action TEXT NOT NULL,
  conversation_id UUID REFERENCES akquise_conversations(id),
  akquise_airtable_id TEXT,
  location_name TEXT,
  city TEXT,
  detail JSONB DEFAULT '{}',
  source TEXT DEFAULT 'automation',      -- automation, manual, webhook
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_log_action ON akquise_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_akquise_log_created ON akquise_activity_log(created_at DESC);
ALTER TABLE akquise_activity_log ENABLE ROW LEVEL SECURITY;

-- 5. Feature Flags
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('akquise_automation_enabled', false, 'Master-Switch: KI-Akquise Automation aktivieren'),
  ('akquise_ai_bot_enabled', false, 'KI-Bot Auto-Antworten auf eingehende WhatsApp-Nachrichten'),
  ('akquise_test_phone', false, '+491234567890'),
  ('akquise_max_daily_sends', true, '50')
ON CONFLICT (key) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- Source: add-install-verification.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Post-Install Verification & Freigabe-Automatisierung
-- Date: 2026-02-25
-- Purpose: Adds Freigabe columns to installationen + verification log table

-- ═══ Part 1: Add Freigabe columns to installationen ═══

ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_online_rate BOOLEAN DEFAULT false;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_installation_vorort BOOLEAN DEFAULT false;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_chg BOOLEAN DEFAULT false;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_datum_chg DATE;

-- Index for verification queries (find un-verified installations)
CREATE INDEX IF NOT EXISTS idx_installationen_freigabe_pending
  ON installationen (install_date)
  WHERE freigabe_online_rate = false AND status = 'Installiert';

-- ═══ Part 2: Verification log table ═══

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

-- Unique constraint: one check per installation per check_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_ivl_unique_check
  ON install_verification_log(installation_airtable_id, check_type);

CREATE INDEX IF NOT EXISTS idx_ivl_check_date
  ON install_verification_log(check_date DESC);

-- ═══ Part 3: RLS ═══

ALTER TABLE install_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON install_verification_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON install_verification_log
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ═══ Part 4: Feature flag ═══

INSERT INTO feature_flags (key, enabled, description)
VALUES (
  'install_verification_enabled',
  false,
  'Automatische 3/10-Tage Online-Rate-Pruefung nach Installation. Prueft ob Display min. 80% online ist (6-24 Uhr). Laeuft alle 6 Stunden.'
)
ON CONFLICT (key) DO NOTHING;

-- ═══ Part 5: Grants ═══

GRANT SELECT, INSERT, UPDATE ON install_verification_log TO anon;
GRANT SELECT, INSERT, UPDATE ON install_verification_log TO authenticated;
GRANT ALL ON install_verification_log TO service_role;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ──────────────────────────────────────────────────────────────
-- Source: add-reminder-tracking.sql
-- ──────────────────────────────────────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Add reminder tracking columns to install_bookings
-- Tracks when reminders were sent and how many
-- ══════════════════════════════════════════════════════════════

ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS reminder_count INT DEFAULT 0;

-- Index for efficient querying of pending bookings that need reminders
CREATE INDEX IF NOT EXISTS idx_install_bookings_reminder_pending
  ON install_bookings (status, created_at)
  WHERE status = 'pending' AND reminder_count = 0;


-- ──────────────────────────────────────────────────────────────
-- Source: add-vollzugriff-group-and-users.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- Vollzugriff-Gruppe (alles außer Admin)
-- + 3 neue User: Uestuen, Hasenberg, Demir
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create "Vollzugriff" group with all tabs/actions EXCEPT admin
INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_vollzugriff',
  'Vollzugriff',
  'Voller Zugriff auf alle Bereiche außer Admin-Verwaltung',
  '#6366f1',
  'Shield',
  ARRAY[
    'displays', 'displays.overview', 'displays.list', 'displays.cities',
    'hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes',
    'hardware.positionen', 'hardware.bestellwesen', 'hardware.lager-versand', 'hardware.tracking',
    'tasks', 'communication',
    'installations', 'installations.calendar', 'installations.bookings'
  ],
  ARRAY[
    'view', 'export', 'view_contacts', 'view_revenue',
    'create_task', 'edit_task', 'delete_task',
    'send_message', 'view_messages',
    'manage_schedule', 'manage_bookings', 'send_booking_invite',
    'manage_hardware', 'manage_warehouse', 'manage_qr'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions;

-- 2. Create Supabase Auth users + app_users entries
-- NOTE: User creation via Supabase Auth API must be done via the Dashboard API.
-- After running this SQL, create users via Admin Panel or API:
--   POST /api/users/add { name, email, groupId: 'grp_vollzugriff', password: '***REMOVED_DEFAULT_PW***' }
--
-- Users to create:
--   1. Uestuen  → Uestuen@e-systems.org
--   2. Hasenberg → Hasenberg@e-systems.org
--   3. Demir → demir@e-systems.org


-- ──────────────────────────────────────────────────────────────
-- Source: add-faw-pruefer-group.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Add FAW Prüfer group + grant FAW access to vollzugriff
-- FAW Prüfer log in with username/password and can only see the FAW Check tab

-- 1. Create FAW Prüfer group
INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_faw_pruefer',
  'FAW Prüfer',
  'Externe Frequenzprüfer — sehen nur FAW Check Standorte',
  '#d97706',
  'Eye',
  ARRAY['faw'],
  ARRAY['view', 'faw_review']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions;

-- 2. Add 'faw' tab to vollzugriff group (so they can also access FAW Check)
UPDATE groups
SET tabs = array_append(tabs, 'faw')
WHERE id = 'grp_vollzugriff'
  AND NOT ('faw' = ANY(tabs));


-- ──────────────────────────────────────────────────────────────
-- Source: add-partner-group.sql
-- ──────────────────────────────────────────────────────────────
-- ============================================================
-- Partner / Logistik Gruppe
-- Zugriff auf Hardware + Installationen
-- Run this in the Supabase SQL Editor
-- ============================================================

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_partner',
  'Partner / Logistik',
  'Installations- und Hardware-Logistik Partner',
  '#10b981',
  'Truck',
  ARRAY[
    'hardware',
    'hardware.inventory',
    'hardware.wareneingang',
    'hardware.qr-codes',
    'hardware.positionen',
    'installations',
    'installations.calendar',
    'installations.bookings'
  ],
  ARRAY[
    'view',
    'manage_hardware',
    'manage_warehouse',
    'manage_qr',
    'manage_bookings'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions;

-- Also update existing groups to include hardware tabs
-- Admin already has full access (checked by isAdmin())
-- Operations should also see hardware
UPDATE groups
SET tabs = array_cat(tabs, ARRAY['hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes', 'hardware.positionen']),
    actions = array_cat(actions, ARRAY['manage_hardware', 'manage_warehouse', 'manage_qr'])
WHERE id = 'grp_operations'
  AND NOT ('hardware' = ANY(tabs));


-- ──────────────────────────────────────────────────────────────
-- Source: add-dashboard-kpis-rpc.sql
-- ──────────────────────────────────────────────────────────────
-- Migration: Create get_dashboard_kpis RPC function
-- OPTIMIERT: hourly_health CTE entfernt (verursachte Timeout bei 150K+ Rows)
-- Health Rate wird jetzt aus daily_trend berechnet (online/total Ratio)
--
-- WICHTIG: days_offline ist TEXT in display_heartbeats! Muss immer gecastet werden.
-- Pattern: COALESCE(NULLIF(days_offline, '')::INT, 0)
--
-- Usage: SELECT get_dashboard_kpis(30);

CREATE OR REPLACE FUNCTION get_dashboard_kpis(days_back INT DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- 1. Installierte Displays = Status 'Live' oder 'Installed & online'
  installed AS (
    SELECT display_id
    FROM airtable_displays
    WHERE online_status IN ('Live', 'Installed & online')
  ),
  installed_count AS (
    SELECT COUNT(*) AS total FROM installed
  ),

  -- 2. Letzte Heartbeats pro Display (nur neuester pro display_id)
  latest_hb AS (
    SELECT DISTINCT ON (display_id)
      display_id,
      COALESCE(NULLIF(days_offline, '')::INT, 0) AS days_off,
      is_alive, display_status,
      location_name, timestamp_parsed, raw_display_id
    FROM display_heartbeats
    ORDER BY display_id, timestamp_parsed DESC
  ),

  -- 3. Status-Kategorien
  status_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE days_off < 1) AS online_count,
      COUNT(*) FILTER (WHERE days_off >= 1 AND days_off < 3) AS warning_count,
      COUNT(*) FILTER (WHERE days_off >= 3 AND days_off < 7) AS critical_count,
      COUNT(*) FILTER (WHERE days_off >= 7) AS permanent_offline_count,
      COUNT(*) AS heartbeat_total
    FROM latest_hb
  ),

  -- 4. Dayn Screens
  dayn AS (
    SELECT COUNT(*) AS total, ROUND(COUNT(*) * 0.9)::INT AS assumed_online
    FROM dayn_screens WHERE do_screen_id IS NOT NULL
  ),

  -- 5. Täglicher Trend + Health Rate Basis
  -- Health Rate = SUM(online display-days) / SUM(total display-days) * 100
  daily_trend AS (
    SELECT DATE(timestamp_parsed) AS day,
      COUNT(DISTINCT display_id) AS total,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) < 1) AS online,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 1 AND 2) AS warning,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 3 AND 6) AS critical,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) >= 7) AS permanent_offline
    FROM display_heartbeats
    WHERE timestamp_parsed >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY DATE(timestamp_parsed)
    ORDER BY day
  ),

  -- Health Rate aus daily_trend (ersetzt die teure hourly_health CTE)
  health_from_trend AS (
    SELECT
      COALESCE(SUM(online), 0) AS total_online,
      COALESCE(SUM(total), 0) AS total_expected
    FROM daily_trend
  ),

  -- 6. Display-Liste
  display_list AS (
    SELECT
      h.display_id, h.raw_display_id, h.location_name, h.days_off,
      h.display_status, h.timestamp_parsed,
      CASE
        WHEN h.days_off < 1 THEN 'online'
        WHEN h.days_off >= 1 AND h.days_off < 3 THEN 'warning'
        WHEN h.days_off >= 3 AND h.days_off < 7 THEN 'critical'
        WHEN h.days_off >= 7 THEN 'permanent_offline'
        ELSE 'unknown'
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
        'day', day, 'total', total, 'online', online,
        'warning', warning, 'critical', critical,
        'permanentOffline', permanent_offline,
        'healthRate', CASE WHEN total > 0
          THEN ROUND((online::NUMERIC / total * 100)::NUMERIC, 1) ELSE 0 END
      ) ORDER BY day), '[]'::JSON)
      FROM daily_trend
    ),
    'snapshotTimestamp', (SELECT MAX(timestamp_parsed) FROM latest_hb),
    'displays', (
      SELECT COALESCE(json_agg(json_build_object(
        'displayId', display_id, 'rawDisplayId', raw_display_id,
        'locationName', location_name, 'daysOffline', days_off,
        'displayStatus', display_status, 'status', status
      )), '[]'::JSON)
      FROM display_list
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO service_role;

-- Simpler Fallback: Nur Trend-Daten
CREATE OR REPLACE FUNCTION get_daily_trend(days_back INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object(
      'day', day, 'total', total, 'online', online,
      'warning', warning, 'critical', critical,
      'permanentOffline', permanent_offline,
      'healthRate', CASE WHEN total > 0
        THEN ROUND((online::NUMERIC / total * 100)::NUMERIC, 1) ELSE 0 END
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
      GROUP BY DATE(timestamp_parsed)
      ORDER BY day
    ) t
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO service_role;


-- ──────────────────────────────────────────────────────────────
-- Source: add-kpi-summary-rpc.sql
-- ──────────────────────────────────────────────────────────────
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


-- ──────────────────────────────────────────────────────────────
-- Source: add-mobile-kpis-rpc.sql
-- ──────────────────────────────────────────────────────────────
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


-- ──────────────────────────────────────────────────────────────
-- Source: fix-security-advisor-findings.sql
-- ──────────────────────────────────────────────────────────────
-- Fix Supabase Security Advisor Findings (Report 22 Feb 2026)
-- Project: FlinkDB2 / Flink_DooH (nrijgfcdlvuhhudasicd)
--
-- Finding 1+2: sync_metadata has RLS policies but RLS is not enabled
-- The table has a policy "Allow service role full access" but RLS was never turned on.
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

-- Finding 3: shipping_orders_overview view uses SECURITY DEFINER
-- This means the view runs with the privileges of the view owner, not the invoker.
-- Fix: Switch to SECURITY INVOKER so RLS policies on underlying tables are respected.
ALTER VIEW public.shipping_orders_overview SET (security_invoker = true);


-- ──────────────────────────────────────────────────────────────
-- Source: supabase-install-booker.sql
-- ──────────────────────────────────────────────────────────────
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

-- 4. GRANT permissions for PostgREST roles (required for API access!)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON install_routen TO anon, authenticated, service_role;
GRANT ALL ON install_bookings TO anon, authenticated, service_role;

-- 5. RLS Policies (service role bypasses RLS, anon can read bookings by token)
ALTER TABLE install_routen ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_bookings ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by Netlify Functions)
CREATE POLICY "Service role full access routen" ON install_routen
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access bookings" ON install_bookings
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

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
