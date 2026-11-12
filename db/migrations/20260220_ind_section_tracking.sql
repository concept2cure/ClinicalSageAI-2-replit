-- ============================================================================
-- IND Section Tracking & Project Management Enhancement
-- Migration: 20260220_ind_section_tracking.sql
--
-- Adds per-project section tracking, assignments, deadlines, and audit trail
-- for the Global Project Management IND Filing System.
--
-- Dependencies: projects table, users table, organizations table
-- Compliance: FDA 21 CFR Part 11 (audit trail, e-signatures)
--
-- ── Amended in place 2026-11-10 (P-122 defects, item 1) ────────────────────
-- Evidence: docs/evidence/DESIGN/P-122/defects/1-milestones/.
-- On a push-provisioned database project_milestones already exists in the
-- baseline shape (shared/schema.ts projectMilestones), so section 5's CREATE
-- TABLE IF NOT EXISTS no-ops, and that shape keyed project_id to cer_projects
-- (project_milestones_project_id_cer_projects_id_fk). Every reader and writer
-- keys it by projects.id (server/routes/project-sections.ts), as section 5
-- declares, so no milestone could be recorded on any project: the INSERT
-- failed 23503, and the project page's Schedule could list none. Section 5
-- now repairs the key after its CREATE, conditionally (CLAUDE.md RULE 1:
-- amend the creating migration in place, never append a DROP):
--   - a key on project_id into cer_projects is removed. Nothing on any applier
--     re-creates it: shared/schema.ts names projects in the same change, and
--     migrations/0000_sweet_joseph.sql, which still names cer_projects, is
--     inert on every applier (its first CREATE TABLE fails 42P07 against push;
--     scripts/ci/duplicate-table-ddl-baseline.json) — and were it ever to run,
--     this block repairs the key again on the same deploy;
--   - a key into projects is added only when project_id has none, under the
--     name push gives it (project_milestones_project_id_projects_id_fk), so a
--     database built by push and one repaired here converge, and a table this
--     file created (with its own key into projects) is left as it is;
--   - it is added NOT VALID and validated only once every row names a project,
--     so a row recorded against a cer_projects id can never fail a deploy
--     (ADD CONSTRAINT validates every existing row). Such a row is left for a
--     person to resolve; new rows are checked either way.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROJECT SECTION TRACKING
-- Tracks the status of every CTD section for each project individually.
-- One row per (project, section_code) pair.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_sections (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_code    TEXT NOT NULL,                 -- eCTD code: m1.2, m2.3.S.1, etc.
  module          TEXT NOT NULL,                 -- M1, M2, M3, M4, M5
  title           TEXT NOT NULL,                 -- Human-readable section title
  status          TEXT NOT NULL DEFAULT 'not_started',  -- not_started, data_gathering, drafting, internal_review, revision, qa_review, approved, signed, locked
  assigned_to     INTEGER REFERENCES users(id), -- Primary assignee
  reviewer_id     INTEGER REFERENCES users(id), -- Assigned reviewer
  deadline        TIMESTAMP,                    -- Target completion date
  priority        TEXT DEFAULT 'medium',         -- low, medium, high, critical
  notes           TEXT,                          -- Free-form notes about this section
  estimated_hours NUMERIC(6,1) DEFAULT 0,       -- Estimated hours for this section
  actual_hours    NUMERIC(6,1) DEFAULT 0,       -- Actual hours logged
  started_at      TIMESTAMP,                    -- When work actually began
  completed_at    TIMESTAMP,                    -- When status reached approved/locked
  locked_at       TIMESTAMP,                    -- When section was locked for submission
  locked_by       INTEGER REFERENCES users(id), -- Who locked it
  metadata        JSONB DEFAULT '{}',            -- Extra data (dependencies, tags, etc.)
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(project_id, section_code)              -- One status per section per project
);

CREATE INDEX IF NOT EXISTS idx_psec_project ON project_sections(project_id);
CREATE INDEX IF NOT EXISTS idx_psec_org ON project_sections(organization_id);
CREATE INDEX IF NOT EXISTS idx_psec_status ON project_sections(status);
CREATE INDEX IF NOT EXISTS idx_psec_assigned ON project_sections(assigned_to);
CREATE INDEX IF NOT EXISTS idx_psec_module ON project_sections(module);
CREATE INDEX IF NOT EXISTS idx_psec_deadline ON project_sections(deadline) WHERE deadline IS NOT NULL;

-- RLS policy for multi-tenant isolation
ALTER TABLE project_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_sections_org_policy ON project_sections;
CREATE POLICY project_sections_org_policy ON project_sections
  USING (organization_id = current_setting('app.organization_id', true)::INTEGER);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SECTION STATUS AUDIT LOG
