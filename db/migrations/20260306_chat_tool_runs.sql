-- Persistent execution ledger for LLM tool invocations
-- Enables: replay, audit trail, analytics, debugging
CREATE TABLE IF NOT EXISTS chat_tool_runs (
  id SERIAL PRIMARY KEY,
  thread_id TEXT,
  project_id INTEGER,
  user_id INTEGER,
  organization_id INTEGER,
  tool_name TEXT NOT NULL,
  arguments JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_tool_runs_thread ON chat_tool_runs(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_tool_runs_project ON chat_tool_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_tool_runs_tool ON chat_tool_runs(tool_name);
