-- Migration: Add user attribution columns to install_bookings
-- Date: 2026-02-20
-- Purpose: Track which dashboard user created/triggered each booking
--          Required for Team Analytics Dashboard

-- Step 1: Add columns (idempotent)
ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS created_by_user_name TEXT;

COMMENT ON COLUMN install_bookings.created_by_user_id IS 'Dashboard-User der die Buchung ausgeloest hat (NULL bei Self-Booking durch Kunde)';
COMMENT ON COLUMN install_bookings.created_by_user_name IS 'Name des Users zum Zeitpunkt der Erstellung (denormalisiert fuer schnelle Abfragen)';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
