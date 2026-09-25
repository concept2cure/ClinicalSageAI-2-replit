-- ═══════════════════════════════════════════════════════════════════════════════
-- DB-Level Immutability Enforcement for public.audit_logs
--
-- ⚠️  DEPLOY-PATH STATUS — read before changing this file.
--     Produced by the security swarm for finding F7
--     (SECURITY_SWARM_AUDIT_2026-06-17.md) and originally marked "do NOT
--     auto-apply without DBA / compliance sign-off". That banner had an
--     unintended consequence: the file was never added to C2C_MIGRATION_FILES
--     and never given the `_gcc_` infix, so NO apply path installed it and
--     `public.audit_logs` stayed mutable on every deployed database for the
--     entire period the control was believed to exist. The runtime role holds
--     the default UPDATE/DELETE grant on `public` (scripts/db/provision-app-role.mjs),
--     so the application itself could rewrite audit history.
--
--     It is now wired into scripts/db/migration-set.mjs. Still ADDITIVE ONLY.
--     Pre-deploy verification performed against the tree (not assumed):
--       * INSERT untouched — the chained writer only ever INSERTs.
--       * No production code UPDATEs audit_logs. The only UPDATEs are PGlite
--         tests that build the table inline (so they never see these triggers)
--         and scripts/db-verify/verify-audit-chain.ts, a manual tamper-demo
--         that is not wired into CI.
--       * Nothing TRUNCATEs audit_logs anywhere in the repo.
--       * The single legitimate DELETE — the retention/archival service — goes
--         through public.audit_logs_archive_delete(), the SECURITY DEFINER
--         door installed below (see the 2026-09-25 amendment note).
--
--     Operator note: applying this makes audit history genuinely append-only in
--     production. That is the regulatory intent, and it is irreversible for any
--     tooling that expected to mutate audit rows. Confirm no external/admin
--     tooling does so in your environment before deploying.
--
-- AMENDED IN PLACE 2026-09-25 (row D5; security audit 2026-09-24 finding DP-04,
-- plan P0-8a; evidence docs/evidence/D6/2026-09-24-p0/P0-8a/; CLAUDE.md Rule 1:
-- this file re-runs on every deploy, so the change is here, not in an appended
-- migration).
--   WHAT WAS WRONG. The DELETE trigger let through any transaction that had run
--   `SET LOCAL app.audit_archive_bypass = 'on'`. A custom GUC needs no privilege
--   to set, so the runtime role — which holds DELETE on public tables — could
--   delete audit rows at will. Reproduced on PostgreSQL 16 as a
--   LOGIN NOSUPERUSER NOBYPASSRLS role: plain DELETE refused, `BEGIN; SET LOCAL
--   app.audit_archive_bypass='on'; DELETE; COMMIT` → DELETE 1
--   (docs/evidence/D6/2026-09-24-security-audit/repro/DP-03-DP-04-postgres16-transcript.txt §8–9).
--   WHAT CHANGED.
--   * The trigger no longer reads any setting. It permits a DELETE only when
--     current_user = 'audit_archiver', which is true only inside the SECURITY
--     DEFINER function below (or for a member of that role who SET ROLEs to it —
--     the applier, who as table owner could disable the trigger anyway).
--     `SET LOCAL app.audit_archive_bypass = 'on'` makes no difference to anyone.
--   * A NOLOGIN role `audit_archiver` (created idempotently) owns
--     public.audit_logs_archive_delete(p_ids uuid[], p_archive_locator text,
--     p_archive_sha256 text, p_cutoff timestamptz) — SECURITY DEFINER, search_path
--     pinned. It refuses (RAISE 'AUDIT_ARCHIVE_REFUSED', SQLSTATE P0A04) an empty
--     batch, an empty locator, a checksum that is not 64 hex characters, a cutoff
--     later than now() - 24 months, a batch naming a row that is not in
--     audit_logs, and any named row with created_at >= cutoff. It first writes
--     the deletion's own record to public.audit_log_archives (created here if
--     absent; append-only by its own triggers, SQLSTATE P0A05), then deletes
--     exactly the named rows and returns the count. The 24-month floor is the
--     hot window of docs/operations/audit-log-retention-policy.md ("Hot vs cold
--     split": hot ≤ 24 months, cold > 24 months; nothing newer leaves the table).
--   * EXECUTE on the function is revoked from PUBLIC and granted to the runtime
--     role. The runtime role is `app_service` by default
--     (scripts/db/provision-app-role.mjs, APP_SERVICE_DB_ROLE) and
--     20260813_audit_tamper_proof_log.sql reads the optional override
--     current_setting('app.service_role'); the grant below follows the same
--     convention and is a no-op when the role does not exist in pg_roles
--     (e.g. PGlite, a single-role dev database). On a provisioned estate the
--     recipe's `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public` and its default
--     privileges also cover it; the REVOKE FROM PUBLIC is what keeps every other
--     role out. audit_archiver gets USAGE on public, SELECT+DELETE on audit_logs
--     and INSERT on audit_log_archives — nothing else.
--   * Non-superuser applier (RDS master user, PG16): ALTER FUNCTION … OWNER TO
--     requires that the applier can SET ROLE to the new owner and that the new
--     owner has CREATE on the function's schema. The creator of a role holds
--     ADMIN OPTION on it in PG16 and grants itself membership below; CREATE on
--     schema public is granted to audit_archiver for that rule alone — the role
--     cannot log in and nothing runs as it except this function's fixed body.
--     Verified on PostgreSQL 16.13 with a CREATEROLE NOSUPERUSER applier
--     (evidence green/postgres16-nonsuperuser-applier.txt).
--   * public.audit_log_archives deliberately carries NO organization_id: an
--     archive batch spans tenants because the audit_logs sha256 chain is one
--     chain across tenants (scripts/ci/check-tenant-isolation.mjs, the archive
--     service's entry). It is an operational ledger of deletions, not tenant
--     data, and no request handler reads it. The tenant sweep leaves it alone.
--   * The function does not bypass RLS. If the caller's session has
--     app.rls_enforce='on' with no tenant context, the rows are invisible, the
--     "named rows not present" check fires and nothing is deleted.
--   Test: server/services/audit/__tests__/audit-archive-delete-door.pglite.integration.test.ts.
--   NOT changed here: the runtime role's DELETE privilege on public.audit_logs
--   (scripts/db/provision-app-role.mjs recipe; the trigger is the control until
--   that grant is withdrawn) and the anchored chain head (plan P0-8, other lanes).
--
-- REGULATORY BASIS: 21 CFR Part 11 §11.10(e) — audit trail records must be
-- immutable. The canonical queryable audit table `audit_logs` is sha256-chained
-- + HMAC-sealed (tamper *detectable*, see server/services/audit/chain.ts), but —
-- unlike `audit_events` and `audit.tamper_proof_log` — it had NO DB-level
-- trigger making UPDATE/DELETE *impossible*. This migration closes that gap so an
-- attacker (or accidental migration / admin tooling) cannot silently mutate or
-- delete history at the DB engine level. Defense in depth.
--
-- This is the SAME pattern used for:
--   - audit_events            (20260222_audit_events_immutability.sql)
--   - audit.concomitant_audit_logs / truth.clinical_truth_store (002_gcc_audit_immutability.sql)
--   - account_events / audit.signature_log (20260318_ga_immutability_hardening.sql)
--
-- SCOPE — UPDATE and TRUNCATE blocked unconditionally; DELETE blocked-except-archival:
--   This migration blocks UPDATE and TRUNCATE, which have NO legitimate caller
--   on audit_logs. It ALSO blocks DELETE — but with a single, tightly-scoped
--   door for the retention/archival service
--   server/services/audit/audit-archive.service.ts, which legitimately removes
--   rows after archiving them to cold storage and verifying the sink's
--   checksum. The door is public.audit_logs_archive_delete(): the DELETE trigger
--   ABORTS unless current_user is the function's owner, audit_archiver, which no
--   session can log in as and no session setting can produce. A plain
--   `DELETE FROM audit_logs` from any other caller (attacker, admin tooling,
--   accidental migration, the runtime role itself) aborts. Tamper via an
--   unauthorized DELETE is therefore *prevented*; the archival path is
--   *recorded* in public.audit_log_archives and *detectable* through the sha256
--   chain + HMAC seal (server/services/audit/chain.ts) plus the cold-storage
--   checksum the record carries.
--
-- ADDITIVITY / SAFETY:
--   * Append-only INSERTs are NOT affected — the legitimate chained writer in
--     server/services/auditService.ts only ever INSERTs into audit_logs
--     (computeAuditChainSealed → single INSERT), never UPDATE/TRUNCATE. Verified.
--   * audit_logs carries an `updated_at` column, so migration
--     20260526_updated_at_triggers.sql installs a BEFORE UPDATE `set_updated_at`
--     trigger on it. That trigger only matters when a row is UPDATEd — and no
--     legitimate path UPDATEs audit_logs, so the immutability trigger below
--     simply aborts any such attempt. The two BEFORE UPDATE triggers coexist;
--     ours raising an exception is the intended outcome.
--   * Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS, CREATE
--     TABLE IF NOT EXISTS, a pg_roles-guarded CREATE ROLE, and GRANT/REVOKE
--     (which are idempotent by nature), all guarded so the file is a no-op if
--     public.audit_logs does not exist yet. Re-running recreates, never
--     duplicates.
--   * The DELETE door is fail-closed: absent the function (or with it owned by
--     any role other than audit_archiver) every DELETE aborts.
--   * Does NOT alter/drop any column, the table, or any existing trigger.
--
-- Migration: 20260617_audit_logs_immutability.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Guard: only install when public.audit_logs exists (no-op otherwise).
-- ── The RAISE that never raised (fixed 2026-08-21) ───────────────────────────
-- Each guard below was written as
--     RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: … are append-only'
--     USING ERRCODE = …, MESSAGE = 'IMMUTABILITY_VIOLATION', DETAIL = …
-- which PostgreSQL rejects: the message is given twice, once as the RAISE
-- literal and once as USING MESSAGE. The trigger therefore aborted with
--     ERROR: RAISE option already specified: MESSAGE   (SQLSTATE 42601)
-- instead of the P0A0x IMMUTABILITY_VIOLATION it declares. The operation was
-- still blocked, so the audit trail was never actually at risk — but the error
-- code and message were both wrong, so every caller that matches on
-- /IMMUTABILITY_VIOLATION/ (server/routes/audit-trail-routes.ts,
-- server/startup/middleware.ts, and the esig/orchestrator contract tests) would
-- have failed to recognise it. A guard whose failure path has never been
-- executed is a guard nobody has tested; this one had not been.
--
-- The redundant `MESSAGE =` option is removed, keeping the RAISE literal as the
-- message — the form the repo's other immutability triggers already use
-- (20260730_esign_audit_db_level_immutability.sql,
-- 20260730_orchestrator_run_ledger_hardening.sql). The literal is the more
-- informative of the two, and it still matches /IMMUTABILITY_VIOLATION/.

DO $outer$
DECLARE
  v_applier_is_super boolean;
  v_applier_can_set  boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RAISE NOTICE 'public.audit_logs not present — skipping immutability triggers.';
    RETURN;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────────
  -- 0. The archiver role (2026-09-25). NOLOGIN, no attributes, no inheritance:
  --    it exists only to own the SECURITY DEFINER door so that the DELETE
  --    trigger can recognise the door by current_user. Never a plain CREATE
  --    ROLE — roles are cluster-wide and this file re-runs on every deploy.
  -- ───────────────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_archiver') THEN
    CREATE ROLE audit_archiver
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
    RAISE NOTICE '[audit_logs] role audit_archiver created (NOLOGIN)';
  END IF;

  SELECT rolsuper INTO v_applier_is_super FROM pg_roles WHERE rolname = current_user;
  IF NOT COALESCE(v_applier_is_super, false) THEN
    -- A non-superuser applier must be able to SET ROLE to the owner it hands the
    -- function to (ALTER FUNCTION … OWNER TO rule). Ask first: a membership a
    -- superuser granted earlier carries no ADMIN OPTION, so re-granting would be
    -- refused although nothing is missing (found by the B2 run in the evidence).
    -- PG16 distinguishes SET from bare membership; earlier servers do not.
    IF current_setting('server_version_num')::int >= 160000 THEN
      v_applier_can_set := pg_has_role(current_user, 'audit_archiver', 'SET');
    ELSE
      v_applier_can_set := pg_has_role(current_user, 'audit_archiver', 'MEMBER');
    END IF;
    IF NOT v_applier_can_set THEN
      -- In PG16 the creator of a role holds ADMIN OPTION on it and may grant
      -- itself membership; an applier that did not create the role needs a
      -- superuser to grant it once. Fail closed with the remedy, never install
      -- a door the applier cannot hand to audit_archiver.
      BEGIN
        EXECUTE format('GRANT audit_archiver TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION '[audit_logs] % cannot become a member of audit_archiver and so cannot install the archive door', current_user
          USING HINT = format('Have a superuser run: GRANT audit_archiver TO %I; then re-run the migration set.', current_user);
      END;
    END IF;
  END IF;

  GRANT USAGE ON SCHEMA public TO audit_archiver;
  -- Required by the OWNER TO rule for a non-superuser applier (the new owner
  -- must hold CREATE on the function's schema). The role cannot log in and
  -- nothing executes as it except the fixed body of the function below.
  GRANT CREATE ON SCHEMA public TO audit_archiver;
  GRANT SELECT, DELETE ON public.audit_logs TO audit_archiver;

  -- ───────────────────────────────────────────────────────────────────────────
  -- 0a. The deletion's own record (2026-09-25). One row per archived batch,
  --     written by the door before it deletes. Append-only by trigger.
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.audit_log_archives (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    archived_at     timestamptz NOT NULL DEFAULT now(),
    row_count       integer     NOT NULL CHECK (row_count > 0),
    min_created_at  timestamptz NOT NULL,
    max_created_at  timestamptz NOT NULL,
    cutoff          timestamptz NOT NULL,
    locator         text        NOT NULL CHECK (btrim(locator) <> ''),
    sha256          text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    performed_by    text        NOT NULL DEFAULT session_user,
    CONSTRAINT audit_log_archives_span_chk CHECK (min_created_at <= max_created_at AND max_created_at < cutoff)
  );
  CREATE INDEX IF NOT EXISTS audit_log_archives_archived_at_idx ON public.audit_log_archives (archived_at);
  COMMENT ON TABLE public.audit_log_archives IS
    'One row per batch removed from public.audit_logs by public.audit_logs_archive_delete(): what was removed (count, created_at span), under which cutoff, where it went (locator) and its sha256. Append-only (P0A05). Not tenant-keyed: a batch spans tenants.';

  GRANT INSERT ON public.audit_log_archives TO audit_archiver;

  CREATE OR REPLACE FUNCTION public.enforce_audit_log_archives_append_only()
  RETURNS TRIGGER AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: audit_log_archives is append-only'
    USING
      ERRCODE = 'P0A05',
      DETAIL  = TG_OP || ' is not permitted on audit_log_archives. It is the record of every '
                'batch removed from audit_logs (21 CFR Part 11 §11.10(e)).',
      HINT    = 'Write a new archive record; never modify or remove one.';
    RETURN NULL; -- never reached
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_audit_log_archives_no_update ON public.audit_log_archives;
  CREATE TRIGGER trg_audit_log_archives_no_update
    BEFORE UPDATE ON public.audit_log_archives
    FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_archives_append_only();

  DROP TRIGGER IF EXISTS trg_audit_log_archives_no_delete ON public.audit_log_archives;
  CREATE TRIGGER trg_audit_log_archives_no_delete
    BEFORE DELETE ON public.audit_log_archives
    FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_archives_append_only();

  DROP TRIGGER IF EXISTS trg_audit_log_archives_no_truncate ON public.audit_log_archives;
  CREATE TRIGGER trg_audit_log_archives_no_truncate
    BEFORE TRUNCATE ON public.audit_log_archives
    FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_audit_log_archives_append_only();

  -- ───────────────────────────────────────────────────────────────────────────
  -- 0b. The door (2026-09-25). SECURITY DEFINER, owned by audit_archiver, so
  --     that inside it current_user = 'audit_archiver' and the DELETE trigger
  --     lets exactly this body through. Every check fails closed with
  --     AUDIT_ARCHIVE_REFUSED (P0A04); the caller (the archive service) must
  --     treat that as "rows remain in the hot table".
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.audit_logs_archive_delete(
    p_ids             uuid[],
    p_archive_locator text,
    p_archive_sha256  text,
    p_cutoff          timestamptz
  )
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $fn$
  DECLARE
    -- Hot window, docs/operations/audit-log-retention-policy.md ("Hot vs cold
    -- split"): rows ≤ 24 months old stay queryable; nothing newer may leave.
    v_floor   constant interval := interval '24 months';
    v_ids     uuid[];
    v_named   integer;
    v_found   integer;
    v_min     timestamptz;
    v_max     timestamptz;
    v_deleted integer;
  BEGIN
    IF current_user <> 'audit_archiver' THEN
      -- Only reachable if ownership was changed after install: fail closed
      -- rather than run the DELETE as some other role.
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: the archive door is not owned by audit_archiver (runs as %)', current_user
        USING ERRCODE = 'P0A04';
    END IF;

    SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_ids) AS u(x) WHERE x IS NOT NULL;
    v_named := COALESCE(cardinality(v_ids), 0);
    IF v_named = 0 THEN
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: the batch names no rows'
        USING ERRCODE = 'P0A04';
    END IF;
    IF p_archive_locator IS NULL OR btrim(p_archive_locator) = '' THEN
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: the archive locator is empty'
        USING ERRCODE = 'P0A04',
              HINT = 'The sink must report where the batch was written before any row leaves audit_logs.';
    END IF;
    IF p_archive_sha256 IS NULL OR p_archive_sha256 !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: the archive sha256 is missing or is not a 64-hex-character digest'
        USING ERRCODE = 'P0A04',
              DETAIL = format('got %L', p_archive_sha256);
    END IF;
    IF p_cutoff IS NULL OR p_cutoff > now() - v_floor THEN
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: cutoff % is inside the %-month hot window (floor %)',
        p_cutoff, extract(month from v_floor) + 12 * extract(year from v_floor), now() - v_floor
        USING ERRCODE = 'P0A04',
              HINT = 'docs/operations/audit-log-retention-policy.md: rows 24 months old or newer stay in the hot table.';
    END IF;

    -- Serialise door invocations so two concurrent runs cannot both pass the
    -- checks on the same batch: SHARE UPDATE EXCLUSIVE conflicts with itself
    -- but not with the audit writer's INSERTs (ROW EXCLUSIVE). Row locks
    -- (FOR UPDATE) would need UPDATE privilege, which this role must not hold;
    -- LOCK TABLE at this level needs DELETE, which it has.
    LOCK TABLE public.audit_logs IN SHARE UPDATE EXCLUSIVE MODE;
    -- Every named row must be present and older than the cutoff.
    SELECT count(*), min(created_at), max(created_at)
      INTO v_found, v_min, v_max
      FROM public.audit_logs
     WHERE id = ANY(v_ids);
    IF v_found <> v_named THEN
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: % of % named rows are not in audit_logs', v_named - v_found, v_named
        USING ERRCODE = 'P0A04',
              HINT = 'Re-select the batch from the hot table; never delete a batch whose membership has changed.';
    END IF;
    IF v_max >= p_cutoff THEN
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: the batch contains a row newer than the cutoff (newest % >= cutoff %)', v_max, p_cutoff
        USING ERRCODE = 'P0A04';
    END IF;

    -- The deletion's own audit record, written before the deletion so a failure
    -- between the two leaves a record and the rows, never rows gone unrecorded.
    INSERT INTO public.audit_log_archives
      (row_count, min_created_at, max_created_at, cutoff, locator, sha256, performed_by)
    VALUES
      (v_named, v_min, v_max, p_cutoff, p_archive_locator, p_archive_sha256, session_user);

    DELETE FROM public.audit_logs WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> v_named THEN
      -- Cannot happen under the table lock unless a policy hid rows between
      -- the check and the delete; abort the whole batch (the record rolls back).
      RAISE EXCEPTION 'AUDIT_ARCHIVE_REFUSED: deleted % rows but the batch named %', v_deleted, v_named
        USING ERRCODE = 'P0A04';
    END IF;
    RETURN v_deleted;
  END;
  $fn$;

  REVOKE ALL ON FUNCTION public.audit_logs_archive_delete(uuid[], text, text, timestamptz) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.audit_logs_archive_delete(uuid[], text, text, timestamptz) TO audit_archiver;
  ALTER FUNCTION public.audit_logs_archive_delete(uuid[], text, text, timestamptz) OWNER TO audit_archiver;

  COMMENT ON FUNCTION public.audit_logs_archive_delete(uuid[], text, text, timestamptz) IS
    'The only DELETE path for public.audit_logs (21 CFR Part 11 §11.10(e)). SECURITY DEFINER, owned by audit_archiver: records the batch in public.audit_log_archives, then deletes exactly the named rows. Refuses (P0A04) a row newer than the cutoff, a cutoff inside the 24-month hot window, an empty/malformed locator or sha256, or a row that is not present.';

  -- ───────────────────────────────────────────────────────────────────────────
  -- 1. PREVENT UPDATE on public.audit_logs
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.enforce_audit_logs_no_update()
  RETURNS TRIGGER AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: audit_logs are append-only'
    USING
      ERRCODE = 'P0A01',
        DETAIL  = 'UPDATE is not permitted on audit_logs. '
                'Attempted to update row id=' || OLD.id || '. '
                '21 CFR Part 11 §11.10(e) requires immutable audit trails.',
      HINT    = 'Insert a new corrective event (e.g., AMENDMENT, REVOCATION) rather than modifying history.';
    RETURN NULL; -- never reached
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON public.audit_logs;

  CREATE TRIGGER trg_audit_logs_no_update
    BEFORE UPDATE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_audit_logs_no_update();

  -- ───────────────────────────────────────────────────────────────────────────
  -- 2. PREVENT DELETE on public.audit_logs — EXCEPT through the archive door.
  --    The retention/archival service (audit-archive.service.ts) removes rows
  --    it has already copied to cold storage by calling
  --    public.audit_logs_archive_delete(). That function is SECURITY DEFINER
  --    and owned by audit_archiver, so inside it current_user is
  --    'audit_archiver'; nowhere else is. No session setting is consulted
  --    (2026-09-25: the former `app.audit_archive_bypass` GUC was settable by
  --    any session and is no longer read). Mirrors the no-DELETE pattern in
  --    20260222_audit_events_immutability.sql (lines 46-66), plus the owner gate.
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.enforce_audit_logs_no_delete()
  RETURNS TRIGGER AS $fn$
  BEGIN
    -- Controlled door: only the SECURITY DEFINER archive function runs as this
    -- role. A setting cannot produce it; only ownership of the door can.
    IF current_user = 'audit_archiver' THEN
      RETURN OLD; -- archival-authorized delete: allow it through
    END IF;

    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: audit_logs are append-only'
    USING
      ERRCODE = 'P0A02',
        DETAIL  = 'DELETE is not permitted on audit_logs outside the authorized '
                'retention/archival path. Attempted to delete row id=' || OLD.id || ' as ' || current_user || '. '
                '21 CFR Part 11 §11.10(e) requires immutable audit trails.',
      HINT    = 'Only public.audit_logs_archive_delete(ids, locator, sha256, cutoff) may delete, and only rows '
                'older than the 24-month hot window that have been written to cold storage. '
                'The session setting app.audit_archive_bypass is not honoured. '
                'Insert a superseding event rather than deleting history.';
    RETURN NULL; -- never reached
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON public.audit_logs;

  CREATE TRIGGER trg_audit_logs_no_delete
    BEFORE DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_audit_logs_no_delete();

  -- ───────────────────────────────────────────────────────────────────────────
  -- 3. PREVENT TRUNCATE on public.audit_logs
  --    (TRUNCATE is blocked unconditionally — the archival path uses DELETE, not
  --     TRUNCATE, so there is no legitimate TRUNCATE caller.)
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.enforce_audit_logs_no_truncate()
  RETURNS TRIGGER AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: audit_logs are append-only'
    USING
      ERRCODE = 'P0A03',
        DETAIL  = 'TRUNCATE is not permitted on audit_logs. '
                '21 CFR Part 11 §11.10(e) requires immutable audit trails.',
      HINT    = 'This is a regulatory compliance control. Archive via partitioning instead of truncating.';
    RETURN NULL;
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON public.audit_logs;

  CREATE TRIGGER trg_audit_logs_no_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.enforce_audit_logs_no_truncate();

  COMMENT ON FUNCTION public.enforce_audit_logs_no_update() IS
    '21 CFR Part 11 §11.10(e): blocks UPDATE on audit_logs (append-only audit trail)';
  COMMENT ON FUNCTION public.enforce_audit_logs_no_delete() IS
    '21 CFR Part 11 §11.10(e): blocks DELETE on audit_logs except inside public.audit_logs_archive_delete() (current_user = audit_archiver); no session setting is consulted';
  COMMENT ON FUNCTION public.enforce_audit_logs_no_truncate() IS
    '21 CFR Part 11 §11.10(e): blocks TRUNCATE on audit_logs (append-only audit trail)';
END;
$outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EXECUTE on the door for the runtime role (2026-09-25).
--    Same convention as 20260813_audit_tamper_proof_log.sql: the optional
--    setting app.service_role names the runtime role, default app_service
--    (scripts/db/provision-app-role.mjs). No-op when the role is absent, so
--    PGlite and single-role databases apply cleanly. The runtime role may also
--    read the archive ledger.
-- ─────────────────────────────────────────────────────────────────────────────
DO $grant$
DECLARE
  app_role text := current_setting('app.service_role', TRUE);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RETURN;
  END IF;
  IF to_regprocedure('public.audit_logs_archive_delete(uuid[], text, text, timestamptz)') IS NULL THEN
    RETURN; -- the block above raised; its message is the one to read
  END IF;
  IF app_role IS NULL OR app_role = '' THEN app_role := 'app_service'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.audit_logs_archive_delete(uuid[], text, text, timestamptz) TO %I', app_role);
    EXECUTE format('GRANT SELECT ON public.audit_log_archives TO %I', app_role);
    RAISE NOTICE '[audit_logs] archive door EXECUTE granted to %', app_role;
  ELSE
    RAISE NOTICE '[audit_logs] runtime role % not present; archive door EXECUTE not granted here (provision-app-role.mjs grants EXECUTE on public functions when it runs)', app_role;
  END IF;
END
$grant$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: Confirm triggers are installed and the door is shaped as
-- designed. Uses pg_trigger + pg_class (not information_schema.triggers, which
-- omits TRUNCATE triggers in PostgreSQL). The door checks RAISE, because a door
-- that PUBLIC can execute, or that runs as the wrong owner, is the defect this
-- file exists to close (2026-09-25).
-- ─────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  trigger_count INTEGER;
  door_owner    TEXT;
  door_secdef   BOOLEAN;
  door_public   BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RETURN; -- table absent; nothing to verify
  END IF;

  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'audit_logs'
    AND t.tgname LIKE 'trg_audit_logs_no_%'
    AND NOT t.tgisinternal;

  IF trigger_count < 3 THEN
    RAISE WARNING 'Expected 3 immutability triggers on public.audit_logs (UPDATE, DELETE, TRUNCATE), found %', trigger_count;
  ELSE
    RAISE NOTICE 'public.audit_logs immutability enforced: % triggers installed (UPDATE, DELETE-except-archive-door, TRUNCATE)', trigger_count;
  END IF;

  IF to_regprocedure('public.audit_logs_archive_delete(uuid[], text, text, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'public.audit_logs_archive_delete is not installed: audit_logs has no archive path (see the error above)';
  END IF;

  SELECT pg_get_userbyid(p.proowner), p.prosecdef,
         COALESCE((SELECT bool_or(a.grantee = 0) FROM aclexplode(p.proacl) a WHERE a.privilege_type = 'EXECUTE'), false)
    INTO door_owner, door_secdef, door_public
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.audit_logs_archive_delete(uuid[], text, text, timestamptz)');

  IF door_owner IS DISTINCT FROM 'audit_archiver' OR NOT COALESCE(door_secdef, false) THEN
    RAISE EXCEPTION 'public.audit_logs_archive_delete must be SECURITY DEFINER and owned by audit_archiver (owner %, secdef %)', door_owner, door_secdef;
  END IF;
  IF door_public THEN
    RAISE EXCEPTION 'public.audit_logs_archive_delete is executable by PUBLIC; the REVOKE did not take';
  END IF;
  RAISE NOTICE 'public.audit_logs archive door verified: SECURITY DEFINER, owner audit_archiver, not executable by PUBLIC';
END;
$verify$;
