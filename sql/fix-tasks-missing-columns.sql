-- ═══════════════════════════════════════════════════════════════════
-- Fix: Add missing 'attachments' column to tasks table
-- AND fix 'superchat' column type (BOOLEAN → TEXT, stores URLs)
--
-- ROOT CAUSE: The sync mapper (airtableMappers.js) produces an
-- 'attachments' field (JSONB array) that doesn't exist in the
-- Supabase tasks table. This causes PostgREST to reject the entire
-- batch with a 400 error, so NO tasks get upserted → stale data.
--
-- Run this in the Supabase SQL Editor to fix the issue.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add the missing 'attachments' column (JSONB array of attachment objects)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 2. Fix 'superchat' column type: the Airtable field can contain URLs (text),
--    but the column was created as BOOLEAN. Change to TEXT to match actual data.
--    This is safe: existing false/null values will be preserved as text.
ALTER TABLE tasks ALTER COLUMN superchat TYPE TEXT USING superchat::TEXT;
ALTER TABLE tasks ALTER COLUMN superchat SET DEFAULT NULL;

-- 3. Reload PostgREST schema cache so the new column is immediately available
NOTIFY pgrst, 'reload schema';
