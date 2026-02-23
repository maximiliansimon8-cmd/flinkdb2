-- Migration: Add extra_fields JSONB column to all synced Airtable tables
-- Purpose: Store ALL Airtable fields that aren't explicitly mapped to named columns
-- This allows us to fetch all fields from Airtable without needing migrations for each new field
-- Date: 2026-02-21

-- Acquisition (127 AT fields, 45 mapped → ~82 in extra_fields)
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Airtable Displays (90 AT fields, 17 mapped)
ALTER TABLE airtable_displays ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Tasks (76 AT fields, 32 mapped)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Installationen (128 AT fields, 22 mapped)
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Stammdaten (72 AT fields, 14 mapped)
ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Communications / activity_log (17 AT fields, 15 mapped)
ALTER TABLE communications ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Dayn Screens (40 AT fields, 28 mapped)
ALTER TABLE dayn_screens ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Hardware OPS (26 AT fields, 13 mapped)
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Hardware SIM (8 AT fields, 3 mapped)
ALTER TABLE hardware_sim ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Hardware Displays (3 AT fields, 3 mapped — no extras expected)
ALTER TABLE hardware_displays ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- CHG Approvals (34 AT fields, 18 mapped)
ALTER TABLE chg_approvals ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Hardware Swaps (16 AT fields, 10 mapped)
ALTER TABLE hardware_swaps ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Hardware Deinstalls (17 AT fields, 8 mapped)
ALTER TABLE hardware_deinstalls ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Installationstermine (23 AT fields, 23 mapped — but may get new fields)
ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT NULL;

-- Optional: GIN index for querying JSONB (only on tables likely to be queried)
CREATE INDEX IF NOT EXISTS idx_acquisition_extra_fields ON acquisition USING GIN (extra_fields) WHERE extra_fields IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_installationen_extra_fields ON installationen USING GIN (extra_fields) WHERE extra_fields IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_extra_fields ON tasks USING GIN (extra_fields) WHERE extra_fields IS NOT NULL;
