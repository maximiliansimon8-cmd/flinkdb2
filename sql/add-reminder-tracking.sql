-- ══════════════════════════════════════════════════════════════
-- Add reminder tracking columns to install_bookings
-- Tracks when reminders were sent and how many
-- ══════════════════════════════════════════════════════════════

ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS reminder_count INT DEFAULT 0;

-- Index for efficient querying of pending bookings that need reminders
CREATE INDEX IF NOT EXISTS idx_install_bookings_reminder_pending
  ON install_bookings (status, created_at)
  WHERE status = 'pending' AND reminder_count = 0;
