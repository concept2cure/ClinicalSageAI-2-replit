CREATE TABLE IF NOT EXISTS trials (
  id SERIAL PRIMARY KEY,
  trial_id TEXT UNIQUE,
  nct_id TEXT,
  csr_id TEXT, 
  title TEXT NOT NULL,
  sponsor TEXT NOT NULL,
  indication TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  start_date DATE,
  source TEXT NOT NULL,
  country TEXT,
  file_path TEXT,
  file_size INTEGER,
  imported_date TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP
);