-- ============================================================
-- Warenwirtschaft (Warehouse Management) Extension Tables
-- Bestellungen -> Versand -> Retouren -> Lager -> Alerts
-- Run this in the Supabase SQL Editor
-- ============================================================


-- ============================================================
-- SEQUENCES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS shipping_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS return_order_seq START 1;


-- ============================================================
-- 1. PURCHASE ORDERS (Bestellungen)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number           TEXT UNIQUE NOT NULL,               -- PO-2026-0042 (auto-generated)
  order_date          DATE DEFAULT CURRENT_DATE,
  expected_delivery   DATE,
  supplier            TEXT NOT NULL,                       -- Lieferant (z.B. "JWIPC", "Philips", "1NCE")
  supplier_contact    TEXT,                                -- Ansprechpartner beim Lieferanten
  supplier_reference  TEXT,                                -- Lieferanten-Bestellbestaetigung
  notes               TEXT,
  status              TEXT DEFAULT 'entwurf',              -- entwurf | bestellt | teilgeliefert | vollstaendig | storniert
  total_items         INTEGER DEFAULT 0,
  received_items      INTEGER DEFAULT 0,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_expected_delivery ON purchase_orders(expected_delivery);
CREATE INDEX IF NOT EXISTS idx_po_created_at ON purchase_orders(created_at DESC);


