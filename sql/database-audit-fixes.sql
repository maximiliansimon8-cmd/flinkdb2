-- ═══════════════════════════════════════════════════════════════
-- Database Audit Fixes — 2026-02-18
-- Fixes found during comprehensive database linkage audit
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Add airtable_id to hardware tables (for orphan detection) ───

ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS airtable_id TEXT;
UPDATE hardware_ops SET airtable_id = id WHERE airtable_id IS NULL;

ALTER TABLE hardware_sim ADD COLUMN IF NOT EXISTS airtable_id TEXT;
UPDATE hardware_sim SET airtable_id = id WHERE airtable_id IS NULL;

ALTER TABLE hardware_displays ADD COLUMN IF NOT EXISTS airtable_id TEXT;
UPDATE hardware_displays SET airtable_id = id WHERE airtable_id IS NULL;

ALTER TABLE chg_approvals ADD COLUMN IF NOT EXISTS airtable_id TEXT;
UPDATE chg_approvals SET airtable_id = id WHERE airtable_id IS NULL;

ALTER TABLE hardware_swaps ADD COLUMN IF NOT EXISTS airtable_id TEXT;
UPDATE hardware_swaps SET airtable_id = id WHERE airtable_id IS NULL;

ALTER TABLE hardware_deinstalls ADD COLUMN IF NOT EXISTS airtable_id TEXT;
UPDATE hardware_deinstalls SET airtable_id = id WHERE airtable_id IS NULL;

-- ─── 2. Add jet_id to installationstermine ───

ALTER TABLE installationstermine ADD COLUMN IF NOT EXISTS jet_id TEXT;

-- ─── 3. Enrichment function: installationstermine.jet_id from acquisition ───

CREATE OR REPLACE FUNCTION enrich_installationstermine_jet_id()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Update jet_id from acquisition via akquise_links
  UPDATE installationstermine t
  SET jet_id = a.jet_id
  FROM acquisition a
  WHERE t.akquise_links IS NOT NULL
    AND array_length(t.akquise_links, 1) > 0
    AND a.airtable_id = t.akquise_links[1]
    AND a.jet_id IS NOT NULL
    AND (t.jet_id IS NULL OR t.jet_id LIKE 'rec%');

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN json_build_object('updated', updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION enrich_installationstermine_jet_id() TO service_role;

-- ─── 4. Add booking_status fields to acquisition table ───

ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT NULL;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS booking_token TEXT DEFAULT NULL;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS booking_link_sent_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_acquisition_booking_status
  ON acquisition (booking_status) WHERE booking_status IS NOT NULL;

-- ─── 5. Fix enrich_installationen_jet_id search_path (security linter) ───

ALTER FUNCTION enrich_installationen_jet_id() SET search_path = '';
ALTER FUNCTION enrich_installationstermine_jet_id() SET search_path = '';
