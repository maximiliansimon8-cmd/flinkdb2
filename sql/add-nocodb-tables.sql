-- ============================================================
-- NocoDB Cache-Tabellen & Hardware-Enrichment
-- Cached NocoDB-Daten lokal in Supabase fuer schnelle Abfragen
-- und reichert hardware_ops mit Zusatzinformationen an.
-- Run this in the Supabase SQL Editor
-- ============================================================


-- ============================================================
-- 1. NOCODB_VORBEREITET
-- Verknuepft OPS, SIM, Venue und Kunden aus der NocoDB "Vorbereitet"-Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_vorbereitet (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,                   -- NocoDB Row-ID
  ops_nr          INTEGER,                          -- OPS-Nummer (Verknuepfung zu hardware_ops.ops_nr)
  venue_id        TEXT,                             -- Vistar Venue ID
  sim_id          TEXT,                             -- SIM ICCID
  kunden_nr       TEXT,                             -- Kunden-Nummer
  ops_sn          TEXT,                             -- OPS Seriennummer
  fertig          BOOLEAN DEFAULT FALSE,
  vorbereitet     BOOLEAN DEFAULT FALSE,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_ops_nr ON nocodb_vorbereitet(ops_nr);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_venue_id ON nocodb_vorbereitet(venue_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_sim_id ON nocodb_vorbereitet(sim_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vorb_kunden_nr ON nocodb_vorbereitet(kunden_nr);


-- ============================================================
-- 2. NOCODB_VISTAR_NAVORI
-- Vistar-Navori Venue-Zuordnungen (Standort-Name, DO-ID, Kunden-ID)
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_vistar_navori (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,
  venue_id        TEXT,                             -- Vistar Venue ID (langer Hash)
  name            TEXT,                             -- Standort-Name
  kunden_id       TEXT,                             -- Kunden-ID
  do_id           TEXT,                             -- DO-ID (z.B. "DO-GER-BER-WD-55-003-25")
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_vn_venue_id ON nocodb_vistar_navori(venue_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vn_kunden_id ON nocodb_vistar_navori(kunden_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_vn_do_id ON nocodb_vistar_navori(do_id);


-- ============================================================
-- 3. NOCODB_SIM_KUNDEN
-- SIM-Karten zu Kunden-Zuordnung (ICCID -> Kunden-ID)
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_sim_kunden (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,
  karten_nr       TEXT,                             -- SIM ICCID (z.B. "89882280000121940080")
  kunden_id       TEXT,                             -- Kunden-ID
  aktivierungsdatum DATE,                           -- Aktivierungsdatum
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_sk_karten_nr ON nocodb_sim_kunden(karten_nr);
CREATE INDEX IF NOT EXISTS idx_nocodb_sk_kunden_id ON nocodb_sim_kunden(kunden_id);


-- ============================================================
-- 4. NOCODB_LIEFERANDO
-- Lieferando Restaurant-/Standortdaten (Akquise, Rollout, Validierung)
-- ============================================================

CREATE TABLE IF NOT EXISTS nocodb_lieferando (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nocodb_id       INTEGER UNIQUE,
  kunden_id       TEXT,                             -- Kunden-ID
  restaurant      TEXT,                             -- Restaurant-Name
  strasse         TEXT,
  hausnummer      TEXT,
  plz             TEXT,
  stadt           TEXT,
  ansprechpartner TEXT,
  telefon         TEXT,
  mail            TEXT,
  akquise_status  TEXT,
  standort_status TEXT,
  einreichdatum   DATE,
  rollout_info    TEXT,
  installationsart TEXT,
  validierungsstatus TEXT,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodb_lief_kunden_id ON nocodb_lieferando(kunden_id);
CREATE INDEX IF NOT EXISTS idx_nocodb_lief_plz ON nocodb_lieferando(plz);
CREATE INDEX IF NOT EXISTS idx_nocodb_lief_stadt ON nocodb_lieferando(stadt);


-- ============================================================
-- 5. HARDWARE_OPS ENRICHMENT
-- Zusaetzliche Spalten fuer NocoDB-Anreicherung auf hardware_ops
-- ============================================================

ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS vistar_venue_id TEXT;
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS nocodb_kunden_nr TEXT;
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS nocodb_sim_id TEXT;
ALTER TABLE hardware_ops ADD COLUMN IF NOT EXISTS nocodb_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hw_ops_vistar_venue ON hardware_ops(vistar_venue_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- RLS aktivieren
ALTER TABLE nocodb_vorbereitet ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocodb_vistar_navori ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocodb_sim_kunden ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocodb_lieferando ENABLE ROW LEVEL SECURITY;

-- Lese-Zugriff fuer authentifizierte Benutzer
CREATE POLICY "auth_read" ON nocodb_vorbereitet FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON nocodb_vistar_navori FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON nocodb_sim_kunden FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON nocodb_lieferando FOR SELECT TO authenticated USING (true);

-- Schreib-Zugriff fuer authentifizierte Benutzer (Dashboard-Korrekturen)
CREATE POLICY "auth_insert" ON nocodb_vorbereitet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON nocodb_vistar_navori FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON nocodb_sim_kunden FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON nocodb_lieferando FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update" ON nocodb_vorbereitet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_vistar_navori FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_sim_kunden FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON nocodb_lieferando FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Anon Lese-Zugriff (Dashboard ohne Login)
CREATE POLICY "anon_read" ON nocodb_vorbereitet FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON nocodb_vistar_navori FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON nocodb_sim_kunden FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON nocodb_lieferando FOR SELECT TO anon USING (true);

-- Service-Role Vollzugriff (fuer Sync-Funktionen)
CREATE POLICY "service_all" ON nocodb_vorbereitet FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON nocodb_vistar_navori FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON nocodb_sim_kunden FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON nocodb_lieferando FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- VIEW: NOCODB_HARDWARE_ENRICHED
-- Zusammenfuehrung von NocoDB-Vorbereitet mit Hardware-OPS,
-- Vistar-Navori Venues, SIM-Kunden und Lieferando-Standortdaten
-- ============================================================

CREATE OR REPLACE VIEW nocodb_hardware_enriched AS
SELECT
  v.ops_nr,
  v.venue_id,
  v.sim_id,
  v.kunden_nr,
  v.ops_sn AS nocodb_ops_sn,
  v.fertig,
  v.vorbereitet,
  ho.id AS hardware_ops_id,
  ho.ops_sn AS airtable_ops_sn,
  ho.status AS ops_status,
  ho.hardware_type,
  vn.name AS venue_name,
  vn.do_id,
  sk.aktivierungsdatum AS sim_activated,
  l.restaurant,
  l.stadt,
  l.strasse,
  l.hausnummer,
  l.akquise_status,
  l.standort_status
FROM nocodb_vorbereitet v
LEFT JOIN hardware_ops ho ON v.ops_nr::TEXT = ho.ops_nr
LEFT JOIN nocodb_vistar_navori vn ON v.venue_id = vn.venue_id
LEFT JOIN nocodb_sim_kunden sk ON v.sim_id = sk.karten_nr
LEFT JOIN nocodb_lieferando l ON v.kunden_nr = l.kunden_id;


-- ============================================================
-- SYNC METADATA
-- Eintraege fuer NocoDB-Sync-Tracking in sync_metadata
-- ============================================================

INSERT INTO sync_metadata (table_name, last_sync_status) VALUES
  ('nocodb_vorbereitet', 'pending'),
  ('nocodb_vistar_navori', 'pending'),
  ('nocodb_sim_kunden', 'pending'),
  ('nocodb_lieferando', 'pending')
ON CONFLICT (table_name) DO NOTHING;


-- ============================================================
-- TRIGGER: Auto-Update synced_at bei Aenderungen
-- ============================================================

-- Reusable Trigger-Funktion (erstellt nur falls noch nicht vorhanden)
CREATE OR REPLACE FUNCTION update_synced_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.synced_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nocodb_vorbereitet_synced_at
  BEFORE UPDATE ON nocodb_vorbereitet
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();

CREATE TRIGGER trg_nocodb_vistar_navori_synced_at
  BEFORE UPDATE ON nocodb_vistar_navori
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();

CREATE TRIGGER trg_nocodb_sim_kunden_synced_at
  BEFORE UPDATE ON nocodb_sim_kunden
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();

CREATE TRIGGER trg_nocodb_lieferando_synced_at
  BEFORE UPDATE ON nocodb_lieferando
  FOR EACH ROW EXECUTE FUNCTION update_synced_at_column();
