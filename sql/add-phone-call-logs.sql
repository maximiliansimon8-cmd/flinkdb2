-- =============================================
-- Phone Call Logs + Wiedervorlage (Callback Scheduling)
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add callback_date to install_bookings
ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS callback_date DATE,
  ADD COLUMN IF NOT EXISTS callback_reason TEXT;

-- 2. Create phone_call_logs table for full call history
CREATE TABLE IF NOT EXISTS phone_call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES install_bookings(id) ON DELETE CASCADE,
  called_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('reached', 'not_reached', 'booked', 'callback', 'declined', 'wrong_number', 'voicemail')),
  notes TEXT,
  callback_date DATE,
  duration_seconds INTEGER,
  caller_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_booking ON phone_call_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_called_at ON phone_call_logs(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_callback ON phone_call_logs(callback_date) WHERE callback_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_install_bookings_callback ON install_bookings(callback_date) WHERE callback_date IS NOT NULL;

-- 3. Enable RLS
ALTER TABLE phone_call_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write
CREATE POLICY "Allow all for authenticated users" ON phone_call_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon access (for Netlify Functions with service role key)
CREATE POLICY "Allow all for anon" ON phone_call_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);
