-- Add display_status column to stammdaten table
-- This stores the "Status" field from Airtable "Live Display Locations"
-- Values: "Online", "Deinstalliert", etc.
-- Run this in the Supabase SQL Editor

ALTER TABLE stammdaten ADD COLUMN IF NOT EXISTS display_status TEXT;

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_stammdaten_display_status ON stammdaten(display_status);