-- ============================================================
-- 2. PURCHASE ORDER ITEMS (Bestellpositionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id               BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_number         INTEGER,                             -- Position 1, 2, 3...
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  description         TEXT,                                -- z.B. "JWIPC S088 OPS Player"
  quantity            INTEGER NOT NULL,
  unit_price          NUMERIC(10,2),
  received_quantity   INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'offen',                -- offen | teilgeliefert | vollstaendig
  serial_numbers      TEXT[],                              -- Assigned serial numbers after receipt
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_po_id ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_poi_component_type ON purchase_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_poi_status ON purchase_order_items(status);


-- ============================================================
-- 3. WAREHOUSE LOCATIONS (Lagerplaetze)
-- ============================================================

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  warehouse           TEXT NOT NULL DEFAULT 'Hauptlager',  -- Lager-Name
  zone                TEXT,                                -- z.B. "A", "B", "Defekt"
  shelf               TEXT,                                -- z.B. "A3", "B1"
  name                TEXT NOT NULL,                       -- Human-readable: "Regal A3 - OPS Neu"
  capacity            INTEGER,                             -- Max items
  current_count       INTEGER DEFAULT 0,
  location_type       TEXT,                                -- ops | display | sim | mixed | defect | repair
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wl_warehouse ON warehouse_locations(warehouse);
CREATE INDEX IF NOT EXISTS idx_wl_zone ON warehouse_locations(zone);
CREATE INDEX IF NOT EXISTS idx_wl_location_type ON warehouse_locations(location_type);
CREATE INDEX IF NOT EXISTS idx_wl_active ON warehouse_locations(active) WHERE active = TRUE;


-- ============================================================
-- 4. SHIPPING ORDERS (Versandauftraege)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_orders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipping_id         TEXT UNIQUE NOT NULL,                -- VS-2026-0123 (auto-generated)
  order_date          DATE DEFAULT CURRENT_DATE,
  destination_type    TEXT,                                -- installation | partner | warehouse | return
  destination_id      TEXT,                                -- FK to installation/partner/warehouse
  destination_name    TEXT,                                -- Denormalisiert fuer Anzeige
  destination_address TEXT,
  carrier             TEXT,                                -- DHL, UPS, Spediteur, Selbstabholung
  tracking_number     TEXT,
  packaging_type      TEXT,                                -- Paket, Palette, Express
  notes               TEXT,
  status              TEXT DEFAULT 'kommissioniert',       -- kommissioniert | verpackt | versendet | zugestellt | problem
  shipped_at          TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_shipping_id ON shipping_orders(shipping_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON shipping_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_order_date ON shipping_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_so_destination_type ON shipping_orders(destination_type);
CREATE INDEX IF NOT EXISTS idx_so_destination_id ON shipping_orders(destination_id);
CREATE INDEX IF NOT EXISTS idx_so_carrier ON shipping_orders(carrier);
CREATE INDEX IF NOT EXISTS idx_so_tracking ON shipping_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_so_created_at ON shipping_orders(created_at DESC);


-- ============================================================
-- 5. SHIPPING ORDER ITEMS (Versand-Positionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_order_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipping_order_id   BIGINT NOT NULL REFERENCES shipping_orders(id) ON DELETE CASCADE,
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  hardware_id         TEXT,                                -- Link zu hardware_ops.id etc.
  serial_number       TEXT,
  qr_code             TEXT,
  picked              BOOLEAN DEFAULT FALSE,               -- Aus Lager kommissioniert
  picked_at           TIMESTAMPTZ,
  picked_by           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soi_shipping_order_id ON shipping_order_items(shipping_order_id);
CREATE INDEX IF NOT EXISTS idx_soi_component_type ON shipping_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_soi_hardware_id ON shipping_order_items(hardware_id);
CREATE INDEX IF NOT EXISTS idx_soi_serial_number ON shipping_order_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_soi_qr_code ON shipping_order_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_soi_picked ON shipping_order_items(picked);


-- ============================================================
-- 6. RETURN ORDERS (Ruecksendungen / RMA)
-- ============================================================

CREATE TABLE IF NOT EXISTS return_orders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id           TEXT UNIQUE NOT NULL,                -- RMA-2026-0001
  return_date         DATE DEFAULT CURRENT_DATE,
  source_type         TEXT,                                -- standort | partner | techniker
  source_id           TEXT,
  source_name         TEXT,                                -- Denormalisiert fuer Anzeige
  reason              TEXT,                                -- defekt | tausch | vertragsende | upgrade | sonstiges
  reference_id        TEXT,                                -- Link zu swap/deinstall
  carrier             TEXT,
  tracking_number     TEXT,
  status              TEXT DEFAULT 'erwartet',             -- erwartet | eingegangen | geprueft | entschieden
  inspection_result   TEXT,                                -- reparierbar | schrott | wie_neu | refurbished
  inspection_notes    TEXT,
  decision            TEXT,                                -- lager | reparatur | entsorgung | lieferant
  decided_at          TIMESTAMPTZ,
  decided_by          TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_return_id ON return_orders(return_id);
CREATE INDEX IF NOT EXISTS idx_ro_status ON return_orders(status);
CREATE INDEX IF NOT EXISTS idx_ro_return_date ON return_orders(return_date DESC);
CREATE INDEX IF NOT EXISTS idx_ro_source_type ON return_orders(source_type);
CREATE INDEX IF NOT EXISTS idx_ro_source_id ON return_orders(source_id);
CREATE INDEX IF NOT EXISTS idx_ro_reason ON return_orders(reason);
CREATE INDEX IF NOT EXISTS idx_ro_reference_id ON return_orders(reference_id);
CREATE INDEX IF NOT EXISTS idx_ro_tracking ON return_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ro_decision ON return_orders(decision);
CREATE INDEX IF NOT EXISTS idx_ro_created_at ON return_orders(created_at DESC);


-- ============================================================
-- 7. RETURN ORDER ITEMS (Ruecksendungs-Positionen)
-- ============================================================

CREATE TABLE IF NOT EXISTS return_order_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_order_id     BIGINT NOT NULL REFERENCES return_orders(id) ON DELETE CASCADE,
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  hardware_id         TEXT,
  serial_number       TEXT,
  qr_code             TEXT,
  condition           TEXT DEFAULT 'ungeprueft',           -- ungeprueft | ok | beschaedigt | defekt
  condition_notes     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roi_return_order_id ON return_order_items(return_order_id);
CREATE INDEX IF NOT EXISTS idx_roi_component_type ON return_order_items(component_type);
CREATE INDEX IF NOT EXISTS idx_roi_hardware_id ON return_order_items(hardware_id);
CREATE INDEX IF NOT EXISTS idx_roi_serial_number ON return_order_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_roi_qr_code ON return_order_items(qr_code);
CREATE INDEX IF NOT EXISTS idx_roi_condition ON return_order_items(condition);


-- ============================================================
-- 8. STOCK ALERTS (Mindestbestand-Warnungen)
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_alerts (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  component_type      TEXT NOT NULL,                       -- ops | display | sim | mount | accessory
  warehouse           TEXT DEFAULT 'Hauptlager',
  min_stock           INTEGER DEFAULT 5,
  current_stock       INTEGER DEFAULT 0,
  alert_active        BOOLEAN DEFAULT TRUE,
  last_alerted_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_component_type ON stock_alerts(component_type);
CREATE INDEX IF NOT EXISTS idx_sa_warehouse ON stock_alerts(warehouse);
CREATE INDEX IF NOT EXISTS idx_sa_alert_active ON stock_alerts(alert_active) WHERE alert_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_type_warehouse ON stock_alerts(component_type, warehouse);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "auth_read" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON warehouse_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON shipping_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON shipping_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON return_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON return_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON stock_alerts FOR SELECT TO authenticated USING (true);

-- Insert policies for authenticated users
CREATE POLICY "auth_insert" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON warehouse_locations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON shipping_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON shipping_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON return_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON return_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON stock_alerts FOR INSERT TO authenticated WITH CHECK (true);

-- Update policies for authenticated users
CREATE POLICY "auth_update" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON warehouse_locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON shipping_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON shipping_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON return_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON return_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON stock_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Anon read access (for dashboard without login)
CREATE POLICY "anon_read" ON purchase_orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON purchase_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON warehouse_locations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON shipping_orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON shipping_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON return_orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON return_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON stock_alerts FOR SELECT TO anon USING (true);

-- Service role full access (for sync functions + API)
CREATE POLICY "service_all" ON purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON purchase_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON warehouse_locations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON shipping_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON shipping_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON return_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON return_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON stock_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- RPC FUNCTIONS
-- ============================================================


-- === RPC: Naechste PO-Nummer generieren ===
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('purchase_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'PO-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Naechste Versand-ID generieren ===
CREATE OR REPLACE FUNCTION generate_shipping_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('shipping_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'VS-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Naechste Return-ID generieren ===
CREATE OR REPLACE FUNCTION generate_return_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
  year_str TEXT;
BEGIN
  next_val := nextval('return_order_seq');
  year_str := to_char(NOW(), 'YYYY');
  RETURN 'RMA-' || year_str || '-' || lpad(next_val::TEXT, 4, '0');
END;
$$;


-- === RPC: Lagerbestand-Zusammenfassung ===
-- Returns aggregated stock counts per component_type and warehouse
-- Counts from hardware_positions WHERE is_current = true AND position = 'lager'
CREATE OR REPLACE FUNCTION get_stock_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- Stock counts from current lager positions
  lager_counts AS (
    SELECT
      component_type,
      COALESCE(sub_position, 'Hauptlager') AS warehouse,
      COUNT(*) AS count,
      -- Group by sub_position for warehouse zone breakdown
      array_agg(DISTINCT serial_number) FILTER (WHERE serial_number IS NOT NULL) AS serial_numbers
    FROM hardware_positions
    WHERE is_current = TRUE
      AND position = 'lager'
    GROUP BY component_type, COALESCE(sub_position, 'Hauptlager')
  ),

  -- Total per component type (across all warehouses)
  type_totals AS (
    SELECT
      component_type,
      SUM(count)::INTEGER AS total_count
    FROM lager_counts
    GROUP BY component_type
  ),

  -- Grand total
  grand_total AS (
    SELECT COALESCE(SUM(count), 0)::INTEGER AS total
    FROM lager_counts
  ),

  -- Stock alerts that are currently triggered
  triggered_alerts AS (
    SELECT json_agg(
      json_build_object(
        'component_type', sa.component_type,
        'warehouse', sa.warehouse,
        'min_stock', sa.min_stock,
        'current_stock', COALESCE(lc.count, 0),
        'deficit', sa.min_stock - COALESCE(lc.count, 0)
      )
    ) AS alerts
    FROM stock_alerts sa
    LEFT JOIN lager_counts lc
      ON lc.component_type = sa.component_type
      AND lc.warehouse = sa.warehouse
    WHERE sa.alert_active = TRUE
      AND COALESCE(lc.count, 0) < sa.min_stock
  ),

  -- Breakdown per warehouse and type
  warehouse_breakdown AS (
    SELECT json_agg(
      json_build_object(
        'component_type', component_type,
        'warehouse', warehouse,
        'count', count
      )
    ) AS breakdown
    FROM lager_counts
  ),

  -- Type summary
  type_summary AS (
    SELECT json_object_agg(
      component_type, total_count
    ) AS by_type
    FROM type_totals
  )

  SELECT json_build_object(
    'totalStock', gt.total,
    'byType', COALESCE(ts.by_type, '{}'::json),
    'breakdown', COALESCE(wb.breakdown, '[]'::json),
    'alerts', COALESCE(ta.alerts, '[]'::json),
    'computedAt', NOW()
  ) INTO result
  FROM grand_total gt
  CROSS JOIN type_summary ts
  CROSS JOIN warehouse_breakdown wb
  CROSS JOIN triggered_alerts ta;

  RETURN result;
END;
$$;


-- === RPC: Kommissionierung (Pick for Shipping) ===
-- Marks an item as picked from warehouse and updates hardware position
CREATE OR REPLACE FUNCTION pick_for_shipping(
  p_shipping_order_id BIGINT,
  p_serial_number TEXT,
  p_picked_by TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id BIGINT;
  v_component_type TEXT;
  v_hardware_id TEXT;
  v_position_id BIGINT;
BEGIN
  -- Find the shipping order item by serial number
  SELECT soi.id, soi.component_type, soi.hardware_id
  INTO v_item_id, v_component_type, v_hardware_id
  FROM shipping_order_items soi
  WHERE soi.shipping_order_id = p_shipping_order_id
    AND soi.serial_number = p_serial_number
    AND soi.picked = FALSE
  LIMIT 1;

  -- Check if item was found
  IF v_item_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Item not found or already picked: ' || p_serial_number
    );
  END IF;

  -- Mark shipping order item as picked
  UPDATE shipping_order_items
  SET
    picked = TRUE,
    picked_at = NOW(),
    picked_by = p_picked_by
  WHERE id = v_item_id;

  -- Update hardware position from 'lager' to 'versand' using existing RPC
  IF v_hardware_id IS NOT NULL THEN
    SELECT update_hardware_position(
      p_component_type := v_component_type,
      p_hardware_id := v_hardware_id,
      p_serial_number := p_serial_number,
      p_position := 'versand',
      p_sub_position := 'Versandauftrag ' || (
        SELECT shipping_id FROM shipping_orders WHERE id = p_shipping_order_id
      ),
      p_moved_by := p_picked_by,
      p_move_reason := 'shipping',
      p_reference_id := (
        SELECT shipping_id FROM shipping_orders WHERE id = p_shipping_order_id
      )
    ) INTO v_position_id;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'item_id', v_item_id,
    'position_id', v_position_id,
    'serial_number', p_serial_number,
    'picked_by', p_picked_by,
    'picked_at', NOW()
  );
END;
$$;


-- === RPC: Receive Purchase Order Items (Wareneingang fuer Bestellung) ===
-- Convenience function to receive items against a PO and update counts
CREATE OR REPLACE FUNCTION receive_po_item(
  p_po_id BIGINT,
  p_item_id BIGINT,
  p_quantity INTEGER,
  p_serial_numbers TEXT[] DEFAULT NULL,
  p_received_by TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_new_received INTEGER;
  v_item_status TEXT;
  v_po_total INTEGER;
  v_po_received INTEGER;
  v_po_status TEXT;
BEGIN
  -- Get current item state
  SELECT * INTO v_item
  FROM purchase_order_items
  WHERE id = p_item_id AND po_id = p_po_id;

  IF v_item IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Item not found');
  END IF;

  -- Calculate new received quantity
  v_new_received := v_item.received_quantity + p_quantity;

  -- Determine item status
  IF v_new_received >= v_item.quantity THEN
    v_item_status := 'vollstaendig';
    v_new_received := v_item.quantity; -- Cap at ordered quantity
  ELSE
    v_item_status := 'teilgeliefert';
  END IF;

  -- Update item
  UPDATE purchase_order_items
  SET
    received_quantity = v_new_received,
    status = v_item_status,
    serial_numbers = COALESCE(serial_numbers, '{}') || COALESCE(p_serial_numbers, '{}')
  WHERE id = p_item_id;

  -- Recalculate PO totals
  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(received_quantity), 0)
  INTO v_po_total, v_po_received
  FROM purchase_order_items
  WHERE po_id = p_po_id;

  -- Determine PO status
  IF v_po_received >= v_po_total THEN
    v_po_status := 'vollstaendig';
  ELSIF v_po_received > 0 THEN
    v_po_status := 'teilgeliefert';
  ELSE
    v_po_status := 'bestellt';
  END IF;

  -- Update PO
  UPDATE purchase_orders
  SET
    total_items = v_po_total,
    received_items = v_po_received,
    status = v_po_status,
    updated_at = NOW()
  WHERE id = p_po_id;

  RETURN json_build_object(
    'success', TRUE,
    'item_id', p_item_id,
    'received_quantity', v_new_received,
    'item_status', v_item_status,
    'po_total_items', v_po_total,
    'po_received_items', v_po_received,
    'po_status', v_po_status
  );
END;
$$;


-- ============================================================
-- VIEWS
-- ============================================================


-- === View: Lagerbestand-Uebersicht ===
-- Aggregates current lager positions by component_type with counts
CREATE OR REPLACE VIEW stock_overview AS
SELECT
  hp.component_type,
  COALESCE(hp.sub_position, 'Hauptlager') AS warehouse,
  COUNT(*) AS item_count,
  array_agg(hp.hardware_id ORDER BY hp.hardware_id) AS hardware_ids,
  array_agg(hp.serial_number ORDER BY hp.serial_number) FILTER (WHERE hp.serial_number IS NOT NULL) AS serial_numbers,
  MIN(hp.created_at) AS oldest_entry,
  MAX(hp.created_at) AS newest_entry
FROM hardware_positions hp
WHERE hp.is_current = TRUE
  AND hp.position = 'lager'
GROUP BY hp.component_type, COALESCE(hp.sub_position, 'Hauptlager')
ORDER BY hp.component_type, warehouse;


-- === View: Purchase Orders mit Item-Counts ===
CREATE OR REPLACE VIEW purchase_orders_overview AS
SELECT
  po.id,
  po.po_number,
  po.order_date,
  po.expected_delivery,
  po.supplier,
  po.supplier_reference,
  po.status,
  po.total_items,
  po.received_items,
  po.created_by,
  po.created_at,
  po.updated_at,
  COUNT(poi.id) AS line_count,
  COALESCE(SUM(poi.quantity), 0)::INTEGER AS total_quantity,
  COALESCE(SUM(poi.received_quantity), 0)::INTEGER AS total_received,
  COALESCE(SUM(poi.quantity * poi.unit_price), 0)::NUMERIC(12,2) AS total_value,
  -- Delivery status
  CASE
    WHEN po.expected_delivery IS NULL THEN 'kein_termin'
    WHEN po.expected_delivery < CURRENT_DATE AND po.status NOT IN ('vollstaendig', 'storniert') THEN 'ueberfaellig'
    WHEN po.expected_delivery <= CURRENT_DATE + INTERVAL '3 days' AND po.status NOT IN ('vollstaendig', 'storniert') THEN 'bald_faellig'
    ELSE 'im_plan'
  END AS delivery_status
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
GROUP BY po.id;


-- === View: Shipping Orders mit Item-Counts ===
CREATE OR REPLACE VIEW shipping_orders_overview AS
SELECT
  so.id,
  so.shipping_id,
  so.order_date,
  so.destination_type,
  so.destination_name,
  so.destination_address,
  so.carrier,
  so.tracking_number,
  so.packaging_type,
  so.status,
  so.shipped_at,
  so.delivered_at,
  so.created_by,
  so.created_at,
  COUNT(soi.id) AS item_count,
  COUNT(soi.id) FILTER (WHERE soi.picked = TRUE) AS picked_count,
  -- All items picked?
  CASE
    WHEN COUNT(soi.id) = 0 THEN FALSE
    ELSE COUNT(soi.id) = COUNT(soi.id) FILTER (WHERE soi.picked = TRUE)
  END AS fully_picked
FROM shipping_orders so
LEFT JOIN shipping_order_items soi ON soi.shipping_order_id = so.id
GROUP BY so.id;


-- === View: Return Orders mit Item-Counts ===
CREATE OR REPLACE VIEW return_orders_overview AS
SELECT
  ro.id,
  ro.return_id,
  ro.return_date,
  ro.source_type,
  ro.source_name,
  ro.reason,
  ro.reference_id,
  ro.carrier,
  ro.tracking_number,
  ro.status,
  ro.inspection_result,
  ro.decision,
  ro.decided_at,
  ro.decided_by,
  ro.created_by,
  ro.created_at,
  COUNT(roi.id) AS item_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'ok') AS ok_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'beschaedigt') AS damaged_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'defekt') AS defect_count,
  COUNT(roi.id) FILTER (WHERE roi.condition = 'ungeprueft') AS unchecked_count
FROM return_orders ro
LEFT JOIN return_order_items roi ON roi.return_order_id = ro.id
GROUP BY ro.id;


-- ============================================================
-- TRIGGER: Auto-update updated_at on modification
-- ============================================================

-- Reusable trigger function (create only if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_shipping_orders_updated_at
  BEFORE UPDATE ON shipping_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_return_orders_updated_at
  BEFORE UPDATE ON return_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_stock_alerts_updated_at
  BEFORE UPDATE ON stock_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- GRANT EXECUTE on RPC functions
-- ============================================================

GRANT EXECUTE ON FUNCTION generate_po_number() TO anon;
GRANT EXECUTE ON FUNCTION generate_po_number() TO authenticated;

GRANT EXECUTE ON FUNCTION generate_shipping_id() TO anon;
GRANT EXECUTE ON FUNCTION generate_shipping_id() TO authenticated;

GRANT EXECUTE ON FUNCTION generate_return_id() TO anon;
GRANT EXECUTE ON FUNCTION generate_return_id() TO authenticated;

GRANT EXECUTE ON FUNCTION get_stock_summary() TO anon;
GRANT EXECUTE ON FUNCTION get_stock_summary() TO authenticated;

GRANT EXECUTE ON FUNCTION pick_for_shipping(BIGINT, TEXT, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION receive_po_item(BIGINT, BIGINT, INTEGER, TEXT[], TEXT) TO authenticated;
