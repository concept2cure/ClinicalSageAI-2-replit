CREATE TABLE assembly_docs (
  id TEXT PRIMARY KEY,
  status TEXT,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);