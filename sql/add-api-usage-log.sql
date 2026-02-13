-- ═══════════════════════════════════════════════════════════════
-- API Usage Log — Track all external API calls from Netlify Functions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_usage_log (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Which function / service
  function_name TEXT NOT NULL,          -- e.g. 'chat-proxy', 'airtable-proxy', 'vistar-sync'
  service       TEXT NOT NULL,          -- e.g. 'anthropic', 'airtable', 'supabase', 'vistar', 'google-sheets', 'superchat'

  -- Request details
  method        TEXT,                   -- GET, POST, PATCH, DELETE, STREAM
  endpoint      TEXT,                   -- e.g. '/v1/messages', '/Stammdaten', '/report'

  -- Performance
  duration_ms   INTEGER,               -- Response time in ms
  status_code   INTEGER,               -- HTTP status code (200, 429, 500, etc.)
  success       BOOLEAN DEFAULT TRUE,

  -- Usage metrics
  tokens_in     INTEGER,               -- For LLM calls: input tokens
  tokens_out    INTEGER,               -- For LLM calls: output tokens
  records_count INTEGER,               -- For DB/API calls: number of records fetched/written
  bytes_transferred INTEGER,           -- Response size in bytes (approximate)

  -- Cost tracking (estimated)
  estimated_cost_cents NUMERIC(10,4),  -- Estimated cost in USD cents

  -- Context
  user_id       TEXT,                   -- Who triggered it (if known)
  error_message TEXT,                   -- Error details if failed
  metadata      JSONB                   -- Extra info (cache hit, batch number, etc.)
);

-- ── Indexes for fast queries ──
CREATE INDEX IF NOT EXISTS idx_api_usage_created     ON api_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_function    ON api_usage_log (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_service     ON api_usage_log (service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_success     ON api_usage_log (success, created_at DESC);

-- ── Auto-cleanup: remove entries older than 90 days (optional cron) ──
-- DELETE FROM api_usage_log WHERE created_at < NOW() - INTERVAL '90 days';

-- ── RLS: allow service role full access, authenticated users read-only ──
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON api_usage_log
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Allow authenticated users to read (for Admin panel)
CREATE POLICY "Authenticated users can read" ON api_usage_log
  FOR SELECT USING (auth.role() = 'authenticated');
