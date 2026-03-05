-- ============================================================
-- DROP ALL JET TABLES FROM FLINK_DOOH SUPABASE
-- ============================================================
-- Target: nrijgfcdlvuhhudasicd (Flink_DooH)
-- Purpose: Remove ALL old JET tables so Flink starts clean
--
-- USAGE: Run in Supabase SQL Editor
-- WARNING: This drops ALL tables, views, functions, and triggers!
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP ALL VIEWS FIRST (they depend on tables)
-- ============================================================
DROP VIEW IF EXISTS stock_overview CASCADE;
DROP VIEW IF EXISTS v_venue_status CASCADE;
DROP VIEW IF EXISTS purchase_orders_overview CASCADE;
DROP VIEW IF EXISTS return_orders_overview CASCADE;
DROP VIEW IF EXISTS shipping_orders_overview CASCADE;

-- ============================================================
-- 2. DROP ALL TABLES (CASCADE removes FK constraints)
-- ============================================================

-- Airtable sync tables (JET data)
DROP TABLE IF EXISTS stammdaten CASCADE;
DROP TABLE IF EXISTS airtable_displays CASCADE;
DROP TABLE IF EXISTS acquisition CASCADE;
DROP TABLE IF EXISTS installationen CASCADE;
DROP TABLE IF EXISTS installationstermine CASCADE;
DROP TABLE IF EXISTS communications CASCADE;
DROP TABLE IF EXISTS chg_approvals CASCADE;
DROP TABLE IF EXISTS dayn_screens CASCADE;
DROP TABLE IF EXISTS display_heartbeats CASCADE;
DROP TABLE IF EXISTS display_first_seen CASCADE;

-- Hardware tables
DROP TABLE IF EXISTS hardware_ops CASCADE;
DROP TABLE IF EXISTS hardware_sim CASCADE;
DROP TABLE IF EXISTS hardware_displays CASCADE;
DROP TABLE IF EXISTS hardware_swaps CASCADE;
DROP TABLE IF EXISTS hardware_deinstalls CASCADE;
DROP TABLE IF EXISTS hardware_positions CASCADE;

-- Vistar / Programmatic
DROP TABLE IF EXISTS vistar_venues CASCADE;
DROP TABLE IF EXISTS vistar_networks CASCADE;
DROP TABLE IF EXISTS vistar_venue_health CASCADE;
DROP TABLE IF EXISTS vistar_sync_log CASCADE;

-- Install booking system
DROP TABLE IF EXISTS install_bookings CASCADE;
DROP TABLE IF EXISTS install_teams CASCADE;
DROP TABLE IF EXISTS install_routen CASCADE;
DROP TABLE IF EXISTS booking_activity_log CASCADE;

-- App tables
DROP TABLE IF EXISTS app_users CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS agent_memory CASCADE;
DROP TABLE IF EXISTS feedback_requests CASCADE;
DROP TABLE IF EXISTS phone_call_logs CASCADE;
DROP TABLE IF EXISTS akquise_activity_log CASCADE;
DROP TABLE IF EXISTS api_usage_log CASCADE;

-- Warehouse / Orders
DROP TABLE IF EXISTS warehouse_locations CASCADE;
DROP TABLE IF EXISTS stock_alerts CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS return_order_items CASCADE;
DROP TABLE IF EXISTS return_orders CASCADE;
DROP TABLE IF EXISTS shipping_order_items CASCADE;
DROP TABLE IF EXISTS shipping_orders CASCADE;
DROP TABLE IF EXISTS goods_receipts CASCADE;
DROP TABLE IF EXISTS bank_leasing CASCADE;

-- Sync / Attachment metadata
DROP TABLE IF EXISTS sync_metadata CASCADE;
DROP TABLE IF EXISTS attachment_sync_log CASCADE;
DROP TABLE IF EXISTS attachment_cache CASCADE;

-- NocoDB tables
DROP TABLE IF EXISTS nocodb_sim_kunden CASCADE;
DROP TABLE IF EXISTS nocodb_vistar_navori CASCADE;
DROP TABLE IF EXISTS nocodb_vorbereitet CASCADE;

-- FAW
DROP TABLE IF EXISTS faw_data CASCADE;

-- Original Flink tables (also dropping for clean slate)
DROP TABLE IF EXISTS task_comments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS installation_checklists CASCADE;
DROP TABLE IF EXISTS installations CASCADE;
DROP TABLE IF EXISTS location_status_history CASCADE;
DROP TABLE IF EXISTS displays CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================
-- 3. DROP ALL RPC FUNCTIONS
-- ============================================================
DROP FUNCTION IF EXISTS get_dashboard_kpis() CASCADE;
DROP FUNCTION IF EXISTS get_kpi_summary(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_mobile_kpis() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================
-- 4. DROP SEQUENCES
-- ============================================================
DROP SEQUENCE IF EXISTS booking_number_seq CASCADE;

COMMIT;

-- ============================================================
-- DONE! Flink_DooH Supabase is now clean.
-- Next step: Set up the tables that Flink actually needs.
-- ============================================================
