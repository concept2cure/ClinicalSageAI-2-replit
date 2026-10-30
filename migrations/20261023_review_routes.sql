-- =============================================================================
-- 20261023 — Review routes: a route header, and route columns on unified_tasks
-- =============================================================================
-- Launch row D2, slice RR1a of docs/design/REVIEW_ROUTING_2026-10-23.md (§2.2,
-- §2.3). Evidence docs/evidence/D2-REVIEW-ROUTING/2026-10-29-RR1a/.
--
-- 1. public.review_routes is the header of one review route: its subject, its
--    round, its sender (with the printed name at sending), its order, its due
--    dates, the content digest it is about and its status. Written only by
--    server/services/review/review-route.ts.
-- 2. unified_tasks gains five route columns. A row carrying review_route_id is
--    a route member: the person's inbox entry for the route, a projection of
--    the header and their signature or act. Authority is never read from its
--    status (§2.1).
-- 3. unified_tasks_route_rows_guard is the database half of finding B1: a
--    route row's status, assignee, archive, blockers, due date, dependencies
--    and route columns change only on a transaction that has set
--    `SET LOCAL c2c.review_route_writer = 'on'`, which only review-route.ts
--    sets. The code half is refuseRouteTaskWrite in
--    server/services/tasking/task-state-machine.ts, called by every generic
--    writer. `metadata` stays writable, so the due-date sweep can stamp its
--    markers.
--
-- Rule 1 (CLAUDE.md): every statement here re-runs on every deploy. All of it
-- is additive and guarded; it drops no column, constraint or table. The only
-- DROP is `DROP TRIGGER IF EXISTS` of this file's own two trigger names,
-- immediately re-created (the 20261001 guard's precedent), so a deploy always
-- carries the current function.
--
-- EVERY IF NOT EXISTS OBJECT HERE FREEZES ONCE DEPLOYED. A later change to a
-- column, index or constraint below is made by amending THIS file in place,
-- with a dated note and an explicit, conditional ALTER — never by editing the
-- CREATE and expecting a replay to apply it (a replay of CREATE TABLE IF NOT
-- EXISTS does nothing to a table that exists).
--
-- Tenant isolation: review_routes is in public with organization_id INTEGER
-- NOT NULL, placed before the final sweep pair (ci:migration-set-order), so
-- the integer sweep policies it. The member key to the header is composite
-- (organization_id, review_route_id), so a task can never name another
-- organization's route.
--
-- AMENDED IN PLACE, 2026-10-29 (slice RR5 of the design: Authoring's
-- request-review writes its route; evidence
-- docs/evidence/D2-REVIEW-ROUTING/2026-10-30-RR5/). Additive only; nothing is
-- removed:
--   (a) unified_tasks.route_authoring_signature_id uuid: the authoring_signatures
--       row (the existing REVIEWER e-sign, POST /api/authoring/docs/:id/e-sign)
--       a member of an Authoring route signed with. route_signature_id is an
--       electronic_signatures integer id; an Authoring signature is a uuid in
--       its own table, and is never copied into electronic_signatures (§11.70,
--       authoring-approval-carryover.ts). The trigger below guards it like
--       every other route column.
--   (b) review_routes.approval_due_at loses NOT NULL, by a conditional ALTER
--       (below the CREATE, which is left as deployed). An Authoring route at
--       RR5 names reviewers only (its approvers are RR6), so it has no
--       approval to be due; a Vault or QMS route still always writes one
--       (parseRouteRequest refuses a route there without an approver and its
--       date). No other file in the migration set sets this column NOT NULL,
--       so the replay cannot re-impose it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.review_routes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            integer NOT NULL,
  subject_type               text NOT NULL,
  subject_id                 text NOT NULL,
  round                      integer NOT NULL,
  sender_id                  integer NOT NULL,
  sender_name                text NOT NULL,
  review_order               text NOT NULL,
  review_due_at              timestamptz,
  reviewer_step_due_at       timestamptz[],
  approval_due_at            timestamptz NOT NULL,
  content_digest             text NOT NULL,
  status                     text NOT NULL DEFAULT 'open',
  status_reason              text,
  status_by                  integer,
  status_at                  timestamptz,
  sender_overdue_notified_at timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

-- 2026-10-29 (RR5, note (b) above): an Authoring route at RR5 has no approval.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.review_routes'::regclass AND attname = 'approval_due_at' AND attnotnull
  ) THEN
    ALTER TABLE public.review_routes ALTER COLUMN approval_due_at DROP NOT NULL;
  END IF;
