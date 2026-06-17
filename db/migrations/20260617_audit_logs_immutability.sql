-- ═══════════════════════════════════════════════════════════════════════════════
-- DB-Level Immutability Enforcement for public.audit_logs
--
-- ⚠️  REQUIRES REVIEW BEFORE DEPLOY — produced by the security swarm for finding
--     F7 (SECURITY_SWARM_AUDIT_2026-06-17.md). ADDITIVE ONLY. Do NOT auto-apply
--     without DBA / compliance sign-off.
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
-- SCOPE — UPDATE and TRUNCATE only (DELETE intentionally NOT blocked here):
--   This migration blocks UPDATE and TRUNCATE, which have NO legitimate caller
--   on audit_logs. It does NOT block DELETE, because the retention/archival
--   service server/services/audit/audit-archive.service.ts legitimately runs
--   `DELETE FROM audit_logs WHERE id = ANY(...)` after archiving rows to cold
--   storage. A blanket no-DELETE trigger would break that path. DELETE
--   immutability requires a coordinated archival exemption (e.g. a session GUC
--   set by the archive service) — specified as a follow-up in
--   docs/AUDIT_INTEGRITY_HMAC_PLAN.md and deferred to avoid a production
--   regression. Tamper via DELETE remains *detectable* through the sha256 chain
--   + HMAC seal (server/services/audit/chain.ts) in the interim.
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
--     so it is a no-op if public.audit_logs does not exist yet.
--   * Does NOT alter/drop any column, the table, or any existing trigger.
--
-- Migration: 20260617_audit_logs_immutability.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Guard: only install when public.audit_logs exists (no-op otherwise).
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
      MESSAGE = 'IMMUTABILITY_VIOLATION',
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
  -- 2. PREVENT TRUNCATE on public.audit_logs
  --    (DELETE is intentionally NOT blocked — see SCOPE note in the header:
  --     the archival/retention service legitimately DELETEs archived rows.)
  -- ───────────────────────────────────────────────────────────────────────────
  CREATE OR REPLACE FUNCTION public.enforce_audit_logs_no_truncate()
  RETURNS TRIGGER AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: audit_logs are append-only'
    USING
      ERRCODE = 'P0A03',
      MESSAGE = 'IMMUTABILITY_VIOLATION',
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

  IF trigger_count < 2 THEN
    RAISE WARNING 'Expected 2 immutability triggers on public.audit_logs (UPDATE, TRUNCATE), found %', trigger_count;
  ELSE
    RAISE NOTICE 'public.audit_logs immutability enforced: % triggers installed (UPDATE, TRUNCATE)', trigger_count;
  END IF;
END;
$verify$;
