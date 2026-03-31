-- Regulatory Correspondence OS foundation (phase scaffold)
-- Adds normalized submission lifecycle + correspondence + issue + response package entities.

CREATE TABLE IF NOT EXISTS c2c_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  submission_type TEXT NOT NULL,
  regulator TEXT NOT NULL,
  center TEXT,
  division TEXT,
  application_number TEXT,
  sequence_number TEXT,
  lifecycle_state TEXT NOT NULL,
  clock_metadata JSONB DEFAULT '{}'::jsonb,
  linked_artifact_ids JSONB DEFAULT '[]'::jsonb,
  linked_communication_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS c2c_mailbox_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL,
  mailbox_identifier TEXT NOT NULL,
  auth_state TEXT NOT NULL,
  token_reference TEXT,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  cursor TEXT,
  last_sync_at TIMESTAMP,
  error_state TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS c2c_correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  submission_id UUID NOT NULL REFERENCES c2c_submissions(id),
  direction TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  communication_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_at TIMESTAMP,
  sent_at TIMESTAMP,
  due_date TIMESTAMP,
  urgency TEXT NOT NULL DEFAULT 'medium',
  response_required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'new',
  source_message_id TEXT,
  source_thread_id TEXT,
  source_mailbox_id TEXT,
  parser_metadata JSONB DEFAULT '{}'::jsonb,
  attachment_refs JSONB DEFAULT '[]'::jsonb,
  parsed_text TEXT,
  summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS c2c_secure_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id UUID NOT NULL REFERENCES c2c_correspondence(id),
  checksum_sha256 TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  malware_status TEXT NOT NULL DEFAULT 'pending',
  quarantine_status TEXT NOT NULL DEFAULT 'clear',
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  encryption_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS c2c_correspondence_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id UUID NOT NULL REFERENCES c2c_correspondence(id),
  category TEXT NOT NULL,
  subcategory TEXT,
  severity TEXT NOT NULL,
  blocker BOOLEAN NOT NULL DEFAULT FALSE,
  response_required BOOLEAN NOT NULL DEFAULT TRUE,
  source_excerpt TEXT,
  confidence NUMERIC(5,4),
  human_review_status TEXT NOT NULL DEFAULT 'pending',
  due_date TIMESTAMP,
  mapped_ctd_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  mapped_artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_user_id INTEGER REFERENCES users(id),
  resolution_status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS c2c_response_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  source_correspondence_id UUID NOT NULL REFERENCES c2c_correspondence(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_matrix_artifact_id TEXT,
  cover_letter_artifact_id TEXT,
  revised_artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  assembled_sequence_linkage TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS c2c_communication_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  submission_id UUID REFERENCES c2c_submissions(id),
  correspondence_id UUID REFERENCES c2c_correspondence(id),
  response_package_id UUID REFERENCES c2c_response_packages(id),
  event_type TEXT NOT NULL,
  event_time TIMESTAMP NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_c2c_submissions_project ON c2c_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_c2c_correspondence_submission ON c2c_correspondence(submission_id);
CREATE INDEX IF NOT EXISTS idx_c2c_correspondence_due ON c2c_correspondence(due_date);
CREATE INDEX IF NOT EXISTS idx_c2c_issues_correspondence ON c2c_correspondence_issues(correspondence_id);
CREATE INDEX IF NOT EXISTS idx_c2c_timeline_submission_time ON c2c_communication_timeline_events(submission_id, event_time DESC);