END
$mig$;

-- The organization key, when the base schema is present (a test database
-- built from a subset of tables may not hold organizations).
DO $mig$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'review_routes_organization_fk'
       AND conrelid = 'public.review_routes'::regclass
  ) THEN
    ALTER TABLE public.review_routes
      ADD CONSTRAINT review_routes_organization_fk
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'review_routes_subject_type_check'
       AND conrelid = 'public.review_routes'::regclass
  ) THEN
    ALTER TABLE public.review_routes
      ADD CONSTRAINT review_routes_subject_type_check
      CHECK (subject_type IN ('canonical_document', 'qms_document', 'authoring_document'));
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'review_routes_order_check'
       AND conrelid = 'public.review_routes'::regclass
  ) THEN
    ALTER TABLE public.review_routes
      ADD CONSTRAINT review_routes_order_check
      CHECK (review_order IN ('parallel', 'sequential'));
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'review_routes_status_check'
       AND conrelid = 'public.review_routes'::regclass
  ) THEN
    ALTER TABLE public.review_routes
      ADD CONSTRAINT review_routes_status_check
      CHECK (status IN ('open', 'withdrawn', 'returned', 'complete'));
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'review_routes_closed_has_actor'
       AND conrelid = 'public.review_routes'::regclass
  ) THEN
    ALTER TABLE public.review_routes
      ADD CONSTRAINT review_routes_closed_has_actor
      CHECK (status = 'open' OR (status_by IS NOT NULL AND status_at IS NOT NULL));
  END IF;
END
$mig$;

-- The composite key the member rows reference (organization_id first).
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'review_routes_org_id_key'
       AND conrelid = 'public.review_routes'::regclass
  ) THEN
    ALTER TABLE public.review_routes
      ADD CONSTRAINT review_routes_org_id_key UNIQUE (organization_id, id);
  END IF;
