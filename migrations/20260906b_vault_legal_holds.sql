-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — Vault document store
-- Compliance: litigation hold / spoliation; 21 CFR 11.10(c) record protection
-- Purpose: A legal hold that suspends retention disposition, so the retention
--          sweep cannot destroy a record that is under hold.
--
-- eCTD/CTD Context:
--   - Module(s): all
--   - Integrity Risk Addressed: server/jobs/retentionCron.ts:121 issues
--     `db.delete(vaultDocuments)` when the resolved policy sets hardDelete, and
--     nothing anywhere consulted a hold — a grep for legal_hold / legalHold /
--     litigation across server/, shared/ and client/ found only unapplied legacy
--     DDL that no runner applies. Destroying a record under hold is spoliation,
--     and it is the one operation in that path that cannot be undone.
--
-- Determinism Contract:
--   - Additive. One table and three indexes. No existing object is altered.
--
-- Notes:
--   - Idempotent (CREATE TABLE / INDEX IF NOT EXISTS). Re-runs every deploy per
--     RULE 1 in CLAUDE.md.
-- =============================================================================
--
-- WHY NOW, WHILE THE SWEEP IS INERT
--
-- `findExpiredDocuments` matches on `retention_until IS NOT NULL`, and nothing
-- in the tree writes that column — one read in retentionCron.ts and no writer
-- anywhere. So the sweep has never deleted anything. That is exactly why the
-- guard lands now: it has to exist before the clock starts, not after the first
-- record is gone.
--
-- WHY A TABLE AND NOT A BOOLEAN
--
-- A hold is asked about long after it ends: who placed it, under what matter,
-- when, and on whose authority it was lifted. A flag answers none of that, and
-- holds are additive — a document under two matters is released only when both
-- are lifted, which a boolean cannot express.
--
-- SCOPE IS DELIBERATELY COARSE
--
-- 'program' or 'document'. Custodian- and matter-level scoping is a real
-- requirement for a mature e-discovery flow and is NOT modelled here. A
-- program-wide hold is the honest blunt instrument until it is.

DO $mig$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault schema not present - skipping legal holds';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS vault.legal_holds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL,
    reference       TEXT NOT NULL,
    reason          TEXT NOT NULL,
    scope           TEXT NOT NULL,
    program_id      UUID,
    document_id     UUID,
    placed_by       INTEGER,
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lifted_at       TIMESTAMPTZ,
    lifted_by       INTEGER,
    lift_reason     TEXT,

    -- A hold that names nothing holds nothing. Enforced in the DATABASE rather
    -- than a service, because a row inserted by any other path would otherwise
    -- read as an active hold while covering no document — and the retention
    -- sweep would then be blocked by, or ignore, something nobody can interpret.
    CONSTRAINT vault_legal_holds_scope_target CHECK (
      (scope = 'program'  AND program_id  IS NOT NULL AND document_id IS NULL) OR
      (scope = 'document' AND document_id IS NOT NULL AND program_id  IS NULL)
    ),

    -- A lift is an event with an author and a reason, or it is not a lift.
    -- Without this a hold could be silently cleared by stamping one column.
    CONSTRAINT vault_legal_holds_lift_attributed CHECK (
      lifted_at IS NULL
      OR (lifted_by IS NOT NULL AND lift_reason IS NOT NULL AND length(btrim(lift_reason)) > 0)
    )
  );

  -- The sweep's lookup: active holds only, by what they cover.
  CREATE INDEX IF NOT EXISTS vault_legal_holds_program_idx
    ON vault.legal_holds (program_id) WHERE lifted_at IS NULL;
  CREATE INDEX IF NOT EXISTS vault_legal_holds_document_idx
    ON vault.legal_holds (document_id) WHERE lifted_at IS NULL;
  CREATE INDEX IF NOT EXISTS vault_legal_holds_org_idx
    ON vault.legal_holds (organization_id);

  RAISE NOTICE 'vault.legal_holds ready';
END
$mig$;
