-- Add missing 'path' column to projects table
-- Materialized path for hierarchy queries (e.g. "1/5/12")
-- Drizzle schema already defines this column but it was missing from the DB
ALTER TABLE projects ADD COLUMN IF NOT EXISTS path text;

-- Index for fast ancestor/descendant queries
CREATE INDEX IF NOT EXISTS projects_path_idx ON projects (path);
