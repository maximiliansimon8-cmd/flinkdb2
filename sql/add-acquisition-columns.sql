-- Add missing columns to acquisition table
-- Run this in Supabase SQL Editor

-- Unterschriftsdatum (contract signature date)
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS unterschriftsdatum TEXT;

-- Vertragsnummer (contract number)
ALTER TABLE acquisition ADD COLUMN IF NOT EXISTS vertragsnummer TEXT;

-- Also fix RLS: allow anon SELECT (currently blocks reads silently)
-- This is optional if using the supabase-proxy workaround
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'acquisition' AND policyname = 'anon_select_acquisition'
  ) THEN
    CREATE POLICY "anon_select_acquisition" ON acquisition FOR SELECT TO anon USING (true);
  END IF;
END $$;