-- Immutable: every status change is recorded for 21 CFR Part 11 compliance.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS section_status_log (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_code    TEXT NOT NULL,
  old_status      TEXT,
  new_status      TEXT NOT NULL,
  changed_by      INTEGER REFERENCES users(id),
  change_reason   TEXT,                          -- Why the status changed
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssl_project ON section_status_log(project_id);
CREATE INDEX IF NOT EXISTS idx_ssl_section ON section_status_log(section_code);
CREATE INDEX IF NOT EXISTS idx_ssl_org ON section_status_log(organization_id);

-- RLS
ALTER TABLE section_status_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS section_status_log_org_policy ON section_status_log;
CREATE POLICY section_status_log_org_policy ON section_status_log
  USING (organization_id = current_setting('app.organization_id', true)::INTEGER);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SECTION COMMENTS / NOTES
-- Per-section discussion thread for collaboration.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS section_comments (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_code    TEXT NOT NULL,
  author_id       INTEGER NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  parent_id       INTEGER REFERENCES section_comments(id),  -- For threaded replies
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_by     INTEGER REFERENCES users(id),
  resolved_at     TIMESTAMP,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sc_project_section ON section_comments(project_id, section_code);
CREATE INDEX IF NOT EXISTS idx_sc_org ON section_comments(organization_id);

-- RLS
ALTER TABLE section_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS section_comments_org_policy ON section_comments;
CREATE POLICY section_comments_org_policy ON section_comments
  USING (organization_id = current_setting('app.organization_id', true)::INTEGER);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SECTION DEPENDENCIES
-- Tracks which sections depend on other sections being completed first.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS section_dependencies (
  id                    SERIAL PRIMARY KEY,
  organization_id       INTEGER NOT NULL REFERENCES organizations(id),
  project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_code          TEXT NOT NULL,            -- The section that has a dependency
  depends_on_code       TEXT NOT NULL,            -- The section it depends on
  dependency_type       TEXT DEFAULT 'blocks',    -- blocks, informs, references
  created_at            TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(project_id, section_code, depends_on_code)
);

CREATE INDEX IF NOT EXISTS idx_sd_project ON section_dependencies(project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PROJECT TIMELINE MILESTONES
-- Key dates and milestones for the submission timeline.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_milestones (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  milestone_type  TEXT DEFAULT 'deadline',        -- deadline, gate, review, submission
  target_date     TIMESTAMP NOT NULL,
  actual_date     TIMESTAMP,
  status          TEXT DEFAULT 'pending',          -- pending, at_risk, completed, missed
  linked_sections TEXT[] DEFAULT '{}',             -- Section codes that must be done
  owner_id        INTEGER REFERENCES users(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pm_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_target ON project_milestones(target_date);

-- RLS
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_milestones_org_policy ON project_milestones;
CREATE POLICY project_milestones_org_policy ON project_milestones
  USING (organization_id = current_setting('app.organization_id', true)::INTEGER);

-- 2026-11-10 (P-122 defects, item 1): project_id names projects, not cer_projects. See the header.
DO $$
DECLARE
  stale record;
BEGIN
  FOR stale IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.project_milestones'::regclass
       AND c.contype = 'f'
       AND a.attname = 'project_id'
       AND c.confrelid = to_regclass('public.cer_projects')
  LOOP
    EXECUTE format('ALTER TABLE public.project_milestones DROP CONSTRAINT %I', stale.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.project_milestones'::regclass
       AND c.contype = 'f'
       AND a.attname = 'project_id'
       AND c.confrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.project_milestones
      ADD CONSTRAINT project_milestones_project_id_projects_id_fk
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.project_milestones'::regclass
       AND conname = 'project_milestones_project_id_projects_id_fk'
       AND NOT convalidated
  ) AND NOT EXISTS (
    SELECT 1 FROM public.project_milestones pm
     WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pm.project_id)
  ) THEN
    ALTER TABLE public.project_milestones VALIDATE CONSTRAINT project_milestones_project_id_projects_id_fk;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. NOTIFICATION EVENTS
-- System notifications triggered by status changes, deadlines, etc.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_notifications (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),  -- Recipient
  type            TEXT NOT NULL,                  -- status_change, deadline_approaching, review_requested, comment_added, section_locked
  title           TEXT NOT NULL,
  body            TEXT,
  section_code    TEXT,                           -- Related section if applicable
  read            BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMP,
  action_url      TEXT,                           -- Deep link to relevant page
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pn_user ON project_notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_pn_project ON project_notifications(project_id);

-- RLS
ALTER TABLE project_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_notifications_org_policy ON project_notifications;
CREATE POLICY project_notifications_org_policy ON project_notifications
  USING (organization_id = current_setting('app.organization_id', true)::INTEGER);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. UPDATE TRIGGER for project_sections updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_project_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_sections_updated_at ON project_sections;
CREATE TRIGGER trg_project_sections_updated_at
  BEFORE UPDATE ON project_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_project_sections_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. AUTO-LOG STATUS CHANGES
-- Trigger: when project_sections.status changes, insert into section_status_log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_section_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO section_status_log (
      organization_id, project_id, section_code,
      old_status, new_status, changed_by, metadata
    ) VALUES (
      NEW.organization_id, NEW.project_id, NEW.section_code,
      OLD.status, NEW.status,
      COALESCE(current_setting('app.user_id', true)::INTEGER, NULL),
      jsonb_build_object('timestamp', NOW(), 'trigger', 'auto')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_section_status_log ON project_sections;
CREATE TRIGGER trg_section_status_log
  AFTER UPDATE ON project_sections
  FOR EACH ROW
  EXECUTE FUNCTION log_section_status_change();
