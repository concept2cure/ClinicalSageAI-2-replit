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
--    and route columns change only through the route writer's doors (below).
--    The code half is refuseRouteTaskWrite in
--    server/services/tasking/task-state-machine.ts, called by every generic
--    writer. `metadata` stays writable, so the due-date sweep can stamp its
--    markers.
--
-- AMENDED IN PLACE 2026-10-29 (D5, founder decision P-59; evidence
-- docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/). The guard admitted any
-- transaction that set `c2c.review_route_writer = 'on'`. That is a custom
-- setting, and PostgreSQL lets every role set one: the runtime role set it
-- itself (docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/guc-probe.txt),
-- so any statement it ran (a second code path, an injection) could rewrite or
-- delete a signed review workflow's tasks. A control any session can switch
-- off is not a control. It converges on the platform's pattern for
-- append-only guards (ana_run_events_purger, 20261008f):
--   - review_route_writer: a NOLOGIN, NOINHERIT role with no attributes. The
--     runtime role is not a member of it and cannot become it;
--   - the guard admits a route-row write only when current_user is that role,
--     which is true only inside its SECURITY DEFINER doors, and a DELETE of a
--     route row only inside the tenant purge's door (tenant_record_purger,
--     20261029k, P-58). The setting is no longer read;
--   - each door is one transition of server/services/review/review-route.ts,
--     and checks at the database what makes it legitimate: the caller's
--     tenant scope is the organization; the route is the organization's and
--     is open (or closed, for a cancellation; returned, for a return); the
--     task is the route's member; a signature stamped on it is the member's
--     own, over the route's subject and content digest, with the role's
--     meaning, in force; a return, hand-back or reassignment names its own
--     governed ledger row (c2c_ana_actions). Each is on
--     scripts/db/security-definer-allowlist.json with its review.
--   review_route_enlist_member     a member's task joins its route (at send, or added: RR2)
--   review_route_record_signature  a member's verified signature closes their task
--   review_route_open_step         a step opens when every earlier step has signed (RR2)
--   review_route_restep_approver   the approvers move after an added reviewer (RR2)
--   review_route_cancel_member     an unsigned member's task, once the route closed
--   review_route_stamp_act         a return's or a hand-back's ledger row on the task
--   review_route_reassign_member   a reassignment, with its ledger row
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
  -- The route writer's doors (P-59, 2026-10-29): current_user is
  -- review_route_writer only inside one of them. Never a session setting.
  IF current_user = 'review_route_writer' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  -- The tenant purge's door erases a departing tenant's tasks, route members
  -- included (purge_tenant_review_routes, 20261029k, P-58). DELETE only.
  IF TG_OP = 'DELETE' AND current_user = 'tenant_record_purger' THEN
    RETURN OLD;
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
       OR NEW.route_signature_id IS NOT NULL OR NEW.route_act_id IS NOT NULL THEN
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
     OR NEW.route_act_id IS DISTINCT FROM OLD.route_act_id THEN
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

