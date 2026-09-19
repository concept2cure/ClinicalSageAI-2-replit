-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Retire the `submission-orchestrator` catalog row. The surface it
--          entitled was a DUPLICATE and has been deleted; a catalog row for a
--          screen nobody can open is a capability claim with nothing behind it.
--
-- eCTD/CTD Context:
--   - Module(s): none. This file now only stands a catalog row back down.
--   - Integrity Risk Addressed: a catalog row states a capability is available
--     and is what `provision_org_modules()` iterates when granting. Leaving one
--     for a deleted surface means an organization can be granted — and billed
--     for — an entitlement that resolves to no screen.
--
-- Determinism Contract:
--   - Data-only. No DDL, no canonical schema change, no evidence pointer moves.
--
-- AMENDED IN PLACE 2026-09-07 (was: seed the row).
--
--   WHAT CHANGED AND WHY. This file originally seeded `submission-orchestrator`
--   into available_modules, because a new surface of that name had been added
--   to the shell's "Submit & file" groups and the shell must never present an
--   app the catalog cannot express an entitlement for.
--
--   That surface should never have existed. `ectd-compile` is already "the
--   cross-document assemble the submission surface" — status, validate,
--   compile, history, real rendered leaves and a real ICH backbone — so a
--   second screen for assembling a submission was precisely the parallel path
--   CLAUDE.md's zero-duplication rule forbids. The three panels that were
--   genuinely new (orchestrator pipeline steps, the append-only audit trail,
--   the Part 11 release-signature record) have been folded into EctdCompile.tsx
--   and the duplicate surface, its registry entry, its view-map entry and its
--   navigation entries were all deleted in the same change, as that rule
--   requires.
--
--   WHY AMENDED RATHER THAN A NEW DROP FILE. CLAUDE.md RULE 1: the applier
--   re-executes every entry of C2C_MIGRATION_FILES on every deploy, so a
--   follow-up file that removed what this one adds would either revert (placed
--   before) or re-create-then-remove on every deploy (placed after). Amending
--   the creating migration is the correct move for a set that replays, and this
--   header is the self-documentation that amendment requires.
--
--   WHY DEPRECATE RATHER THAN DELETE. `module_subscriptions.module_id` is a
--   foreign key into this table. A DELETE would fail for any organization that
--   had already been granted the module, and would destroy the record that the
--   grant ever existed. Deprecation is the established retirement in this
--   catalog: `provision_org_modules()` skips a deprecated row, so nothing new
--   is granted, and the audit history stays intact.
--
--   Idempotent and safe whether or not the row was ever applied: the UPDATE is
--   a no-op when no such row exists.
-- =============================================================================

BEGIN;

-- Stand the row down. Guarded so a re-apply does not churn `updated_at` — the
-- out-of-band applier re-runs this file on every deploy.
UPDATE available_modules
   SET metadata   = jsonb_set(
                      COALESCE(metadata::jsonb, '{}'::jsonb),
                      '{deprecated}',
                      'true'::jsonb,
                      true
                    )::json,
       updated_at = now()
 WHERE module_id = 'submission-orchestrator'
   AND COALESCE((metadata::jsonb ->> 'deprecated')::boolean, false) = false;

-- Assert the end state rather than assuming the UPDATE did what it reads like.
-- A row that is still live would keep the deleted surface sellable and
-- grantable; that is worse than a failed migration, so fail closed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM available_modules
     WHERE module_id = 'submission-orchestrator'
       AND COALESCE((metadata::jsonb ->> 'deprecated')::boolean, false) = false
  ) THEN
    RAISE EXCEPTION
      'submission-orchestrator catalog row is still live; the surface it entitles was deleted';
  END IF;
END $$;

COMMIT;
