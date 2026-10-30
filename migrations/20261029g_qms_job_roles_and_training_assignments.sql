-- =============================================================================
-- 20261029g — QMS job roles, their members, and each controlled document's
-- training assignments (P-49 and P-50, 2026-10-29; MR-12 Stage 4; launch rows
-- D2/D5). Design: docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.1.
--
-- A job role is a job function the organization manages (QA, Manufacturing,
-- Clinical Operations), NOT a permission role (organization_users.role). An
-- assignment names a controlled document and exactly one job role or one
-- person; it is to the document, so it carries to every later version.
-- Writer: server/services/qms/training-assignment.ts only; every write carries
-- its governed ledger pair on the same transaction (governedQmsWrite).
--
-- Nothing is hard-deleted: a role is deleted by setting deleted_at/deleted_by,
-- a member removed and an assignment withdrawn by setting removed_at/
-- removed_by. The live partial uniques let a name, member or assignment be
-- added again after removal, and the history rows stay. User ids are global
-- actor identities, not membership foreign keys: membership-change.ts
-- hard-deletes organization_users rows, and this history must survive
-- offboarding (the 20261013b header). The tenant purge retains all three
-- tables (PURGE_RETAINED_RECORDS, server/services/tenant/tenant-offboarding.ts,
-- decision D8 of the design).
--
-- Rule 1: every statement re-runs on every deploy. All are IF NOT EXISTS;
-- nothing here drops, alters or re-states an object another file creates; no
-- seed rows (job roles are organization data, not reference data).
-- Every object here FREEZES once deployed: a later change amends THIS file in
-- place with a dated note and a conditional ALTER (pg_constraint /
-- pg_get_constraintdef), never an appended DROP.
-- Depends on: organizations, users (base schema); qms_documents
-- (migrations/20260511_qms_and_labeling.sql) and its (id, organization_id)
-- unique index qms_documents_id_org_uq (migrations/20261013b_qms_inspection_
-- same_org_keys.sql:54), both earlier in C2C_MIGRATION_FILES and in the root
-- tree install-fresh walks. Public with organization_id INTEGER NOT NULL, so
-- the tenant isolation sweep at the end of the set gives each table its policy.
-- Pinned by tests/schema-contract/qms-training-assignments-replay.pglite.test.ts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.qms_job_roles (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  created_by      INTEGER NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      INTEGER REFERENCES public.users(id),
  updated_at      TIMESTAMPTZ,
  deleted_by      INTEGER REFERENCES public.users(id),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT qms_job_roles_name_shape CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT qms_job_roles_description_len CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT qms_job_roles_updated_pair CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
  CONSTRAINT qms_job_roles_deleted_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_job_roles_id_org_uq
  ON public.qms_job_roles (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS qms_job_roles_live_name_uq
  ON public.qms_job_roles (organization_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.qms_job_role_members (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  job_role_id     INTEGER NOT NULL,
  -- A global actor identity, not a membership FK: membership-change.ts hard-deletes
  -- organization_users rows, and history must survive offboarding (20261013b header).
  user_id         INTEGER NOT NULL REFERENCES public.users(id),
  added_by        INTEGER NOT NULL REFERENCES public.users(id),
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_by      INTEGER REFERENCES public.users(id),
  removed_at      TIMESTAMPTZ,
  CONSTRAINT qms_job_role_members_role_same_org_fk FOREIGN KEY (job_role_id, organization_id)
    REFERENCES public.qms_job_roles (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT qms_job_role_members_removed_pair CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_job_role_members_live_uq
  ON public.qms_job_role_members (organization_id, job_role_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS qms_job_role_members_user_idx
  ON public.qms_job_role_members (organization_id, user_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.qms_training_assignments (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  document_id     INTEGER NOT NULL,
  job_role_id     INTEGER,
  user_id         INTEGER REFERENCES public.users(id),
  assigned_by     INTEGER NOT NULL REFERENCES public.users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_by      INTEGER REFERENCES public.users(id),
  removed_at      TIMESTAMPTZ,
  CONSTRAINT qms_training_assignments_document_same_org_fk FOREIGN KEY (document_id, organization_id)
    REFERENCES public.qms_documents (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT qms_training_assignments_role_same_org_fk FOREIGN KEY (job_role_id, organization_id)
    REFERENCES public.qms_job_roles (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT qms_training_assignments_one_subject CHECK (num_nonnulls(job_role_id, user_id) = 1),
  CONSTRAINT qms_training_assignments_removed_pair CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_training_assignments_live_role_uq
  ON public.qms_training_assignments (organization_id, document_id, job_role_id)
  WHERE removed_at IS NULL AND job_role_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qms_training_assignments_live_user_uq
  ON public.qms_training_assignments (organization_id, document_id, user_id)
  WHERE removed_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qms_training_assignments_doc_idx
  ON public.qms_training_assignments (organization_id, document_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS qms_training_assignments_role_idx
  ON public.qms_training_assignments (organization_id, job_role_id)
  WHERE removed_at IS NULL AND job_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qms_training_assignments_user_idx
  ON public.qms_training_assignments (organization_id, user_id)
  WHERE removed_at IS NULL AND user_id IS NOT NULL;
