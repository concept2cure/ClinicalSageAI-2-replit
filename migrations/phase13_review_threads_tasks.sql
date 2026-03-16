-- Phase 13: Review Threads, Thread Comments & Review Tasks
-- Migration for multi-user review collaboration layer

-- 1. Review Threads
CREATE TABLE IF NOT EXISTS concept2cure_review_threads (
  id SERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  created_by_role TEXT,
  title TEXT,
  anchor_type TEXT CHECK (anchor_type IN ('section', 'heading', 'range', 'general')),
  anchor_key TEXT,
  anchor_label TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id INTEGER REFERENCES users(id),
  assignee_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_id INTEGER REFERENCES users(id),
  resolved_by_name TEXT
);

CREATE INDEX IF NOT EXISTS c2c_thread_artifact_idx ON concept2cure_review_threads(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_thread_version_idx ON concept2cure_review_threads(version_id);
CREATE INDEX IF NOT EXISTS c2c_thread_status_idx ON concept2cure_review_threads(status);
CREATE INDEX IF NOT EXISTS c2c_thread_assignee_idx ON concept2cure_review_threads(assignee_id);
CREATE INDEX IF NOT EXISTS c2c_thread_org_project_idx ON concept2cure_review_threads(org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_thread_created_at_idx ON concept2cure_review_threads(created_at);

-- 2. Thread Comments
CREATE TABLE IF NOT EXISTS concept2cure_thread_comments (
  id SERIAL PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  thread_id INTEGER NOT NULL REFERENCES concept2cure_review_threads(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  parent_comment_id INTEGER,
  author_id INTEGER NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  author_role TEXT,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'request_changes', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS c2c_tcomment_thread_idx ON concept2cure_thread_comments(thread_id);
CREATE INDEX IF NOT EXISTS c2c_tcomment_artifact_idx ON concept2cure_thread_comments(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_tcomment_author_idx ON concept2cure_thread_comments(author_id);
CREATE INDEX IF NOT EXISTS c2c_tcomment_org_idx ON concept2cure_thread_comments(org_id);
CREATE INDEX IF NOT EXISTS c2c_tcomment_created_at_idx ON concept2cure_thread_comments(created_at);

-- 3. Review Tasks
CREATE TABLE IF NOT EXISTS concept2cure_review_tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  thread_id INTEGER REFERENCES concept2cure_review_threads(id) ON DELETE SET NULL,
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  assigned_to_id INTEGER REFERENCES users(id),
  assigned_to_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'review_task' CHECK (task_type IN ('change_request', 'follow_up', 'review_task')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_id INTEGER REFERENCES users(id),
  resolved_by_name TEXT
);

CREATE INDEX IF NOT EXISTS c2c_task_artifact_idx ON concept2cure_review_tasks(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_task_assigned_to_idx ON concept2cure_review_tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS c2c_task_status_idx ON concept2cure_review_tasks(status);
CREATE INDEX IF NOT EXISTS c2c_task_org_project_idx ON concept2cure_review_tasks(org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_task_thread_idx ON concept2cure_review_tasks(thread_id);
CREATE INDEX IF NOT EXISTS c2c_task_created_at_idx ON concept2cure_review_tasks(created_at);
