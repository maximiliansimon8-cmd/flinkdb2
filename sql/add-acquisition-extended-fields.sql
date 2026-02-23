-- Migration: Add extended fields to acquisition table
-- Adds attachments, comments, dVAC, location detail fields
-- These were previously only available via the detail API (on-demand from Airtable)
-- Now synced regularly for faster access

-- Vertrag PDF attachments (array of {url, filename, size, type})
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS vertrag_pdf jsonb DEFAULT '[]'::jsonb;

-- Location images from Akquise (array of {url, filename, size, type, thumbnails})
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

-- FAW data attachments (array of {url, filename, size, type})
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS faw_data_attachment jsonb DEFAULT '[]'::jsonb;

-- Comments
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS akquise_kommentar text;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS kommentar_installationen text;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS frequency_approval_comment text;

-- dVAC fields
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS dvac_month numeric;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS dvac_day numeric;

-- Location detail fields
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS hindernisse_beschreibung text;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS fensterbreite text;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS steckdose text;
