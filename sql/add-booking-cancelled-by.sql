-- Migration: Add cancelled_by tracking to install_bookings
-- Tracks WHO cancelled a booking and optionally WHY
-- 2026-02-26

ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID;
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS cancelled_by_user_name TEXT;
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Index for querying recent cancellations
CREATE INDEX IF NOT EXISTS idx_install_bookings_cancelled_at ON install_bookings (cancelled_at) WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN install_bookings.cancelled_by_user_id IS 'Supabase user ID of who cancelled this booking';
COMMENT ON COLUMN install_bookings.cancelled_by_user_name IS 'Display name of user who cancelled';
COMMENT ON COLUMN install_bookings.cancelled_reason IS 'Optional reason for cancellation';
COMMENT ON COLUMN install_bookings.cancelled_at IS 'Timestamp when cancellation happened';
