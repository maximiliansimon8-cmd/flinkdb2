-- Add installer_team column to install_bookings
-- Allows direct team assignment per booking (independent of route)
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS installer_team TEXT;
ALTER TABLE install_bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
