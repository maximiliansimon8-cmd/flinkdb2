-- ============================================================
-- Akquise Automation: 4 Tabellen + Feature Flags
-- Für WhatsApp KI-Akquise (SuperChat + Anthropic)
-- ============================================================

-- 1. Kampagnen
CREATE TABLE IF NOT EXISTS akquise_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, active, paused, completed
  target_filter JSONB DEFAULT '{}',      -- { cities: [], lead_statuses: ['New Lead'] }
  template_id TEXT NOT NULL,
  created_by TEXT,
  total_leads INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  response_count INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE akquise_campaigns ENABLE ROW LEVEL SECURITY;

-- 2. Gespräche (State Machine)
CREATE TABLE IF NOT EXISTS akquise_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES akquise_campaigns(id),
  akquise_airtable_id TEXT NOT NULL,

  -- Kontakt (denormalisiert)
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  location_name TEXT,
  city TEXT,
  jet_id TEXT,

  -- SuperChat Referenzen
  superchat_contact_id TEXT,
  superchat_conversation_id TEXT,

  -- State Machine
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending → template_sent → in_conversation → interested → qualified → convinced → signed
  -- Alternativ: → disqualified / declined / unresponsive / error

  -- Zeitpunkte
  template_sent_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  window_expires_at TIMESTAMPTZ,       -- 24h ab first_response
  signature_sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,

  -- Signatur
  signature_token TEXT UNIQUE,
  signature_data JSONB,                 -- { image_base64, signed_at, ip_address }

  -- KI-Tracking
  ai_message_count INT DEFAULT 0,
  total_message_count INT DEFAULT 0,
  ai_sentiment TEXT,                    -- positive, neutral, negative, objection
  ai_last_summary TEXT,

  -- Follow-Up
  follow_up_count INT DEFAULT 0,
  next_follow_up_at TIMESTAMPTZ,

  -- Meta
  error_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_conv_status ON akquise_conversations(status);
CREATE INDEX IF NOT EXISTS idx_akquise_conv_phone ON akquise_conversations(contact_phone);
CREATE INDEX IF NOT EXISTS idx_akquise_conv_airtable ON akquise_conversations(akquise_airtable_id);
CREATE INDEX IF NOT EXISTS idx_akquise_conv_campaign ON akquise_conversations(campaign_id);
ALTER TABLE akquise_conversations ENABLE ROW LEVEL SECURITY;

-- 3. Nachrichten
CREATE TABLE IF NOT EXISTS akquise_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES akquise_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,               -- outbound / inbound
  sender TEXT NOT NULL,                  -- bot, ai, user, prospect, system
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',      -- text, template, image, system
  superchat_message_id TEXT,
  template_id TEXT,
  ai_model TEXT,
  ai_tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_msg_conv ON akquise_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_akquise_msg_created ON akquise_messages(created_at);
ALTER TABLE akquise_messages ENABLE ROW LEVEL SECURITY;

-- 4. Activity Log
CREATE TABLE IF NOT EXISTS akquise_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT DEFAULT 'KI-Bot',
  action TEXT NOT NULL,
  conversation_id UUID REFERENCES akquise_conversations(id),
  akquise_airtable_id TEXT,
  location_name TEXT,
  city TEXT,
  detail JSONB DEFAULT '{}',
  source TEXT DEFAULT 'automation',      -- automation, manual, webhook
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akquise_log_action ON akquise_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_akquise_log_created ON akquise_activity_log(created_at DESC);
ALTER TABLE akquise_activity_log ENABLE ROW LEVEL SECURITY;

-- 5. Feature Flags
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('akquise_automation_enabled', false, 'Master-Switch: KI-Akquise Automation aktivieren'),
  ('akquise_ai_bot_enabled', false, 'KI-Bot Auto-Antworten auf eingehende WhatsApp-Nachrichten'),
  ('akquise_test_phone', false, '+491234567890'),
  ('akquise_max_daily_sends', true, '50')
ON CONFLICT (key) DO NOTHING;