-- =============================================================================
-- P-59 (amended in place 2026-10-29): the route writer's role and doors
-- =============================================================================
-- The doors' owner. Created and verified as ana_run_events_purger is
-- (20261008f): NOLOGIN, no attributes, no inheritance; never a plain CREATE
-- ROLE (roles are cluster-wide and this file re-runs on every deploy).
DO $writer$
DECLARE
  v_applier_is_super boolean;
  v_applier_can_set  boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'review_route_writer') THEN
    CREATE ROLE review_route_writer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
  SELECT rolsuper INTO v_applier_is_super FROM pg_roles WHERE rolname = current_user;
  IF NOT COALESCE(v_applier_is_super, false) THEN
    IF current_setting('server_version_num')::int >= 160000 THEN
      v_applier_can_set := pg_has_role(current_user, 'review_route_writer', 'SET');
    ELSE
      v_applier_can_set := pg_has_role(current_user, 'review_route_writer', 'MEMBER');
    END IF;
    IF NOT v_applier_can_set THEN
      BEGIN
        EXECUTE format('GRANT review_route_writer TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION '[review_routes] % cannot become a member of review_route_writer and so cannot install the route doors', current_user
          USING HINT = format('Have a superuser run: GRANT review_route_writer TO %I; then re-run the migration set.', current_user);
      END;
    END IF;
  END IF;
  -- What the doors read and write, and nothing more.
  GRANT USAGE ON SCHEMA public TO review_route_writer;
  GRANT SELECT ON public.review_routes TO review_route_writer;
  IF to_regclass('public.unified_tasks') IS NOT NULL THEN
    GRANT SELECT, UPDATE ON public.unified_tasks TO review_route_writer;
  END IF;
  IF to_regclass('public.electronic_signatures') IS NOT NULL THEN
    GRANT SELECT ON public.electronic_signatures TO review_route_writer;
  END IF;
  IF to_regclass('public.c2c_ana_actions') IS NOT NULL THEN
    GRANT SELECT ON public.c2c_ana_actions TO review_route_writer;
  END IF;
  IF to_regclass('public.organization_users') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
    GRANT SELECT ON public.organization_users, public.users TO review_route_writer;
  END IF;
END
$writer$;

-- The tenant scope every door runs in: with RLS enforcing, the caller's
-- tenant is the organization it names (release_sealed_run_events, 20261008f).
CREATE OR REPLACE FUNCTION public.review_route_door_scope(p_org integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND NULLIF(current_setting('app.current_tenant_id', true), '') IS DISTINCT FROM p_org::text THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: a review route is written in its organization''s own scope (organization %).', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$fn$;

-- The governed target a route's subject is signed and named on (review-route-standing.ts routeSubjectTarget).
CREATE OR REPLACE FUNCTION public.review_route_subject_target(p_type text, p_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE p_type WHEN 'canonical_document' THEN 'canonical_document:' || p_id
                     WHEN 'qms_document' THEN 'qms-document:' || p_id
                     ELSE 'authoring-document:' || p_id END
$fn$;

-- At send, or when a reviewer is added (RR2): the member's task, inserted on
-- the same transaction with no route column (the guard admits that for
-- anyone), joins its open route. Only a task with the route writer's own id for
-- this route and assignee ('ROUTE-' || first 8 of the route id || '-' ||
-- assignee, and '-n' for a later addition), with no route column yet, can
-- join, and the steps keep their order: a reviewer before every approver, an
-- approver after every reviewer.
CREATE OR REPLACE FUNCTION public.review_route_enlist_member(p_org integer, p_route uuid, p_task_id text, p_role text, p_step integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  IF p_role NOT IN ('reviewer', 'approver') OR p_step IS NULL OR p_step < 1 THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: a member is a reviewer or an approver, at a step from 1.' USING ERRCODE = 'raise_exception';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.review_routes r WHERE r.organization_id = p_org AND r.id = p_route AND r.status = 'open') THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: review route % is not an open route of organization %.', p_route, p_org USING ERRCODE = 'raise_exception';
  END IF;
  IF EXISTS (SELECT 1 FROM public.unified_tasks m
              WHERE m.organization_id = p_org AND m.review_route_id = p_route AND m.deleted_at IS NULL
                AND ((p_role = 'reviewer' AND m.review_role = 'approver' AND m.review_step <= p_step)
                  OR (p_role = 'approver' AND m.review_role = 'reviewer' AND m.review_step >= p_step))) THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: a % at step % would break the order of route % (reviewers before approvers).', p_role, p_step, p_route
      USING ERRCODE = 'raise_exception';
  END IF;
  UPDATE public.unified_tasks t
     SET review_route_id = p_route, review_role = p_role, review_step = p_step
   WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.deleted_at IS NULL AND t.assignee_id IS NOT NULL
     AND t.task_id ~ ('^ROUTE-' || left(p_route::text, 8) || '-' || t.assignee_id::text || '(-[0-9]+)?$')
     AND t.review_route_id IS NULL AND t.review_role IS NULL AND t.review_step IS NULL
     AND t.route_signature_id IS NULL AND t.route_act_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: task % is not a new member task of route %.', p_task_id, p_route USING ERRCODE = 'raise_exception';
  END IF;
END;
$fn$;

-- A member's verified signature closes their task: the signature must be the
-- member's own (its assignee), of this organization, over the route's subject
-- and content digest, with the role's meaning, and in force (finding B3, as
-- review-route-standing.ts verifiedSignature reads it). Returns the status.
CREATE OR REPLACE FUNCTION public.review_route_record_signature(p_org integer, p_route uuid, p_task_id text, p_signature integer, p_actor integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  UPDATE public.unified_tasks t
     SET route_signature_id = p_signature, status = 'completed', progress = 100, completion_percentage = 100,
         completed_at = now(), last_modified_by = p_actor, updated_at = now()
    FROM public.review_routes r, public.electronic_signatures s
   WHERE r.organization_id = p_org AND r.id = p_route AND r.status = 'open'
     AND t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
     AND t.route_signature_id IS NULL AND t.deleted_at IS NULL
     AND s.id = p_signature AND s.organization_id = p_org AND s.signer_id = t.assignee_id
     AND s.signed_target = public.review_route_subject_target(r.subject_type, r.subject_id)
     AND s.bound_payload_digest = r.content_digest
     AND upper(s.signature_meaning) = CASE t.review_role WHEN 'reviewer' THEN 'REVIEWED' ELSE 'APPROVED' END
     AND s.superseded_by IS NULL AND s.is_valid IS DISTINCT FROM false
     AND COALESCE(s.verification_status, '') NOT IN ('revoked', 'voided')
  RETURNING t.status INTO v_status;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: signature % does not close task % of route %.', p_signature, p_task_id, p_route
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN v_status;
END;
$fn$;

-- A step's turn has come (§3, RR2): a member's waiting task opens once every
-- member of every earlier step of the route carries a stamped signature: the
-- next reviewer one after another, or the approvers once the review is
-- complete. True when it opened.
CREATE OR REPLACE FUNCTION public.review_route_open_step(p_org integer, p_route uuid, p_task_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  IF EXISTS (SELECT 1 FROM public.unified_tasks t JOIN public.unified_tasks m
                ON m.organization_id = p_org AND m.review_route_id = p_route AND m.deleted_at IS NULL
               AND m.review_step < t.review_step AND m.route_signature_id IS NULL
              WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route) THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: a step before task % of route % has not signed.', p_task_id, p_route USING ERRCODE = 'raise_exception';
  END IF;
  UPDATE public.unified_tasks t SET status = 'pending', updated_at = now()
    FROM public.review_routes r
   WHERE r.organization_id = p_org AND r.id = p_route AND r.status = 'open'
     AND t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
     AND t.status = 'blocked' AND t.route_signature_id IS NULL AND t.route_act_id IS NULL AND t.deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$fn$;

-- A reviewer is added (RR2): an approver moves to the step after every
-- reviewer, only on an open route on which no approver has signed, and one
-- whose turn had come (pending, neither signed nor acted) waits again. True
-- when it was made to wait.
CREATE OR REPLACE FUNCTION public.review_route_restep_approver(p_org integer, p_route uuid, p_task_id text, p_step integer, p_actor integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_was text;
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  IF NOT EXISTS (SELECT 1 FROM public.review_routes r WHERE r.organization_id = p_org AND r.id = p_route AND r.status = 'open')
     OR EXISTS (SELECT 1 FROM public.unified_tasks m WHERE m.organization_id = p_org AND m.review_route_id = p_route
                  AND m.review_role = 'approver' AND m.route_signature_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.unified_tasks m WHERE m.organization_id = p_org AND m.review_route_id = p_route
                  AND m.review_role = 'reviewer' AND m.deleted_at IS NULL AND m.review_step >= p_step) THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: route % does not admit its approvers at step %.', p_route, p_step USING ERRCODE = 'raise_exception';
  END IF;
  SELECT t.status INTO v_was FROM public.unified_tasks t
   WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route AND t.review_role = 'approver' FOR UPDATE;
  IF v_was IS NULL THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: task % is not an approver of route %.', p_task_id, p_route USING ERRCODE = 'raise_exception';
  END IF;
  UPDATE public.unified_tasks t
     SET review_step = p_step, updated_at = now(), last_modified_by = p_actor,
         status = CASE WHEN t.status = 'pending' AND t.route_signature_id IS NULL AND t.route_act_id IS NULL THEN 'blocked' ELSE t.status END
   WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route;
  RETURN v_was = 'pending';
END;
$fn$;

-- Closing a route (withdrawn, returned, complete: its header already says so):
-- a member who has not signed is cancelled.
CREATE OR REPLACE FUNCTION public.review_route_cancel_member(p_org integer, p_route uuid, p_task_id text, p_actor integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  IF NOT EXISTS (SELECT 1 FROM public.review_routes r WHERE r.organization_id = p_org AND r.id = p_route AND r.status <> 'open') THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: route % of organization % is not closed.', p_route, p_org USING ERRCODE = 'raise_exception';
  END IF;
  UPDATE public.unified_tasks t SET status = 'cancelled', updated_at = now(), last_modified_by = p_actor
   WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
     AND t.route_signature_id IS NULL AND t.status <> 'cancelled';
END;
$fn$;

-- A member's return or hand-back is stamped on their task by its own ledger
-- row: the act names this route, this task's assignee, and this subject. A
-- return (the route already returned) stamps the act; a hand-back (the route
-- open, the member neither signed nor acted) also sets the task waiting on
-- the sender. Returns the task's status.
CREATE OR REPLACE FUNCTION public.review_route_stamp_act(p_org integer, p_route uuid, p_task_id text, p_act text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_command text;
  v_status  text;
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  SELECT a.command INTO v_command
    FROM public.c2c_ana_actions a JOIN public.review_routes r ON r.organization_id = p_org AND r.id = p_route
    JOIN public.unified_tasks t ON t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
   WHERE a.id = p_act AND a.org_id = p_org
     AND a.target = public.review_route_subject_target(r.subject_type, r.subject_id)
     AND a.payload->>'routeId' = p_route::text
     AND ((a.command = 'review-route.return' AND r.status = 'returned' AND a.payload->>'returnedBy' = t.assignee_id::text)
       OR (a.command = 'review-route.hand-back' AND r.status = 'open' AND a.payload->>'taskId' = p_task_id
           AND a.payload->>'userId' = t.assignee_id::text));
  IF v_command IS NULL THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: act % is not a return or hand-back of task % on route %.', p_act, p_task_id, p_route
      USING ERRCODE = 'raise_exception';
  END IF;
  IF v_command = 'review-route.return' THEN
    UPDATE public.unified_tasks t SET route_act_id = p_act
     WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
    RETURNING t.status INTO v_status;
  ELSE
    UPDATE public.unified_tasks t SET route_act_id = p_act, status = 'blocked', updated_at = now(), last_modified_by = t.assignee_id
     WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
       AND t.route_act_id IS NULL AND t.route_signature_id IS NULL
    RETURNING t.status INTO v_status;
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: task % of route % could not take act %.', p_task_id, p_route, p_act USING ERRCODE = 'raise_exception';
  END IF;
  RETURN v_status;
END;
$fn$;

-- A reassignment, named by its own ledger row (review-route.reassign: this
-- route, this task, to this person): an unsigned member's task on an open
-- route goes to an active member of the organization, with the printed name
-- at naming, the reminder markers cleared and any hand-back cleared; it is
-- pending when its step is open, else blocked. Returns the row as
-- task-assignment.ts reads it.
CREATE OR REPLACE FUNCTION public.review_route_reassign_member(
  p_org integer, p_route uuid, p_task_id text, p_assignee integer, p_assignee_name text, p_actor integer, p_act text)
RETURNS TABLE (id integer, task_id text, organization_id integer, project_id integer, client_workspace_id integer, status text,
               assignee_id integer, assignee_name text, assigned_by integer, assigned_at timestamp, title text,
               row_version text, exact_updated_at text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.review_route_door_scope(p_org);
  IF NOT EXISTS (
    SELECT 1 FROM public.c2c_ana_actions a JOIN public.review_routes r ON r.organization_id = p_org AND r.id = p_route
     WHERE a.id = p_act AND a.org_id = p_org AND a.command = 'review-route.reassign' AND r.status = 'open'
       AND a.target = public.review_route_subject_target(r.subject_type, r.subject_id)
       AND a.payload->>'routeId' = p_route::text AND a.payload->>'taskId' = p_task_id
       AND a.payload->'to'->>'userId' = p_assignee::text) THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: act % is not the reassignment of task % on open route % to %.', p_act, p_task_id, p_route, p_assignee
      USING ERRCODE = 'raise_exception';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_users ou JOIN public.users u ON u.id = ou.user_id
                  WHERE ou.organization_id = p_org AND ou.user_id = p_assignee AND u.status = 'active') THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: account % is not an active member of organization %.', p_assignee, p_org USING ERRCODE = 'raise_exception';
  END IF;
  RETURN QUERY
  UPDATE public.unified_tasks t
     SET assignee_id = p_assignee, assignee_name = p_assignee_name, assigned_by = p_actor, assigned_at = now(),
         last_modified_by = p_actor, updated_at = now(), route_act_id = NULL,
         metadata = CASE WHEN t.metadata IS NULL THEN NULL ELSE ((t.metadata::jsonb - 'dueSoonNotifiedAt') - 'overdueNotifiedAt')::json END,
         status = CASE WHEN t.review_step = 1 OR NOT EXISTS (
                         SELECT 1 FROM public.unified_tasks o
                          WHERE o.organization_id = p_org AND o.review_route_id = p_route AND o.review_step < t.review_step
                            AND o.deleted_at IS NULL AND o.route_signature_id IS NULL)
                       THEN 'pending' ELSE 'blocked' END
   WHERE t.organization_id = p_org AND t.task_id = p_task_id AND t.review_route_id = p_route
     AND t.route_signature_id IS NULL AND t.deleted_at IS NULL
  RETURNING t.id, t.task_id, t.organization_id, t.project_id, t.client_workspace_id, t.status, t.assignee_id, t.assignee_name,
            t.assigned_by, t.assigned_at, t.title, t.xmin::text, t.updated_at::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUTE_TASK_OWNED_BY_ROUTE: task % of route % is not an unsigned member.', p_task_id, p_route USING ERRCODE = 'raise_exception';
  END IF;
END;
$fn$;

-- Each door is owned by review_route_writer, callable by the runtime role
-- alone, and verified in that shape: a door in any other shape is no door.
DO $door$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.review_route_enlist_member(integer,uuid,text,text,integer)',
    'public.review_route_record_signature(integer,uuid,text,integer,integer)',
    'public.review_route_open_step(integer,uuid,text)',
    'public.review_route_restep_approver(integer,uuid,text,integer,integer)',
    'public.review_route_cancel_member(integer,uuid,text,integer)',
    'public.review_route_stamp_act(integer,uuid,text,text)',
    'public.review_route_reassign_member(integer,uuid,text,integer,text,integer,text)'
  ] LOOP
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_fn::regprocedure) <> 'review_route_writer' THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO review_route_writer', v_fn);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_service', v_fn);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn::regprocedure AND prosecdef AND pg_get_userbyid(proowner) = 'review_route_writer') THEN
      RAISE EXCEPTION '[review_routes] % is not SECURITY DEFINER owned by review_route_writer', v_fn;
    END IF;
    IF has_function_privilege('public', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '[review_routes] % is executable by PUBLIC', v_fn;
    END IF;
  END LOOP;
END
$door$;

-- The doors' helpers run with their caller's rights and carry no privilege of
-- their own; only the doors' owner calls them.
DO $helpers$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.review_route_door_scope(integer)', 'public.review_route_subject_target(text,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO review_route_writer', v_fn);
  END LOOP;
END
$helpers$;
