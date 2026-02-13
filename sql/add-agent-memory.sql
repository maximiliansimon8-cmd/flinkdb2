-- Agent Memory Table
-- Persistent memory for the JET Data Assistant
-- Stores insights, decisions, preferences, context, and user-pinned notes

CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('insight', 'decision', 'preference', 'context', 'pin')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  relevance_score INTEGER DEFAULT 5 CHECK (relevance_score BETWEEN 1 AND 10),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  use_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_memory_active ON agent_memory(active, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_category ON agent_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_created ON agent_memory(created_at DESC);

-- Row Level Security
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

-- Policies: service_role can do everything, anon/authenticated can read
CREATE POLICY "anon_read" ON agent_memory FOR SELECT TO anon USING (true);
CREATE POLICY "auth_read" ON agent_memory FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all" ON agent_memory FOR ALL TO service_role USING (true) WITH CHECK (true);
