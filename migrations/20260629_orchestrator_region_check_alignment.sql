-- 2026-09-25 AMENDED IN PLACE (W2 / D1, docs/evidence/W2/2026-09-25-replay-rebuilds-nothing/):
-- submission_orchestrator_runs_region_check is now replaced only when the live definition
-- (pg_get_constraintdef) differs from the one below. Unconditional, every deploy dropped
-- and re-added it — a full validation scan under lock (ACCESS EXCLUSIVE for a CHECK;
-- writes blocked on child and parent for a FOREIGN KEY) while the application served.
-- The definitions are unchanged. Pinned by npm run ci:replay-rebuilds-nothing.
-- ============================================================================
-- Reconciliation Move 7 — align orchestrator region CHECK with route Zod
-- ============================================================================
-- Date: 2026-06-29
-- Audit: docs/reports/RECONCILIATION_AUDIT_2026-06-29.md (Move 7)
--
-- Migration 0018 created submission_orchestrator_runs with
--   CHECK (region IN ('US', 'EU', 'JP', 'CA'))
-- while server/routes/submission-orchestrator.ts:41 accepts 13 regions:
--   ['US', 'EU', 'JP', 'CA', 'UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL']
--
-- A submission targeting any of the 9 missing regions silently fails at
-- persist (caught by submission-package-orchestrator.ts's try/catch and only
-- logged as a warning — the run still proceeds in memory with no DB row).
-- The route returned 200 + a runId; auditors saw no row. This is exactly
-- the kind of silent data loss that surfaces in a regulatory inspection
-- months later.
--
-- This migration drops the narrow constraint and replaces it with one that
-- mirrors the Zod enum. Forward-only — does NOT modify migration 0018.
--
-- ── 2026-09-18 — put on an applier, and made safe to put on one ─────────────
-- Until today this file was on NO applier: absent from C2C_MIGRATION_FILES and
-- not referenced by the store port. It is now listed in the set, immediately
-- after the port that creates the table, so the DROP below always has the
-- port's inline narrow CHECK to replace on a bare database and never runs
-- before its table exists.
--
-- What the gap actually was, measured rather than assumed. This file lives in
-- the root `migrations/` tree, which install-fresh DOES apply as its step-3
-- overlay — so a freshly installed database already had the 13-value constraint
-- from here, and the narrow four-value one never reached it (push creates the
-- table at step 2, so the `CREATE TABLE IF NOT EXISTS` in both 0018 and the port
-- is a no-op and their inline CHECK never runs). Verified: after install-fresh
-- alone, the live definition is this list.
--
-- The gap was the OTHER applier. Absent from C2C_MIGRATION_FILES, deploy-migrate
-- never ran this file, so an existing database never received the widening, and
-- any future amendment here would have reached new installs only — the same
-- class as WO-15 findings 3 and 5 and the sixteen tables the KNOWN_UNLISTED
-- triage closed in a8e1cff2. Listing it fixes that, and gives the constraint two
-- independent appliers instead of one.
--
-- CORRECTION, recorded because the wrong version informed this header's first
-- draft: an earlier measurement reported "no CHECK at all" on a provisioned
-- database. That database's install-fresh had aborted at step 2 during the
-- 2026-09-17/18 provisioning break, so the overlay never ran and nothing had
-- applied this file. It was an artifact of a broken install, not the shape of a
-- healthy one.
--
-- Two changes make it safe to apply to a populated database:
--
--   NOT VALID — a plain ADD CONSTRAINT scans every existing row and ABORTS the
--   whole deploy if one is off-list. That is a bad trade for a domain check:
--   it would take the deploy down to protect rows already written. NOT VALID
--   enforces every INSERT and UPDATE from now on while leaving history alone.
--
--   then an opportunistic VALIDATE — so a database whose rows are all in the
--   domain (which is every database whose writes came through the route, since
--   its Zod enum is this list) still ends up with a fully validated constraint.
--   If validation fails the migration does NOT: it raises a NOTICE naming the
--   problem and leaves the NOT VALID constraint in place, still enforcing new
--   writes. An operator can clean the rows and re-run.
--
-- Idempotent across replays: DROP IF EXISTS then ADD is a matched pair, and the
-- VALIDATE step is a no-op once the constraint is already validated.
--
-- NOT reconciled here, and named rather than quietly picked: the route's Zod
-- enum has these 13 values while the service's own `RegionCode`
-- (server/services/module3-extensions.ts:30) has four — 'US' | 'EU' | 'JP' |
-- 'CA'. This constraint matches the ROUTE, which is the wider of the two and
-- the one callers actually reach; narrowing to four would re-create the
-- original defect. Which list is canonical is a product decision.
-- ============================================================================

BEGIN;

-- Replaced only when the live definition differs (2026-09-25, see the header):
-- unconditionally, every deploy re-validated it under lock while the app served.
DO $keep_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = to_regclass('public.submission_orchestrator_runs') AND conname = 'submission_orchestrator_runs_region_check'
       AND pg_get_constraintdef(oid) = $def$CHECK ((region = ANY (ARRAY['US'::text, 'EU'::text, 'JP'::text, 'CA'::text, 'UK'::text, 'CN'::text, 'AU'::text, 'CH'::text, 'BR'::text, 'IN'::text, 'KR'::text, 'SG'::text, 'GLOBAL'::text])))$def$
  ) THEN
    ALTER TABLE IF EXISTS submission_orchestrator_runs
      DROP CONSTRAINT IF EXISTS submission_orchestrator_runs_region_check;

    ALTER TABLE IF EXISTS submission_orchestrator_runs
      ADD CONSTRAINT submission_orchestrator_runs_region_check
      CHECK (region IN (
        'US', 'EU', 'JP', 'CA', 'UK', 'CN',
        'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL'
      )) NOT VALID;
  END IF;
END
$keep_check$;

DO $region_validate$
BEGIN
  IF to_regclass('public.submission_orchestrator_runs') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE submission_orchestrator_runs
      VALIDATE CONSTRAINT submission_orchestrator_runs_region_check;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE
      'submission_orchestrator_runs_region_check left NOT VALID: existing row(s) carry a region outside the 13 the route accepts. New writes ARE enforced. Repair the rows and re-run to validate.';
  END;
END
$region_validate$;

COMMIT;
