-- ============================================================
-- Hardware Lifecycle Extension Tables
-- Wareneingang → QR-Codes → Position-Tracking
-- Run this in the Supabase SQL Editor
-- ============================================================


-- === 1. Wareneingang (Goods Receipt) ===
-- Erfasst eingehende Hardware-Lieferungen mit Zustandsprüfung
CREATE TABLE IF NOT EXISTS goods_receipts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id      TEXT UNIQUE NOT NULL,             -- WE-2026-0001 (auto-generated)
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Lieferungs-Details
  supplier        TEXT,                             -- Lieferant (z.B. "Philips", "JWIPC", "1NCE")
  delivery_note   TEXT,                             -- Lieferschein-Nr
  order_reference TEXT,                             -- Bestellnummer / PO Number
  carrier         TEXT,                             -- Spediteur / Paketdienst

  -- Hardware-Zuordnung
  component_type  TEXT NOT NULL,                    -- 'ops' | 'display' | 'sim' | 'mount' | 'accessory'
  serial_number   TEXT,                             -- Seriennummer (falls vorhanden)
  hardware_id     TEXT,                             -- Link zu hardware_ops.id / hardware_displays.id / hardware_sim.id
  quantity        INTEGER DEFAULT 1,                -- Anzahl (für Bulk-Lieferungen)

  -- Zustandsprüfung
  condition       TEXT DEFAULT 'ok',                -- ok | damaged | defect | incomplete
  condition_notes TEXT,                             -- Beschreibung von Schäden etc.
  photo_urls      TEXT[],                           -- Fotos vom Wareneingang

  -- Empfänger
  received_by     TEXT,                             -- Wer hat angenommen
  warehouse       TEXT DEFAULT 'Hauptlager',        -- Ziellager

  -- QR-Code-Verknüpfung
  qr_code_id      BIGINT,                          -- Link zu hardware_qr_codes.id (nach Zuweisung)

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_id ON goods_receipts(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_date ON goods_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_type ON goods_receipts(component_type);
CREATE INDEX IF NOT EXISTS idx_receipt_sn ON goods_receipts(serial_number);
CREATE INDEX IF NOT EXISTS idx_receipt_hardware ON goods_receipts(hardware_id);

-- Sequence für receipt_id
CREATE SEQUENCE IF NOT EXISTS goods_receipt_seq START 1;


-- === 2. QR-Code Registry ===
-- Zentrale QR-Code-Verwaltung mit Bulk-Generierung
CREATE TABLE IF NOT EXISTS hardware_qr_codes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_code         TEXT UNIQUE NOT NULL,             -- Der QR-Code-Inhalt (z.B. "JET-HW-2026-00001")
  qr_prefix       TEXT DEFAULT 'JET-HW',            -- Prefix für Gruppierung
  batch_id        TEXT,                             -- Batch-ID für Bulk-Generierung (z.B. "BATCH-2026-02-15")

  -- Zuordnung
  component_type  TEXT,                             -- 'ops' | 'display' | 'sim' | 'mount' | 'set'
  hardware_id     TEXT,                             -- Link zu hardware_ops.id etc.
  serial_number   TEXT,                             -- Verknüpfte Seriennummer

  -- Status
  status          TEXT DEFAULT 'generated',          -- generated | assigned | printed | active | deactivated
  assigned_at     TIMESTAMPTZ,                      -- Wann zugewiesen
  assigned_by     TEXT,                             -- Wer zugewiesen

  -- Label-Druck
  label_printed   BOOLEAN DEFAULT FALSE,
  label_printed_at TIMESTAMPTZ,
  label_format    TEXT DEFAULT '62x29',             -- Label-Größe in mm

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_code ON hardware_qr_codes(qr_code);
CREATE INDEX IF NOT EXISTS idx_qr_batch ON hardware_qr_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_qr_hardware ON hardware_qr_codes(hardware_id);
CREATE INDEX IF NOT EXISTS idx_qr_status ON hardware_qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_qr_sn ON hardware_qr_codes(serial_number);

-- Sequence für QR-Code-Nummern
CREATE SEQUENCE IF NOT EXISTS qr_code_seq START 1;


-- === 3. Hardware-Positionen (Position Tracking) ===
-- Lückenlose Nachverfolgung wo sich Hardware befindet
CREATE TABLE IF NOT EXISTS hardware_positions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Hardware-Referenz
  component_type      TEXT NOT NULL,                -- 'ops' | 'display' | 'sim' | 'mount' | 'set'
  hardware_id         TEXT NOT NULL,                -- Link zu hardware_ops.id etc.
  serial_number       TEXT,                         -- Seriennummer

  -- Position
  position            TEXT NOT NULL,                -- zulieferung | lager | versand | standort | ruecksendung | reparatur | entsorgung
  sub_position        TEXT,                         -- Konkreter Ort (z.B. "Regal A3", "Techniker Müller")

  -- Standort-Verknüpfung (wenn an Location installiert)
  display_location_id TEXT,                         -- FK → airtable_displays.id (wenn position = 'standort')
  location_name       TEXT,                         -- Standort-Name (denormalisiert für Anzeige)
  city                TEXT,                         -- Stadt (denormalisiert)

  -- Bewegung
  moved_from          TEXT,                         -- Vorherige Position
  moved_by            TEXT,                         -- Wer hat bewegt
  move_reason         TEXT,                         -- Grund: installation | swap | deinstall | repair | transfer | receipt
  reference_id        TEXT,                         -- Link zu Swap/Deinstall/Receipt ID

  -- Status
  is_current          BOOLEAN DEFAULT TRUE,         -- TRUE = aktuelle Position (FALSE = historisch)

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_hardware ON hardware_positions(hardware_id, is_current);
CREATE INDEX IF NOT EXISTS idx_pos_type ON hardware_positions(component_type);
CREATE INDEX IF NOT EXISTS idx_pos_position ON hardware_positions(position);
CREATE INDEX IF NOT EXISTS idx_pos_location ON hardware_positions(display_location_id);
CREATE INDEX IF NOT EXISTS idx_pos_current ON hardware_positions(is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_pos_created ON hardware_positions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sn ON hardware_positions(serial_number);


-- === RLS für alle neuen Tabellen ===
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_positions ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "auth_read" ON goods_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_qr_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_positions FOR SELECT TO authenticated USING (true);

-- Write policies for authenticated users (Wareneingang + QR können vom Dashboard erstellt werden)
CREATE POLICY "auth_insert" ON goods_receipts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON hardware_qr_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON hardware_positions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update" ON goods_receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON hardware_qr_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON hardware_positions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Service Role full access (for sync functions)
CREATE POLICY "service_all" ON goods_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_qr_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_positions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- === Anon read access (für Dashboard ohne Login) ===
CREATE POLICY "anon_read" ON goods_receipts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON hardware_qr_codes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON hardware_positions FOR SELECT TO anon USING (true);


-- === RPC: Nächste Receipt-ID generieren ===
CREATE OR REPLACE FUNCTION generate_receipt_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('goods_receipt_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'WE-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Nächsten QR-Code generieren ===
CREATE OR REPLACE FUNCTION generate_qr_code(prefix TEXT DEFAULT 'JET-HW')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('qr_code_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN prefix || '-' || year_str || '-' || lpad(next_val::TEXT, 5, '0');
END;
$$;


-- === RPC: Bulk QR-Codes generieren ===
CREATE OR REPLACE FUNCTION generate_qr_codes_bulk(
  count INTEGER,
  prefix TEXT DEFAULT 'JET-HW',
  p_batch_id TEXT DEFAULT NULL
)
RETURNS TABLE(qr_code TEXT, id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  batch TEXT;
  i INTEGER;
  new_code TEXT;
  new_id BIGINT;
BEGIN
  batch := COALESCE(p_batch_id, 'BATCH-' || to_char(NOW(), 'YYYY-MM-DD-HH24MI'));

  FOR i IN 1..count LOOP
    new_code := generate_qr_code(prefix);

    INSERT INTO hardware_qr_codes (qr_code, qr_prefix, batch_id, status)
    VALUES (new_code, prefix, batch, 'generated')
    RETURNING hardware_qr_codes.id, hardware_qr_codes.qr_code
    INTO new_id, new_code;

    id := new_id;
    qr_code := new_code;
    RETURN NEXT;
  END LOOP;
END;
$$;


-- === RPC: Hardware-Position aktualisieren ===
CREATE OR REPLACE FUNCTION update_hardware_position(
  p_component_type TEXT,
  p_hardware_id TEXT,
  p_serial_number TEXT,
  p_position TEXT,
  p_sub_position TEXT DEFAULT NULL,
  p_display_location_id TEXT DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_moved_by TEXT DEFAULT NULL,
  p_move_reason TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_position TEXT;
  new_id BIGINT;
BEGIN
  -- Vorherige Position ermitteln
  SELECT position INTO old_position
  FROM hardware_positions
  WHERE hardware_id = p_hardware_id
    AND component_type = p_component_type
    AND is_current = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  -- Alte Position als nicht-aktuell markieren
  UPDATE hardware_positions
  SET is_current = FALSE
  WHERE hardware_id = p_hardware_id
    AND component_type = p_component_type
    AND is_current = TRUE;

  -- Neue Position einfügen
  INSERT INTO hardware_positions (
    component_type, hardware_id, serial_number,
    position, sub_position,
    display_location_id, location_name, city,
    moved_from, moved_by, move_reason, reference_id,
    is_current
  ) VALUES (
    p_component_type, p_hardware_id, p_serial_number,
    p_position, p_sub_position,
    p_display_location_id, p_location_name, p_city,
    old_position, p_moved_by, p_move_reason, p_reference_id,
    TRUE
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;


-- === View: Aktuelle Hardware-Positionen ===
CREATE OR REPLACE VIEW hardware_current_positions AS
SELECT
  hp.id,
  hp.component_type,
  hp.hardware_id,
  hp.serial_number,
  hp.position,
  hp.sub_position,
  hp.display_location_id,
  hp.location_name,
  hp.city,
  hp.moved_from,
  hp.moved_by,
  hp.move_reason,
  hp.reference_id,
  hp.created_at AS position_since,
  -- OPS Details (if ops)
  ho.ops_nr,
  ho.ops_sn,
  ho.hardware_type AS ops_type,
  ho.status AS ops_status,
  -- Display Details (if display)
  hd.display_serial_number,
  hd.status AS display_status,
  -- SIM Details (if sim)
  hs.sim_id,
  hs.status AS sim_status
FROM hardware_positions hp
LEFT JOIN hardware_ops ho ON hp.component_type = 'ops' AND hp.hardware_id = ho.id
LEFT JOIN hardware_displays hd ON hp.component_type = 'display' AND hp.hardware_id = hd.id
LEFT JOIN hardware_sim hs ON hp.component_type = 'sim' AND hp.hardware_id = hs.id
WHERE hp.is_current = TRUE;
