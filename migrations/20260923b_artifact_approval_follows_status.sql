-- ─────────────────────────────────────────────────────────────────────────────
-- concept2cure_artifacts: an approval does not outlive the status that carries it
--
-- 2026-09-23 (W5/D7, final pass).
--
-- WHAT THIS FIXES. The filing rule (artifactApproval,
-- server/services/ectd/package-content-fingerprint.ts) files an artifact when
-- its status is approved/locked AND version = approved_version_id (and, when
-- locked, = published_version_id). Only the governed approval act records
-- approved_version_id: the status route's review → approved
-- (server/routes/c2c/artifacts.ts PUT …/status) and authoring-actions
-- approve-artifact, which apply the role check and the P12 review quorum.
--
-- Nothing cleared it when the approval was revoked. The status route's
-- approved → review, locked → draft, bundle-executor's markObjectSuperseded
-- (→ 'archived') and every other status writer left approved_version_id in
-- place. A later arrival at 'approved' by a path that is NOT the approval act —
-- promote_artifact (any APPROVAL_ROLES role, no quorum), the AnA
-- update_artifact_status command (archived → approved, review → approved) —
-- then made the artifact filable again at the old version, with no review.
--
-- THE RULE, in one place for every writer: a row whose status is not
-- 'approved' or 'locked' (case-insensitive, as isFinalizedStatus compares)
-- carries no approved_version_id and no published_version_id. A BEFORE INSERT
-- OR UPDATE trigger clears both in the same write, so a writer cannot forget.
-- Moving between 'approved' and 'locked' keeps them (a lock covers the approval
-- it locks). A revoked approval is re-established only by the approval act.
--
-- THE BACKFILL applies the same rule to rows written before the trigger
-- existed (a stale approval on an 'archived' or 'review' row is exactly the
-- resurrection this closes). It touches only rows that break the rule, so on
-- every later deploy it matches nothing.
--
-- REPLAY SAFETY (CLAUDE.md RULE 1). `CREATE OR REPLACE FUNCTION` is idempotent.
-- The trigger is created only when pg_trigger has no trigger of that name on
-- the table — the idiom of migrations/20260921_audit_logs_chain_seq.sql — so
-- this file carries no DROP of anything. To change the trigger's definition,
-- amend this file in place with a dated note; do not append a DROP.
--
-- THE GUARD. The trigger is installed only when concept2cure_artifacts exists
-- with both version columns. concept2cure_artifacts is a base table drizzle
-- push provisions and deploy-migrate asserts before the set runs; the guard is
-- for the set-only blank-database replay (tests/schema-contract C-33), where
-- there is no table, no approval to clear, and this file raises a NOTICE and
-- installs nothing. It makes no claim that the rule is in force there.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.concept2cure_artifacts_approval_follows_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF lower(coalesce(NEW.status, '')) NOT IN ('approved', 'locked') THEN
    NEW.approved_version_id := NULL;
    NEW.published_version_id := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DO $guard$
DECLARE
  cleared integer;
BEGIN
  IF to_regclass('public.concept2cure_artifacts') IS NULL
     OR (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'concept2cure_artifacts'
            AND column_name IN ('approved_version_id', 'published_version_id')) < 2 THEN
    RAISE NOTICE
      'concept2cure_artifacts (with approved_version_id, published_version_id) does not exist; approval-follows-status trigger NOT installed.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_concept2cure_artifacts_approval_follows_status'
       AND tgrelid = 'public.concept2cure_artifacts'::regclass
  ) THEN
    CREATE TRIGGER trg_concept2cure_artifacts_approval_follows_status
      BEFORE INSERT OR UPDATE ON public.concept2cure_artifacts
      FOR EACH ROW EXECUTE FUNCTION public.concept2cure_artifacts_approval_follows_status();
  END IF;

  -- The backfill must see every tenant's rows. The tenant policy
  -- (0021_enable_rls_everywhere) filters only when app.rls_enforce = 'on', which
  -- the application pool sets per connection and the migration connection does
  -- not; it is pinned off for this transaction so a database-level default
  -- cannot make the backfill match nothing, silently.
  PERFORM set_config('app.rls_enforce', 'off', true);
  UPDATE public.concept2cure_artifacts
     SET approved_version_id = NULL,
         published_version_id = NULL
   WHERE lower(coalesce(status, '')) NOT IN ('approved', 'locked')
     AND (approved_version_id IS NOT NULL OR published_version_id IS NOT NULL);
  GET DIAGNOSTICS cleared = ROW_COUNT;
  RAISE NOTICE 'concept2cure_artifacts: cleared a stale approval on % non-approved row(s).', cleared;
END
$guard$;

COMMIT;
