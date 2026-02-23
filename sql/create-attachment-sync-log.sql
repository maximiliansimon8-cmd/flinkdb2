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
