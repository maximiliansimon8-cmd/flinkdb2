-- Add Booking Status fields to acquisition table
-- These fields are synced from Airtable and track whether a location has been invited
-- for an installation booking, even if no install_bookings record exists.

ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT NULL;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS booking_token TEXT DEFAULT NULL;
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS booking_link_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering by booking status (used in InviteManager)
CREATE INDEX IF NOT EXISTS idx_acquisition_booking_status ON acquisition (booking_status) WHERE booking_status IS NOT NULL;
