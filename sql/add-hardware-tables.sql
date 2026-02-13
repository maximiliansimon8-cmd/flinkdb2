-- ============================================================
-- Hardware Inventory & Lifecycle Management Tables
-- Run this in the Supabase SQL Editor
-- ============================================================


-- === 1. OPS Player Inventory ===
CREATE TABLE IF NOT EXISTS hardware_ops (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  ops_nr TEXT,                            -- OPS Nummer (z.B. "239")
  status TEXT,                            -- active | defect | prep/warehouse | out for installation | test device
  ops_sn TEXT,                            -- Seriennummer (z.B. ISS088X255G0196)
  hardware_type TEXT,                     -- z.B. JWIPC_S088
  navori_venue_id TEXT,
  sim_record_id TEXT,                     -- Link zur SIM
  sim_id TEXT,                            -- SIM-ID (lookup)
  display_record_id TEXT,                 -- Link zum Display
  display_sn TEXT,                        -- Display SN (lookup)
  display_location_id TEXT,               -- Link zur Live Display Location
  location_online_status TEXT,            -- Online Status (lookup)
  partner_id TEXT,                        -- Link zum Partner/Warehouse
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_ops_status ON hardware_ops(status);
CREATE INDEX IF NOT EXISTS idx_hw_ops_nr ON hardware_ops(ops_nr);
CREATE INDEX IF NOT EXISTS idx_hw_ops_location ON hardware_ops(display_location_id);


-- === 2. SIM Card Inventory ===
CREATE TABLE IF NOT EXISTS hardware_sim (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  sim_id TEXT,                            -- ICCID Nummer
  activate_date DATE,
  ops_record_id TEXT,                     -- Link zum OPS Player
  status TEXT,                            -- active | defect | prep/warehouse
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_sim_id ON hardware_sim(sim_id);


-- === 3. Display Inventory ===
CREATE TABLE IF NOT EXISTS hardware_displays (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  display_serial_number TEXT,
  location TEXT,
  ops_record_id TEXT,                     -- Link zum OPS Player
  status TEXT,                            -- active | defect | prep/warehouse
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hw_display_sn ON hardware_displays(display_serial_number);


-- === 4. CHG Approval (Leasing aus Airtable) ===
CREATE TABLE IF NOT EXISTS chg_approvals (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  jet_id_location TEXT,
  asset_id TEXT,                          -- Bank Asset-ID
  display_sn TEXT,                        -- Display Seriennummer (Matching-Key!)
  integrator_invoice_no TEXT,
  chg_certificate TEXT,                   -- Installation certificate at the bank (CHG)
  invoice_date DATE,
  rental_start DATE,
  rental_end DATE,
  payment_released_on DATE,
  payment_released_by TEXT,
  status TEXT,                            -- Approved, etc.
  installation_id TEXT,                   -- Link zur Installation
  inspection_status TEXT[],               -- Lookup
  display_id TEXT[],                      -- Lookup DisplayID
  location_name TEXT[],
  city TEXT[],
  address TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chg_asset ON chg_approvals(asset_id);
CREATE INDEX IF NOT EXISTS idx_chg_display_sn ON chg_approvals(display_sn);
CREATE INDEX IF NOT EXISTS idx_chg_rental ON chg_approvals(rental_start, rental_end);


-- === 5. Bank Leasing (TESMA/CHG-MERIDIAN Export) ===
CREATE TABLE IF NOT EXISTS bank_leasing (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id TEXT UNIQUE,                   -- CHG Asset ID (Matching-Key!)
  serial_number TEXT,                     -- Display Seriennummer
  asset_class TEXT,
  designation TEXT,                       -- Produktbezeichnung (z.B. "55BDL4002H/00")
  contract_status TEXT,                   -- "In Miete" etc.
  customer TEXT,
  customer_id INTEGER,
  rental_certificate TEXT,                -- Mietschein-Nr
  rental_start DATE,
  rental_end_planned DATE,
  rental_end_actual DATE,
  monthly_price NUMERIC(8,2),
  currency TEXT DEFAULT 'EUR',
  order_number TEXT,                      -- Bestellnummer (can match JET ID)
  installation_location TEXT,             -- Standort-Name
  cost_center TEXT,                       -- Adresse (Straße)
  city TEXT,
  manufacturer TEXT,                      -- "Philips"
  lessor_id INTEGER,
  lessor TEXT,                            -- "CHG-MERIDIAN AG"
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_serial ON bank_leasing(serial_number);
CREATE INDEX IF NOT EXISTS idx_bank_asset ON bank_leasing(asset_id);
CREATE INDEX IF NOT EXISTS idx_bank_rental_cert ON bank_leasing(rental_certificate);


-- === 6. Hardware Swaps (Tausch-Auftraege) ===
CREATE TABLE IF NOT EXISTS hardware_swaps (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  swap_id TEXT,                           -- SWAP-2025-0001
  display_location_id TEXT,               -- Link zur Live Display Location
  swap_type TEXT[],                       -- OPS | Display | SIM | Komplett-Set
  swap_date DATE,
  swap_reason TEXT,                       -- Defekt | Upgrade | Kundenanfrage | Sonstiges
  partner_id TEXT,
  technician TEXT,
  old_hardware_ids TEXT[],                -- Links zu alten OPS/SIM/Display
  new_hardware_ids TEXT[],                -- Links zu neuen OPS/SIM/Display
  defect_description TEXT,
  status TEXT,                            -- Geplant | Abgeschlossen
  location_name TEXT,                     -- Lookup
  city TEXT,                              -- Lookup
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_location ON hardware_swaps(display_location_id);
CREATE INDEX IF NOT EXISTS idx_swap_status ON hardware_swaps(status);


-- === 7. Deinstallations-Auftraege ===
CREATE TABLE IF NOT EXISTS hardware_deinstalls (
  id TEXT PRIMARY KEY,                    -- Airtable record ID
  deinstall_id TEXT,                      -- DEINST-2025-0001
  display_location_id TEXT,
  ops_record_id TEXT,                     -- Link zum OPS/Hardware-Set
  deinstall_date DATE,
  reason TEXT,                            -- Kuendigung | Umbau | Vertragsende | Sonstiges
  partner_id TEXT,                        -- Ausfuehrender Partner = neues Warehouse
  technician TEXT,
  hardware_condition TEXT,                -- Einwandfrei | Beschaedigt | Defekt | Pruefung noetig
  condition_description TEXT,
  status TEXT,                            -- Geplant | In Bearbeitung | Abgeschlossen
  location_name TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deinstall_location ON hardware_deinstalls(display_location_id);
CREATE INDEX IF NOT EXISTS idx_deinstall_status ON hardware_deinstalls(status);


-- === RLS fuer alle neuen Tabellen ===
ALTER TABLE hardware_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_sim ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE chg_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_leasing ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_deinstalls ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "auth_read" ON hardware_ops FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_sim FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_displays FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON chg_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON bank_leasing FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_swaps FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON hardware_deinstalls FOR SELECT TO authenticated USING (true);

-- Service Role full access (for sync functions + bank import)
CREATE POLICY "service_all" ON hardware_ops FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_sim FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_displays FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON chg_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON bank_leasing FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_swaps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON hardware_deinstalls FOR ALL TO service_role USING (true) WITH CHECK (true);
