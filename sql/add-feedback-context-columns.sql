-- Migration: Add right-click context columns to feedback_requests
-- These columns capture the exact location and environment context
-- when a user reports a bug or gives feedback via the right-click widget.

-- Click coordinates (where the user right-clicked)
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS click_x INTEGER;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS click_y INTEGER;

-- Page context
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS component TEXT;

-- Environment
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS viewport_width INTEGER;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS viewport_height INTEGER;
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Extra context (filters, search terms, active tab, etc.)
ALTER TABLE feedback_requests ADD COLUMN IF NOT EXISTS context_data JSONB;

-- Update the type check constraint to include 'feedback' as a valid type
-- (the widget uses 'bug', 'feedback', 'feature' — existing table had 'feature', 'bug', 'question')
ALTER TABLE feedback_requests DROP CONSTRAINT IF EXISTS feedback_requests_type_check;
ALTER TABLE feedback_requests ADD CONSTRAINT feedback_requests_type_check
  CHECK (type IN ('feature', 'bug', 'question', 'feedback'));

-- Allow anon role to insert (the widget uses anon key)
CREATE POLICY IF NOT EXISTS "anon_insert" ON feedback_requests FOR INSERT TO anon WITH CHECK (true);
-- Allow anon role to update (for admin status changes via anon key)
CREATE POLICY IF NOT EXISTS "anon_update" ON feedback_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);
