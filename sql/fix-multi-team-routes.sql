-- ══════════════════════════════════════════════════════════════
-- Fix: Allow multiple teams per city+date
-- Drop the UNIQUE constraint on (city, schedule_date) 
-- to support parallel installation teams
-- ══════════════════════════════════════════════════════════════

ALTER TABLE install_routen 
  DROP CONSTRAINT IF EXISTS install_routen_city_schedule_date_key;

-- Also add a UNIQUE constraint on (city, schedule_date, installer_team) 
-- to prevent exact duplicates (same team, same city, same date)
ALTER TABLE install_routen 
  ADD CONSTRAINT install_routen_city_date_team_key 
  UNIQUE (city, schedule_date, installer_team);

-- ══════════════════════════════════════════════════════════════
-- Team Management Table
-- Predefined teams with names, so no one enters typos
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS install_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#FF8000',
  is_active BOOLEAN DEFAULT true,
  members JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE install_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON install_teams
  FOR SELECT USING (true);

CREATE POLICY "Allow all for service role" ON install_teams
  FOR ALL USING (true);

-- Seed some default teams
INSERT INTO install_teams (name, description, color) VALUES
  ('Team Alpha', 'Primäres Installationsteam', '#3b82f6'),
  ('Team Beta', 'Zweites Installationsteam', '#22c55e'),
  ('Team Gamma', 'Drittes Installationsteam', '#f59e0b')
ON CONFLICT (name) DO NOTHING;

-- Remove test data we created earlier
DELETE FROM install_routen WHERE installer_team = 'Team Test';

