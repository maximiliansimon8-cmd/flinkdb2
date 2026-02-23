-- Enrich installationen.jet_id by joining with acquisition table
-- The Airtable "JET ID (from Akquise)" lookup on the Installationen table
-- returns Stammdaten record IDs instead of the numeric JET-ID.
-- This function resolves the real JET-ID via the akquise_links → acquisition.jet_id join.
--
-- Called automatically after each Installationen sync in sync-airtable.js

CREATE OR REPLACE FUNCTION enrich_installationen_jet_id()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Update jet_id from acquisition where akquise_links contains the acquisition airtable_id
  UPDATE installationen i
  SET jet_id = a.jet_id
  FROM acquisition a
  WHERE i.akquise_links IS NOT NULL
    AND jsonb_array_length(i.akquise_links) > 0
    AND a.airtable_id = (i.akquise_links->>0)
    AND a.jet_id IS NOT NULL
    AND (i.jet_id IS NULL OR i.jet_id LIKE 'rec%');

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN json_build_object('updated', updated_count);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION enrich_installationen_jet_id() TO service_role;
