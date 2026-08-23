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
--       * The single legitimate DELETE — the retention/archival service — is
--         exempted via the fail-closed `app.audit_archive_bypass` GUC it
--         already sets with SET LOCAL on one dedicated connection.
--
--     Operator note: applying this makes audit history genuinely append-only in
--     production. That is the regulatory intent, and it is irreversible for any
--     tooling that expected to mutate audit rows. Confirm no external/admin
--     tooling does so in your environment before deploying.
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
--   exemption for the retention/archival service
--   server/services/audit/audit-archive.service.ts, which legitimately runs
--   `DELETE FROM audit_logs WHERE id = ANY(...)` after archiving rows to cold
--   storage. The exemption is a session GUC: the DELETE trigger ABORTS unless
--   `current_setting('app.audit_archive_bypass', true) = 'on'`. The archive
--   service sets that GUC with `SET LOCAL app.audit_archive_bypass = 'on'`
--   immediately before its DELETE, inside the same transaction, so the bypass is
--   scoped to that one transaction and reverts automatically at COMMIT/ROLLBACK.
--   No other code sets this GUC. A plain `DELETE FROM audit_logs` from any other
--   caller (attacker, admin tooling, accidental migration) still aborts, because
--   the GUC is unset (current_setting(..., true) returns NULL → not 'on'). Tamper
--   via an unauthorized DELETE is therefore now *prevented*, and the archival
--   path is *detectable* through the sha256 chain + HMAC seal
--   (server/services/audit/chain.ts) plus the cold-storage checksum.
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
--   * Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS, guarded
--     so it is a no-op if public.audit_logs does not exist yet. Re-running this
--     migration after the DELETE trigger was added is also a no-op (the trigger
--     and its bypass GUC are recreated, not duplicated).
--   * The DELETE exemption is fail-closed: the GUC defaults to unset, so absent an
--     explicit `SET LOCAL app.audit_archive_bypass = 'on'` every DELETE aborts.
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RAISE NOTICE 'public.audit_logs not present — skipping immutability triggers.';
    RETURN;
  END IF;

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
  -- 2. PREVENT DELETE on public.audit_logs — EXCEPT for the archival service.
  --    The retention/archival service (audit-archive.service.ts) legitimately
  --    DELETEs rows it has already copied to cold storage. It opts in per
  --    transaction with `SET LOCAL app.audit_archive_bypass = 'on'`. Any DELETE
  --    without that GUC set aborts. current_setting(name, true) returns NULL
  --    when the GUC is unset (the `true` = missing_ok), so the default path is
  --    "blocked". Mirrors the no-DELETE pattern in
  --    20260222_audit_events_immutability.sql (lines 46-66), plus the GUC gate.
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.enforce_audit_logs_no_delete()
  RETURNS TRIGGER AS $fn$
  BEGIN
    -- Controlled exemption: the archival service sets this GUC with SET LOCAL,
    -- scoping the bypass to its own transaction. coalesce guards the NULL the
    -- missing_ok form returns when the GUC was never set.
    IF coalesce(current_setting('app.audit_archive_bypass', true), '') = 'on' THEN
      RETURN OLD; -- archival-authorized delete: allow it through
    END IF;

    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: audit_logs are append-only'
    USING
      ERRCODE = 'P0A02',
        DETAIL  = 'DELETE is not permitted on audit_logs outside the authorized '
                'retention/archival path. Attempted to delete row id=' || OLD.id || '. '
                '21 CFR Part 11 §11.10(e) requires immutable audit trails.',
      HINT    = 'Only the archival service may delete, and only after copying rows '
                'to cold storage (it sets SET LOCAL app.audit_archive_bypass = ''on''). '
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
    '21 CFR Part 11 §11.10(e): blocks DELETE on audit_logs except the authorized archival path (SET LOCAL app.audit_archive_bypass = ''on'')';
  COMMENT ON FUNCTION public.enforce_audit_logs_no_truncate() IS
    '21 CFR Part 11 §11.10(e): blocks TRUNCATE on audit_logs (append-only audit trail)';
END;
$outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: Confirm triggers are installed.
-- Uses pg_trigger + pg_class (not information_schema.triggers, which omits
-- TRUNCATE triggers in PostgreSQL).
-- ─────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  trigger_count INTEGER;
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
    RAISE NOTICE 'public.audit_logs immutability enforced: % triggers installed (UPDATE, DELETE-except-archival, TRUNCATE)', trigger_count;
  END IF;
END;
$verify$;
