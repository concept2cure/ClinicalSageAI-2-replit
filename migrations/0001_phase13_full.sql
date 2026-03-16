-- Phase 13 Full: PM Work Items, Notifications, Escalation, schema extensions
-- Safe: all operations are additive (ALTER ADD COLUMN, CREATE TABLE)

-- ============================================================
-- 1. Add dueAt to review threads
-- ============================================================
ALTER TABLE concept2cure_review_threads
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS c2c_thread_due_at_idx
  ON concept2cure_review_threads (due_at);

-- ============================================================
-- 2. Add priority to review tasks
-- ============================================================
ALTER TABLE concept2cure_review_tasks
  ADD COLUMN IF NOT EXISTS priority TEXT;

-- ============================================================
-- 3. PM Work Items — document-derived work projected into PM layer
-- ============================================================
CREATE TABLE IF NOT EXISTS c2c_project_work_items (
  id SERIAL PRIMARY KEY,
  work_item_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('review_thread', 'review_task', 'approval_blocker', 'requested_changes')),
  source_id INTEGER NOT NULL,
  artifact_id INTEGER REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  ctd_section TEXT,
  owner_id INTEGER REFERENCES users(id),
  owner_name TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  due_at TIMESTAMPTZ,
  blocker_type TEXT
    CHECK (blocker_type IN ('unresolved_review', 'approval_pending', 'requested_changes', 'overdue_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS c2c_pwi_project_idx ON c2c_project_work_items (project_id);
CREATE INDEX IF NOT EXISTS c2c_pwi_source_idx ON c2c_project_work_items (source_type, source_id);
CREATE INDEX IF NOT EXISTS c2c_pwi_artifact_idx ON c2c_project_work_items (artifact_id);
CREATE INDEX IF NOT EXISTS c2c_pwi_owner_idx ON c2c_project_work_items (owner_id);
CREATE INDEX IF NOT EXISTS c2c_pwi_status_idx ON c2c_project_work_items (status);
CREATE INDEX IF NOT EXISTS c2c_pwi_due_at_idx ON c2c_project_work_items (due_at);
CREATE INDEX IF NOT EXISTS c2c_pwi_org_project_idx ON c2c_project_work_items (org_id, project_id);

-- ============================================================
-- 4. Concept2Cure Notifications with escalation support
-- ============================================================
CREATE TABLE IF NOT EXISTS concept2cure_notifications (
  id SERIAL PRIMARY KEY,
  notification_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id INTEGER REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  thread_id INTEGER REFERENCES concept2cure_review_threads(id) ON DELETE SET NULL,
  review_task_id INTEGER REFERENCES concept2cure_review_tasks(id) ON DELETE SET NULL,
  project_work_item_id INTEGER REFERENCES c2c_project_work_items(id) ON DELETE SET NULL,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id),
  recipient_name TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  actor_name TEXT,
  notification_type TEXT NOT NULL
    CHECK (notification_type IN (
      'assignment', 'due_soon', 'overdue', 'approval_needed',
      'changes_requested', 'thread_reply', 'thread_resolved',
      'task_resolved', 'publish_complete', 'escalation'
    )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'dismissed')),
  action_url TEXT,
  due_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  -- Escalation fields
  escalation_level INTEGER DEFAULT 0,
  last_notified_at TIMESTAMPTZ,
  next_reminder_at TIMESTAMPTZ,
  escalates_at TIMESTAMPTZ,
  escalation_target_user_id INTEGER REFERENCES users(id),
  escalation_target_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_notif_recipient_idx ON concept2cure_notifications (recipient_user_id);
CREATE INDEX IF NOT EXISTS c2c_notif_status_idx ON concept2cure_notifications (status);
CREATE INDEX IF NOT EXISTS c2c_notif_type_idx ON concept2cure_notifications (notification_type);
CREATE INDEX IF NOT EXISTS c2c_notif_project_idx ON concept2cure_notifications (project_id);
CREATE INDEX IF NOT EXISTS c2c_notif_thread_idx ON concept2cure_notifications (thread_id);
CREATE INDEX IF NOT EXISTS c2c_notif_task_idx ON concept2cure_notifications (review_task_id);
CREATE INDEX IF NOT EXISTS c2c_notif_due_at_idx ON concept2cure_notifications (due_at);
CREATE INDEX IF NOT EXISTS c2c_notif_next_reminder_idx ON concept2cure_notifications (next_reminder_at);
CREATE INDEX IF NOT EXISTS c2c_notif_org_project_idx ON concept2cure_notifications (org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_notif_created_at_idx ON concept2cure_notifications (created_at);
CREATE INDEX IF NOT EXISTS c2c_notif_artifact_idx ON concept2cure_notifications (artifact_id);

-- ============================================================
-- 5. Add check constraints to existing review tables (safe, idempotent)
-- ============================================================
DO $$
BEGIN
  -- Review threads status check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_thread_status_chk') THEN
    ALTER TABLE concept2cure_review_threads
      ADD CONSTRAINT c2c_thread_status_chk CHECK (status IN ('open', 'resolved'));
  END IF;

  -- Review threads priority check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_thread_priority_chk') THEN
    ALTER TABLE concept2cure_review_threads
      ADD CONSTRAINT c2c_thread_priority_chk CHECK (priority IN ('low', 'medium', 'high'));
  END IF;

  -- Thread comments kind check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_tcomment_kind_chk') THEN
    ALTER TABLE concept2cure_thread_comments
      ADD CONSTRAINT c2c_tcomment_kind_chk CHECK (kind IN ('comment', 'request_changes', 'system'));
  END IF;

  -- Review tasks status check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_task_status_chk') THEN
    ALTER TABLE concept2cure_review_tasks
      ADD CONSTRAINT c2c_task_status_chk CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
  END IF;

  -- Review tasks type check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_task_type_chk') THEN
    ALTER TABLE concept2cure_review_tasks
      ADD CONSTRAINT c2c_task_type_chk CHECK (task_type IN ('change_request', 'follow_up', 'review_task', 'approval_task'));
  END IF;

  -- Review tasks priority check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_task_priority_chk') THEN
    ALTER TABLE concept2cure_review_tasks
      ADD CONSTRAINT c2c_task_priority_chk CHECK (priority IN ('low', 'medium', 'high'));
  END IF;
END $$;
