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