END
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS review_routes_one_open_per_subject
  ON public.review_routes (organization_id, subject_type, subject_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS review_routes_subject_idx
  ON public.review_routes (organization_id, subject_type, subject_id, created_at);

-- ── The member columns on unified_tasks ─────────────────────────────────────
DO $mig$
BEGIN
  IF to_regclass('public.unified_tasks') IS NULL THEN
    RAISE NOTICE 'review routes: unified_tasks is absent - member columns skipped';
    RETURN;
  END IF;

  ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_route_id uuid;
  ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_role text;
  ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_step integer;
  ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS route_signature_id integer;
  ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS route_act_id text;
  -- 2026-10-29 (RR5, note (a) above).
  ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS route_authoring_signature_id uuid;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'unified_tasks_review_route_fk'
       AND conrelid = 'public.unified_tasks'::regclass
  ) THEN
    ALTER TABLE public.unified_tasks
      ADD CONSTRAINT unified_tasks_review_route_fk
      FOREIGN KEY (organization_id, review_route_id)
      REFERENCES public.review_routes (organization_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'unified_tasks_review_role_check'
       AND conrelid = 'public.unified_tasks'::regclass
  ) THEN
    ALTER TABLE public.unified_tasks
      ADD CONSTRAINT unified_tasks_review_role_check
      CHECK (review_role IS NULL OR review_role IN ('reviewer', 'approver'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'unified_tasks_review_route_pair'
       AND conrelid = 'public.unified_tasks'::regclass
  ) THEN
    ALTER TABLE public.unified_tasks
      ADD CONSTRAINT unified_tasks_review_route_pair
      CHECK ((review_route_id IS NULL) = (review_role IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'unified_tasks_route_task_assignee'
       AND conrelid = 'public.unified_tasks'::regclass
  ) THEN
    ALTER TABLE public.unified_tasks
      ADD CONSTRAINT unified_tasks_route_task_assignee
      CHECK (review_route_id IS NULL OR assignee_id IS NOT NULL);
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF to_regclass('public.unified_tasks') IS NULL THEN RETURN; END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS unified_tasks_review_route_member_key
    ON public.unified_tasks (organization_id, review_route_id, assignee_id) WHERE review_route_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS unified_tasks_review_subject_idx
    ON public.unified_tasks (organization_id, review_route_id) WHERE review_route_id IS NOT NULL;
END
$mig$;

-- ── The backstop: only the route writer touches a route row ──────────────────
-- SECURITY INVOKER: the task_dependencies lookup reads unified_tasks under the
-- caller's own RLS scope, the scope its write already passed.
CREATE OR REPLACE FUNCTION public.unified_tasks_route_rows_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('c2c.review_route_writer', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Each linking table names its two ends in its own columns; a record's
  -- fields are resolved when the statement runs, so each is read in its own
  -- branch.
  IF TG_TABLE_NAME = 'task_dependencies' THEN
    IF EXISTS (
      SELECT 1 FROM public.unified_tasks t
       WHERE t.review_route_id IS NOT NULL
         AND t.task_id IN (NEW.predecessor_task_id, NEW.successor_task_id)
    ) THEN
      RAISE EXCEPTION
        'ROUTE_TASK_OWNED_BY_ROUTE: a task that belongs to a review route cannot be made a dependency.'
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'cross_module_task_links' THEN
    IF EXISTS (
      SELECT 1 FROM public.unified_tasks t
       WHERE t.review_route_id IS NOT NULL
         AND t.task_id IN (NEW.source_task_id, NEW.target_task_id)
    ) THEN
      RAISE EXCEPTION
        'ROUTE_TASK_OWNED_BY_ROUTE: a task that belongs to a review route cannot be linked.'
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.review_route_id IS NOT NULL OR NEW.review_role IS NOT NULL OR NEW.review_step IS NOT NULL
       OR NEW.route_signature_id IS NOT NULL OR NEW.route_act_id IS NOT NULL
       OR NEW.route_authoring_signature_id IS NOT NULL THEN
      RAISE EXCEPTION
        'ROUTE_TASK_OWNED_BY_ROUTE: review route columns are written only by the review route.'
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.review_route_id IS NOT NULL THEN
      RAISE EXCEPTION
        'ROUTE_TASK_OWNED_BY_ROUTE: task % belongs to a review route and cannot be deleted.', OLD.task_id
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF NEW.review_route_id IS DISTINCT FROM OLD.review_route_id
     OR NEW.review_role IS DISTINCT FROM OLD.review_role
     OR NEW.review_step IS DISTINCT FROM OLD.review_step
     OR NEW.route_signature_id IS DISTINCT FROM OLD.route_signature_id
     OR NEW.route_act_id IS DISTINCT FROM OLD.route_act_id
     OR NEW.route_authoring_signature_id IS DISTINCT FROM OLD.route_authoring_signature_id THEN
    RAISE EXCEPTION
      'ROUTE_TASK_OWNED_BY_ROUTE: review route columns of task % are written only by the review route.', OLD.task_id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.review_route_id IS NOT NULL AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
       OR NEW.blocks IS DISTINCT FROM OLD.blocks
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.dependencies::text IS DISTINCT FROM OLD.dependencies::text) THEN
    RAISE EXCEPTION
      'ROUTE_TASK_OWNED_BY_ROUTE: task % belongs to a review route; use the route''s actions on the document.', OLD.task_id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

DO $mig$
BEGIN
  IF to_regclass('public.unified_tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS unified_tasks_route_rows_guard ON public.unified_tasks;
    CREATE TRIGGER unified_tasks_route_rows_guard
      BEFORE INSERT OR UPDATE OR DELETE ON public.unified_tasks
      FOR EACH ROW EXECUTE FUNCTION public.unified_tasks_route_rows_guard();
  END IF;
  IF to_regclass('public.task_dependencies') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS task_dependencies_route_rows_guard ON public.task_dependencies;
    CREATE TRIGGER task_dependencies_route_rows_guard
      BEFORE INSERT ON public.task_dependencies
      FOR EACH ROW EXECUTE FUNCTION public.unified_tasks_route_rows_guard();
  END IF;
  IF to_regclass('public.cross_module_task_links') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS cross_module_task_links_route_rows_guard ON public.cross_module_task_links;
    CREATE TRIGGER cross_module_task_links_route_rows_guard
      BEFORE INSERT ON public.cross_module_task_links
      FOR EACH ROW EXECUTE FUNCTION public.unified_tasks_route_rows_guard();
  END IF;
END
$mig$;
