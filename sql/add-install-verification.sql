-- Migration: Post-Install Verification & Freigabe-Automatisierung
-- Date: 2026-02-25
-- Purpose: Adds Freigabe columns to installationen + verification log table

-- ═══ Part 1: Add Freigabe columns to installationen ═══

ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_online_rate BOOLEAN DEFAULT false;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_installation_vorort BOOLEAN DEFAULT false;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_chg BOOLEAN DEFAULT false;
ALTER TABLE installationen ADD COLUMN IF NOT EXISTS freigabe_datum_chg DATE;

-- Index for verification queries (find un-verified installations)
CREATE INDEX IF NOT EXISTS idx_installationen_freigabe_pending
  ON installationen (install_date)
  WHERE freigabe_online_rate = false AND status = 'Installiert';

-- ═══ Part 2: Verification log table ═══

CREATE TABLE IF NOT EXISTS install_verification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  installation_airtable_id TEXT NOT NULL,
  display_id TEXT,
  check_type TEXT NOT NULL CHECK (check_type IN ('3_day', '10_day')),
  check_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_heartbeats INTEGER DEFAULT 0,
  alive_heartbeats INTEGER DEFAULT 0,
  online_rate_pct NUMERIC(5,2),
  passed BOOLEAN NOT NULL,
  task_airtable_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one check per installation per check_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_ivl_unique_check
  ON install_verification_log(installation_airtable_id, check_type);

CREATE INDEX IF NOT EXISTS idx_ivl_check_date
  ON install_verification_log(check_date DESC);

-- ═══ Part 3: RLS ═══

ALTER TABLE install_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON install_verification_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON install_verification_log
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ═══ Part 4: Feature flag ═══

INSERT INTO feature_flags (key, enabled, description)
VALUES (
  'install_verification_enabled',
  false,
  'Automatische 3/10-Tage Online-Rate-Pruefung nach Installation. Prueft ob Display min. 80% online ist (6-24 Uhr). Laeuft alle 6 Stunden.'
)
ON CONFLICT (key) DO NOTHING;

-- ═══ Part 5: Grants ═══

GRANT SELECT, INSERT, UPDATE ON install_verification_log TO anon;
GRANT SELECT, INSERT, UPDATE ON install_verification_log TO authenticated;
GRANT ALL ON install_verification_log TO service_role;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
