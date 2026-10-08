-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — AnA run control (detach, slice DT1)
-- Compliance: 21 CFR Part 11 §11.10(e) (the sealed turn record stays the
--             record); ALCOA+ (attributable, contemporaneous working data)
-- Purpose: A durable, append-only mirror of a live AnA turn's timeline, so any
--          permitted device can read what AnA is doing without the socket that
--          started the turn (docs/design/ANA_DETACH_2026-10-08.md §3, "D1").
--
-- eCTD/CTD Context:
--   - Module(s): none directly. It mirrors the Summary timeline of the
--     assistant that authors into every module.
--   - Integrity Risk Addressed: today the only live copy of a turn's steps is
--     the SSE stream of the page that started it; a second device, or the same
--     page after a reload, has nothing to read until the record is sealed.
--
-- Determinism Contract:
--   - Each row is exactly one TimelineEvent the stream's one producer emitted
--     (server/services/ana/turn-timeline-emitter.ts emitTimeline), or the
--     truncation marker at seq 2000. Nothing here is computed by a model.
--   - Additive and idempotent: CREATE … IF NOT EXISTS, CREATE OR REPLACE, the
--     role and the triggers only when absent. Nothing is dropped (RULE 1).
--
-- Notes:
--   - Slice DT1, 2026-10-08. Evidence: docs/evidence/ANA-SUMMARY/2026-10-08/DT1-run-events/.
--   - public, organization_id INTEGER NOT NULL: the integer tenant sweep that
--     closes C2C_MIGRATION_FILES gives the table its policy (CLAUDE.md RULE 1,
--     third corollary). The organisation is always the run's, copied from the
--     ana_runs row by the one writer's INSERT … SELECT.
--   - Writer: server/services/ana/run-events.ts. Owner only (the INSERT names
--     ana_runs.owner_instance), and only while the run has no sealed record
--     (the guard below). The owner flushes and AWAITS the mirror before it
--     seals the record, then releases the rows through the door.
--   - Working data, not the retained record. The sealed ana_turn_records row
--     is the Part 11 record and holds every event; this table holds a copy for
--     live reading and is deleted through three named, precondition-checked
--     doors, and through nothing else:
--       release_sealed_run_events   after the record is sealed (owner, reaper)
--       expire_orphaned_run_events  a run that ended with no record, after the
--                                   retention period (reaper; D-4: 90 days,
--                                   recommended, the founder's call)
--       purge_tenant_run_events     the tenant purge (PURGE_DOORS)
--     Each refuses under an active legal hold.
--   - Exported with the tenant: tenant-full-export discovers tenant-keyed
--     tables from the catalog.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ana_run_events (
  organization_id integer     NOT NULL REFERENCES organizations(id),
  run_id          text        NOT NULL REFERENCES ana_runs(id),
  -- 1–1,999 are events; 2,000 is the truncation marker and the last row a run
  -- can ever have. The record keeps every event; the cap is the mirror's.
  seq             integer     NOT NULL CHECK (seq BETWEEN 1 AND 2000),
  -- The event's own server time (TimelineEvent.at).
  at              timestamptz NOT NULL,
  event           jsonb       NOT NULL,
  -- When the row was written, for the governed expiry.
  written_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ana_run_events_org_run
  ON public.ana_run_events (organization_id, run_id, seq);
CREATE INDEX IF NOT EXISTS idx_ana_run_events_written
  ON public.ana_run_events (written_at);

-- =============================================================================
-- Append-only, with one governed way out.
--
--   UPDATE, TRUNCATE  always refused.
--   INSERT            refused once a turn record exists for the run: the
--                     record is then the only copy anyone should read, and an
--                     insert after it would be a row the release never sees.
--   DELETE            refused unless current_user is ana_run_events_purger,
--                     which is true inside the three door functions alone.
--
-- The INSERT check runs as the inserting role. The one writer inserts inside
-- the run's own tenant scope (run-events.ts flush), so under RLS_ENFORCE=on it
-- sees exactly that organisation's records, and the row it inserts must pass
-- the same organisation's WITH CHECK.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ana_run_events_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_LEVEL = 'STATEMENT' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: % cannot be truncated — its rows leave only through the run-event doors.',
      TG_TABLE_NAME
      USING ERRCODE = 'raise_exception';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: % row cannot be changed — a mirrored timeline event is written once.',
      TG_TABLE_NAME
      USING ERRCODE = 'raise_exception';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'ana_run_events_purger' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: % row cannot be deleted — its rows leave only through the run-event doors.',
      TG_TABLE_NAME
      USING ERRCODE = 'raise_exception',
            HINT = 'release_sealed_run_events, expire_orphaned_run_events or purge_tenant_run_events.';
  END IF;
  -- INSERT
  IF EXISTS (
    SELECT 1 FROM public.ana_turn_records t
     WHERE t.organization_id = NEW.organization_id AND t.run_id = NEW.run_id
  ) THEN
    RAISE EXCEPTION
      'RUN_EVENTS_SEALED: run % already has a sealed turn record; its timeline is read from the record.',
      NEW.run_id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_run_events_guard'
       AND tgrelid = 'public.ana_run_events'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_run_events_guard
      BEFORE INSERT OR UPDATE OR DELETE ON public.ana_run_events
      FOR EACH ROW EXECUTE FUNCTION public.ana_run_events_guard();
  END IF;
  -- A row trigger does not fire on TRUNCATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_run_events_no_truncate'
       AND tgrelid = 'public.ana_run_events'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_run_events_no_truncate
      BEFORE TRUNCATE ON public.ana_run_events
      FOR EACH STATEMENT EXECUTE FUNCTION public.ana_run_events_guard();
  END IF;
END
$$;

-- =============================================================================
-- The doors' owner. Created and verified as ana_record_purger is
-- (migrations/20260926_ana_turn_records.sql, the 2026-10-01 amendment).
-- =============================================================================
DO $purge$
DECLARE
  v_applier_is_super boolean;
  v_applier_can_set  boolean;
BEGIN
  -- NOLOGIN, no attributes, no inheritance: it exists only to own the doors,
  -- so the guard can recognise a door by current_user. Roles are cluster-wide
  -- and this file re-runs on every deploy, so never a plain CREATE ROLE.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ana_run_events_purger') THEN
    CREATE ROLE ana_run_events_purger
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;

  -- A non-superuser applier (the RDS master) must be able to SET ROLE to the
  -- owner it hands the functions to: ask first, grant itself membership if it
  -- can, otherwise fail closed with the remedy.
  SELECT rolsuper INTO v_applier_is_super FROM pg_roles WHERE rolname = current_user;
  IF NOT COALESCE(v_applier_is_super, false) THEN
    IF current_setting('server_version_num')::int >= 160000 THEN
      v_applier_can_set := pg_has_role(current_user, 'ana_run_events_purger', 'SET');
    ELSE
      v_applier_can_set := pg_has_role(current_user, 'ana_run_events_purger', 'MEMBER');
    END IF;
    IF NOT v_applier_can_set THEN
      BEGIN
        EXECUTE format('GRANT ana_run_events_purger TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION '[ana_run_events] % cannot become a member of ana_run_events_purger and so cannot install the doors', current_user
          USING HINT = format('Have a superuser run: GRANT ana_run_events_purger TO %I; then re-run the migration set.', current_user);
      END;
    END IF;
  END IF;

  -- What the doors read and delete, and nothing more.
  GRANT USAGE, CREATE ON SCHEMA public TO ana_run_events_purger;
  GRANT SELECT, DELETE ON public.ana_run_events TO ana_run_events_purger;
  GRANT SELECT ON public.ana_runs TO ana_run_events_purger;
  IF to_regclass('public.ana_turn_records') IS NOT NULL THEN
    GRANT SELECT ON public.ana_turn_records TO ana_run_events_purger;
  END IF;
  IF to_regclass('public.organizations') IS NOT NULL THEN
    GRANT SELECT ON public.organizations TO ana_run_events_purger;
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA vault TO ana_run_events_purger;
    GRANT SELECT ON vault.legal_holds TO ana_run_events_purger;
  END IF;
END
$purge$;

-- -----------------------------------------------------------------------------
-- Door 1: the rows of a run whose record is sealed.
--
-- Preconditions, restated here so the runtime role's credentials alone cannot
-- erase a live run's rows:
--   - with RLS enforcing, the caller's tenant scope is p_org (the owner after
--     sealing, and the reaper's pass, each open that scope);
--   - a turn record exists for (p_org, p_run);
--   - no active legal hold for p_org.
-- Deletes only that run's rows. Returns how many.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_sealed_run_events(p_org integer, p_run text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_holds   integer := 0;
  v_deleted integer;
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND NULLIF(current_setting('app.current_tenant_id', true), '') IS DISTINCT FROM p_org::text THEN
    RAISE EXCEPTION 'RUN_EVENTS_RELEASE_REFUSED: a run''s rows are released in that organization''s own scope (organization %).', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ana_turn_records t WHERE t.organization_id = p_org AND t.run_id = p_run
  ) THEN
    RAISE EXCEPTION 'RUN_EVENTS_RELEASE_REFUSED: run % of organization % has no sealed turn record.', p_run, p_org
      USING ERRCODE = 'raise_exception';
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL'
      INTO v_holds USING p_org;
  END IF;
  IF v_holds > 0 THEN
    RAISE EXCEPTION 'RUN_EVENTS_LEGAL_HOLD: organization % has % active legal hold(s); the rows are kept.', p_org, v_holds
      USING ERRCODE = 'raise_exception';
  END IF;
  DELETE FROM public.ana_run_events e WHERE e.organization_id = p_org AND e.run_id = p_run;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Door 2: the rows of runs that ended with no record, once old enough (D-4).
--
-- Preconditions:
--   - with RLS enforcing, the caller's tenant scope is p_org;
--   - p_older_than is at least the retention period (90 days) before now();
--   - no active legal hold for p_org;
--   - per run: ana_runs.status is terminal, no turn record exists, and every
--     one of its rows was written before p_older_than (a run is expired
--     whole, never in part).
-- Returns how many rows it deleted.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_orphaned_run_events(p_org integer, p_older_than timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_holds   integer := 0;
  v_deleted integer;
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND NULLIF(current_setting('app.current_tenant_id', true), '') IS DISTINCT FROM p_org::text THEN
    RAISE EXCEPTION 'RUN_EVENTS_EXPIRY_REFUSED: expiry runs in that organization''s own scope (organization %).', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_older_than IS NULL OR p_older_than > now() - interval '90 days' THEN
    RAISE EXCEPTION 'RUN_EVENTS_EXPIRY_REFUSED: rows younger than the 90-day retention period are kept (asked for %).', p_older_than
      USING ERRCODE = 'raise_exception';
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL'
      INTO v_holds USING p_org;
  END IF;
  IF v_holds > 0 THEN
    RAISE EXCEPTION 'RUN_EVENTS_LEGAL_HOLD: organization % has % active legal hold(s); the rows are kept.', p_org, v_holds
      USING ERRCODE = 'raise_exception';
  END IF;
  DELETE FROM public.ana_run_events e
   WHERE e.organization_id = p_org
     AND e.run_id IN (
       SELECT r.id FROM public.ana_runs r
        WHERE r.organization_id = p_org
          AND r.status IN ('cancelled', 'finished', 'failed')
          AND NOT EXISTS (
            SELECT 1 FROM public.ana_turn_records t WHERE t.organization_id = p_org AND t.run_id = r.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.ana_run_events n WHERE n.run_id = r.id AND n.written_at >= p_older_than
          )
     );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Door 3: the tenant purge. Preconditions copied from
-- purge_tenant_turn_records: the platform scope, the organization
-- pending_deletion, no active legal hold. Called through PURGE_DOORS
-- (server/services/tenant/tenant-offboarding.ts) before 'ana_runs' is purged,
-- which the foreign key requires.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_tenant_run_events(p_org integer)
RETURNS TABLE (events integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
  v_holds  integer := 0;
  v_events integer;
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION 'RUN_EVENTS_PURGE_REFUSED: the tenant purge runs in the platform scope, not a tenant scope (organization %).', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.status INTO v_status FROM public.organizations o WHERE o.id = p_org;
  IF v_status IS DISTINCT FROM 'pending_deletion' THEN
    RAISE EXCEPTION 'RUN_EVENTS_PURGE_REFUSED: organization % is not pending deletion (status %).', p_org, COALESCE(v_status, 'not found')
      USING ERRCODE = 'raise_exception';
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL'
      INTO v_holds USING p_org;
  END IF;
  IF v_holds > 0 THEN
    RAISE EXCEPTION 'RUN_EVENTS_PURGE_REFUSED: organization % has % active legal hold(s); its rows cannot be destroyed.', p_org, v_holds
      USING ERRCODE = 'raise_exception';
  END IF;
  DELETE FROM public.ana_run_events e WHERE e.organization_id = p_org;
  GET DIAGNOSTICS v_events = ROW_COUNT;
  RETURN QUERY SELECT v_events;
END;
$fn$;

DO $door$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.release_sealed_run_events(integer,text)',
    'public.expire_orphaned_run_events(integer,timestamp with time zone)',
    'public.purge_tenant_run_events(integer)'
  ] LOOP
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_fn::regprocedure) <> 'ana_run_events_purger' THEN
      EXECUTE format('ALTER FUNCTION %s OWNER TO ana_run_events_purger', v_fn);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_service', v_fn);
    END IF;

    -- Verify what was installed; a door in any other shape is no door.
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
       WHERE oid = v_fn::regprocedure
         AND prosecdef
         AND pg_get_userbyid(proowner) = 'ana_run_events_purger'
    ) THEN
      RAISE EXCEPTION '[ana_run_events] % is not SECURITY DEFINER owned by ana_run_events_purger', v_fn;
    END IF;
    IF has_function_privilege('public', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '[ana_run_events] % is executable by PUBLIC', v_fn;
    END IF;
  END LOOP;
END
$door$;
