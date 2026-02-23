-- Migration: Create booking_activity_log table
-- Date: 2026-02-20
-- Purpose: Central event log for ALL booking-related activities
--          (invites, calls, bookings, reminders, status changes)
--          Required for Team Analytics Dashboard

-- ═══ Table ═══
CREATE TABLE IF NOT EXISTS booking_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Actor (who performed the action)
  user_id   UUID REFERENCES app_users(id),
  user_name TEXT NOT NULL,

  -- Event type
  action TEXT NOT NULL CHECK (action IN (
    'invite_sent',              -- WhatsApp-Einladung gesendet
    'reminder_sent',            -- Erinnerung gesendet (automatisch)
    'phone_call',               -- Telefonat gefuehrt
    'booking_created',          -- Buchung manuell erstellt (Telefon/Portal)
    'booking_confirmed',        -- Buchung bestaetigt (Kunde hat gewaehlt)
    'booking_cancelled',        -- Buchung storniert
    'booking_completed',        -- Installation abgeschlossen
    'booking_rescheduled',      -- Termin verschoben
    'status_changed',           -- Status manuell geaendert
    'airtable_termin_created'   -- Termin in Airtable erstellt (via Sync erkannt)
  )),

  -- Context
  booking_id          UUID REFERENCES install_bookings(id) ON DELETE SET NULL,
  akquise_airtable_id TEXT,
  location_name       TEXT,
  city                TEXT,

  -- Flexible payload for action-specific data
  -- Examples:
  --   invite_sent:            { "channel": "whatsapp", "template": "InstallDate2" }
  --   phone_call:             { "outcome": "booked", "notes": "..." }
  --   booking_confirmed:      { "date": "2026-03-15", "time": "10:00", "source": "self_booking" }
  --   airtable_termin_created: { "created_by_airtable": "Max Simon", "terminstatus": "Geplant" }
  --   status_changed:         { "old_status": "pending", "new_status": "cancelled" }
  detail JSONB DEFAULT '{}',

  -- Origin of the action
  source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN (
    'portal',       -- Ueber das JET-Dashboard
    'bot',          -- KI-Chat-Agent / WhatsApp-Bot
    'airtable',     -- Direkt in Airtable erstellt
    'self_booking'  -- Kunde hat selbst gebucht (ueber Booking-Link)
  )),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ═══ Performance Indices ═══
CREATE INDEX IF NOT EXISTS idx_bal_user_id    ON booking_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bal_action     ON booking_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_bal_source     ON booking_activity_log(source);
CREATE INDEX IF NOT EXISTS idx_bal_created_at ON booking_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bal_city       ON booking_activity_log(city);

-- ═══ RLS (same pattern as phone_call_logs) ═══
ALTER TABLE booking_activity_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users (frontend via Supabase Anon Key with JWT)
CREATE POLICY "Allow all for authenticated users" ON booking_activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon role (Netlify Functions via Service Role Key bypass RLS anyway,
-- but this ensures direct Supabase client writes from scheduling app work)
CREATE POLICY "Allow all for anon" ON booking_activity_log
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
