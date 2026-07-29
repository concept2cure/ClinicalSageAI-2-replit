-- ============================================================================
-- Path-to-GA §C.11 — e-sig gate before transmit
-- Migration: widen orchestrator run status enum + add Part 11 §11.70-compliant
-- payload-binding + supersession columns to electronic_signatures.
-- ============================================================================
-- Date: 2026-06-29
-- Design: docs/reports/E_SIG_GATE_DESIGN_2026-06-29.md
--
-- This migration ships two additive changes in a single transaction:
--
--   1. submission_orchestrator_runs.status CHECK constraint is widened to
--      include the new run-level value 'awaiting-signature' (sibling to
--      'awaiting-async' added in 20260629_orchestrator_awaiting_async_status.sql).
--      The new `package.sign` orchestrator step parks the run in this state
--      between package.validate (gateway-readiness confirmed) and the human
--      e-signature event that releases the package for transmit.
--
--   2. electronic_signatures gains three new columns:
--        a. organization_id        — REQUIRED for §11.70 + tenant isolation.
--                                    Historically the table had no orgId;
--                                    every signature lookup MUST be scoped
--                                    by orgId to prevent cross-tenant probes
--                                    (Risk R-3 in the design doc, also
--                                     OQ-7).
--        b. bound_payload_digest   — NEW column for the orchestrator's
--                                    payload-binding hash. PER OQ-6: we DO
--                                    NOT overload the existing
--                                    `signature_hash` column, which is the
--                                    §11.200 attribution hash over
--                                    user/timestamp/reason metadata. Two
--                                    columns, two purposes, cleaner audit.
--                                    Defaults to '' so existing rows (which
--                                    were not produced for the release-gate
--                                    flow) don't violate NOT NULL — the new
--                                    code path always writes a non-empty
--                                    digest. A follow-up migration can
--                                    tighten the default away once history
--                                    is backfilled.
--        c. superseded_by          — PER OQ-4: §11.70 mandates append-only
--                                    signature history. When a release
--                                    signature is invalidated (rollback,
--                                    re-validate-after-sign, payload drift),
--                                    we do NOT delete the prior row. Instead
--                                    a NEW row is inserted carrying
--                                    superseded_by = <prior_row.id>. This
--                                    preserves the full forensic chain
--                                    (who signed what payload, when) while
--                                    letting the resume path filter on
--                                    `superseded_by IS NULL` to find the
--                                    active signature for the current
--                                    payload digest.
--
-- All three are nullable / defaulted so the migration is backward-compatible
-- (existing rows continue to satisfy constraints). The orchestrator + sign
-- route always populate them on the release-gate path.
--
-- Forward-only. Additive only. Does not modify any prior migration.
-- ============================================================================

BEGIN;

-- ── 1. Widen submission_orchestrator_runs.status CHECK ──────────────────────

ALTER TABLE submission_orchestrator_runs
  DROP CONSTRAINT IF EXISTS submission_orchestrator_runs_status_check;

ALTER TABLE submission_orchestrator_runs
  ADD CONSTRAINT submission_orchestrator_runs_status_check
  CHECK (status IN ('running', 'awaiting-async', 'awaiting-signature', 'complete', 'failed', 'partial'));

-- ── 2. electronic_signatures: organization_id (tenant scoping) ──────────────

ALTER TABLE electronic_signatures
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);

-- ── 3. electronic_signatures: bound_payload_digest (OQ-6 decision) ──────────

ALTER TABLE electronic_signatures
  ADD COLUMN IF NOT EXISTS bound_payload_digest TEXT NOT NULL DEFAULT '';

-- ── 4. electronic_signatures: superseded_by (OQ-4 §11.70 append-only) ───────

ALTER TABLE electronic_signatures
  ADD COLUMN IF NOT EXISTS superseded_by INTEGER REFERENCES electronic_signatures(id);

-- ── 5. Index supporting the resume-path lookup ──────────────────────────────
--
-- The orchestrator's resume path for package.sign issues:
--   SELECT id FROM electronic_signatures
--    WHERE organization_id = $orgId
--      AND bound_payload_digest = $digest
--      AND superseded_by IS NULL
--    ORDER BY created_at DESC LIMIT 1;
--
-- A composite index on (organization_id, bound_payload_digest) covers the
-- equality predicates; the partial WHERE superseded_by IS NULL keeps the
-- index narrow (only active signatures need to be findable by digest — every
-- superseded row is dead weight for this query).

CREATE INDEX IF NOT EXISTS electronic_signatures_org_payload_digest_idx
  ON electronic_signatures (organization_id, bound_payload_digest)
  WHERE superseded_by IS NULL;

COMMIT;
