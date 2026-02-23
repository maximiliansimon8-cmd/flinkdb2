-- Migration: Add confirmed_at column to install_bookings
-- Date: 2026-02-17
-- Reason: The code in install-booker-status.js sets confirmed_at when a booking
-- is confirmed, but the column was missing from the original schema.
-- PostgREST silently ignores unknown columns, so confirmed_at data was being lost.

-- Add confirmed_at column if it doesn't exist
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Also verify booked_at exists (was in original schema but let's be safe)
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ;

-- Add updated_at if missing (used by status update operations)
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill confirmed_at for existing confirmed bookings (estimate from updated_at or created_at)
UPDATE install_bookings
SET confirmed_at = COALESCE(updated_at, created_at)
WHERE status = 'confirmed' AND confirmed_at IS NULL;
