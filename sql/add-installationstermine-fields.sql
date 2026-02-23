-- Migration: Add missing partner/integrator/technician fields to installationstermine
-- These fields come from Airtable lookup fields on linked Installationen & Akquise records
-- Fixes: "wir syncen nicht den Partner der den Termin gemacht hat oder für den er ist"

-- Partner / Integrator / Technician lookups (from linked Installationen)
ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS integrator text[];
COMMENT ON COLUMN installationstermine.integrator IS 'Company (from Integrator) (from Installationen) — Integrator/installer company (e.g. e-Systems, MediaAV)';

ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS technicians text[];
COMMENT ON COLUMN installationstermine.technicians IS 'Name (from Technikers) (from Installationen) — Technician names who perform the installation';

ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS installationsart text[];
COMMENT ON COLUMN installationstermine.installationsart IS 'Installationsart (from Installationen) — Installation type (Bodenmontage, Wandmontage, etc.)';

ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS aufbau_datum text[];
COMMENT ON COLUMN installationstermine.aufbau_datum IS 'Aufbau Datum (from Installationen) — Actual installation date (lookup)';

ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS abnahme_partner text[];
COMMENT ON COLUMN installationstermine.abnahme_partner IS 'Abnahme Partner (Name) (from Installationen) — Partner who accepted/signed off on installation';

-- Acquisition partner lookup (from linked Akquise)
ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS acquisition_partner text[];
COMMENT ON COLUMN installationstermine.acquisition_partner IS 'Akquisition Partner Name (from Akquise) — Sales partner who acquired the location';

-- Contact lookups from Stammdaten
ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS contact_person text[];
COMMENT ON COLUMN installationstermine.contact_person IS 'Contact Person (from Stammdaten) — Contact person at the location';

ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS contact_phone text[];
COMMENT ON COLUMN installationstermine.contact_phone IS 'Contact Phone (from Stammdaten) — Contact phone number at the location';

-- Audit fields
ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS created_by text;
COMMENT ON COLUMN installationstermine.created_by IS 'Created by — Airtable collaborator who created this appointment record';

-- Reload PostgREST schema cache so new columns are immediately available via API
NOTIFY pgrst, 'reload schema';
