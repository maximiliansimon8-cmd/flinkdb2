-- Migration: Create installationstermine table for Airtable sync
-- Table: Installationstermine (353 records) — installation appointment scheduling data
-- Source: Airtable base apppFUWK829K6B3R2

CREATE TABLE IF NOT EXISTS installationstermine (
  id text PRIMARY KEY,                              -- Airtable record ID (rec...)
  airtable_id text UNIQUE,                          -- same as id, for orphan detection
  install_date_id integer,                          -- Autonumber from Airtable
  installationsdatum timestamptz,                   -- scheduled installation date+time
  erinnerungsdatum date,                            -- reminder date
  installationszeit text,                           -- installation time as text
  grund_notiz text,                                 -- reason/notes (Long Text)
  naechste_schritt text,                            -- next step
  kw_geplant text,                                  -- planned calendar week (Formula)
  wochentag text,                                   -- day of week (Formula)
  installationsdatum_nur_datum text,                -- date only (Formula)
  terminstatus text,                                -- "Geplant", "Abgesagt", "Verschoben", "No-Show", "Durchgeführt"
  jet_id_links text[],                              -- linked record IDs to JET Stammdaten
  location_name text[],                             -- lookup from JET ID
  akquise_links text[],                             -- linked record IDs to Acquisition_DB
  street text[],                                    -- lookup from Akquise
  street_number text[],                             -- lookup from Akquise
  postal_code text[],                               -- lookup from Akquise
  city text[],                                      -- lookup from Akquise
  contact_email text[],                             -- lookup from Stammdaten
  stammdaten_links text[],                          -- linked record IDs to JET Stammdaten
  installationen_links text[],                      -- linked record IDs to Installationen
  status_installation text[],                       -- lookup from Installationen
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_installationstermine_terminstatus ON installationstermine (terminstatus);
CREATE INDEX IF NOT EXISTS idx_installationstermine_installationsdatum ON installationstermine (installationsdatum);
CREATE INDEX IF NOT EXISTS idx_installationstermine_updated_at ON installationstermine (updated_at);

-- RLS: Enable row-level security
ALTER TABLE installationstermine ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous read access (dashboard reads via Supabase anon key)
CREATE POLICY "Allow anonymous read access on installationstermine"
  ON installationstermine
  FOR SELECT
  USING (true);

-- Policy: Allow service role full access (for sync function)
CREATE POLICY "Allow service role full access on installationstermine"
  ON installationstermine
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add to sync_metadata tracking
INSERT INTO sync_metadata (table_name, last_sync_timestamp, records_fetched, records_upserted, last_sync_status, updated_at)
VALUES ('installationstermine', NULL, 0, 0, 'pending', now())
ON CONFLICT (table_name) DO NOTHING;
