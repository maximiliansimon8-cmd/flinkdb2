CREATE TABLE IF NOT EXISTS feedback_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  type TEXT NOT NULL CHECK (type IN ('feature', 'bug', 'question')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'planned', 'in_progress', 'done', 'rejected')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_requests(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_requests(created_at DESC);

ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON feedback_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON feedback_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "service_all" ON feedback_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON feedback_requests FOR SELECT TO anon USING (true);
