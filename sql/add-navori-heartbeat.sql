-- Migration: Add source column to display_heartbeats + Navori feature flag
-- Enables distinguishing Sheets-imported vs Navori API heartbeats

-- 1. Add source column (default 'sheets' for existing data)
ALTER TABLE display_heartbeats ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sheets';

-- 2. Add unique constraint on (display_id, timestamp_parsed) if not exists
-- This is needed for the navori upsert which uses timestamp_parsed (ISO) instead of timestamp (German format)
-- The existing constraint is on (display_id, timestamp) — we need both during parallel operation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'display_heartbeats_display_id_timestamp_parsed_key'
  ) THEN
    ALTER TABLE display_heartbeats
      ADD CONSTRAINT display_heartbeats_display_id_timestamp_parsed_key
      UNIQUE (display_id, timestamp_parsed);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint may already exist or cannot be created: %', SQLERRM;
END $$;

-- 3. Feature flag for Navori heartbeat sync
INSERT INTO feature_flags (key, enabled, description)
VALUES ('navori_heartbeat_enabled', false, 'Navori API Heartbeat Sync (stuendlich, ersetzt Google Sheets)')
ON CONFLICT (key) DO NOTHING;

-- 4. Index on source for easy filtering
CREATE INDEX IF NOT EXISTS idx_display_heartbeats_source ON display_heartbeats(source);
