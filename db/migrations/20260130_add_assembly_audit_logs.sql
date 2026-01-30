CREATE TABLE assembly_audit_logs (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  request_text TEXT,
  response_text TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);
