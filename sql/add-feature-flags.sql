-- Feature Flags table for runtime configuration
-- Used to control features like SuperChat/WhatsApp messaging
-- without needing code deployments.

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Everyone can read flags (needed by Netlify Functions + Frontend)
CREATE POLICY "Anyone can read feature flags"
  ON feature_flags FOR SELECT
  USING (true);

-- Only authenticated users can update flags
CREATE POLICY "Authenticated users can update feature flags"
  ON feature_flags FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Only service_role can insert/delete
CREATE POLICY "Service role can manage feature flags"
  ON feature_flags FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed: SuperChat/WhatsApp messaging — OFF by default
INSERT INTO feature_flags (key, enabled, description)
VALUES ('superchat_enabled', false, 'WhatsApp-Nachrichten via SuperChat API senden. Wenn deaktiviert, werden Buchungen/Einladungen trotzdem erstellt, aber keine WhatsApp-Nachrichten versendet.')
ON CONFLICT (key) DO NOTHING;

-- Seed: SuperChat test phone — when enabled, ALL WhatsApp messages are redirected
-- to the phone number in the description field (e.g. +491234567890).
-- Use this for testing the flow without messaging real customers.
INSERT INTO feature_flags (key, enabled, description)
VALUES ('superchat_test_phone', false, '+491234567890')
ON CONFLICT (key) DO NOTHING;

-- Grant access
GRANT SELECT ON feature_flags TO anon;
GRANT SELECT, UPDATE ON feature_flags TO authenticated;
GRANT ALL ON feature_flags TO service_role;
