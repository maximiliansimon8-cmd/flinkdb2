-- Migration: FAW Data table for INDA frequency analysis
-- Stores dVAC values and hourly breakdowns from INDA Excel imports
-- 2026-02-27

CREATE TABLE IF NOT EXISTS faw_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  akquise_airtable_id TEXT NOT NULL,             -- Link to acquisition table
  dvac_gesamt NUMERIC(12,2),                     -- Total weekly d/VAC
  dvac_kfz NUMERIC(12,2),                        -- Kfz (vehicles) weekly
  dvac_oepnv NUMERIC(12,2),                      -- ÖPNV (public transport) weekly
  dvac_fussgaenger NUMERIC(12,2),                -- Fußgänger (pedestrians) weekly
  schaltung VARCHAR(20) DEFAULT '10/60',         -- e.g. "10/60" = 10s Spot / 60s Loop
  sov_factor NUMERIC(5,2) DEFAULT 6.00,          -- Share of Voice (60/10 = 6)
  vac_id VARCHAR(50),                             -- VAC ID from INDA export
  gkz VARCHAR(20),                                -- Gemeindekennziffer
  inda_version VARCHAR(50),                       -- Version from export
  hourly_gesamt JSONB,                            -- {"Mo":[h0..h23],"Di":[...],...,"So":[...]}
  hourly_kfz JSONB,
  hourly_oepnv JSONB,
  hourly_fussgaenger JSONB,
  data_source VARCHAR(100),                       -- e.g. 'INDA Export (Version 3.2)'
  reviewer_name TEXT,                             -- Who uploaded/entered the data
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_faw_data_akquise ON faw_data(akquise_airtable_id);
CREATE INDEX IF NOT EXISTS idx_faw_data_created ON faw_data(created_at DESC);

-- RLS
ALTER TABLE faw_data ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (Netlify Functions use service role key)
-- No user-facing RLS needed since access is via Netlify Functions with HMAC auth

COMMENT ON TABLE faw_data IS 'FAW/INDA frequency analysis data per acquisition record';
COMMENT ON COLUMN faw_data.hourly_gesamt IS 'Hourly breakdown: {"Mo":[24 values],...,"So":[24 values]}';
COMMENT ON COLUMN faw_data.sov_factor IS 'Share of Voice factor = Loop-Länge / Spot-Länge';
