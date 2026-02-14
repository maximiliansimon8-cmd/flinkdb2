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
