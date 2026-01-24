ALTER TABLE documents
  ADD COLUMN locked_by UUID REFERENCES users(id),
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN lock_expires TIMESTAMPTZ;