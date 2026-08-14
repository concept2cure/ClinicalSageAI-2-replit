-- ============================================================================
-- Phase 4 D6 — SINGLE E-SIGNATURE WRITE PATH (governed sign → electronic_signatures)
-- ============================================================================
-- Date: 2026-08-13
--
-- WHY. /api/c2c/actions/sign — the governed sign action every freeze/dispatch
-- chain uses (Submission Center, authoring flows) — wrote the sha256-chained
-- audit_logs + c2c_ana_actions ledger but NOT electronic_signatures, while
-- /api/esignature/sign wrote electronic_signatures only. Two parallel signing
-- substrates: a Part 11 inspector querying electronic_signatures missed every
-- governed sign. The governed sign action now ALSO persists an
-- electronic_signatures row in the SAME transaction as its ledger write
-- (server/services/part11/signature-persistence.ts).
--
-- WHAT. Governed sign targets are typed pointers (ectd-sequence:<id>,
-- document:<id>, …) — NOT rows of documents/document_versions — so this
-- migration:
--   1. Relaxes document_id / version_id to nullable. Existing writers
--      (/api/esignature/sign, part11ComplianceService.createElectronicSignature,
--      submission-sign-release) still always provide both — enforced in code —
--      so no existing signing path is weakened.
--   2. Adds signed_target — the governed typed target pointer, the anchor for
--      rows born from the governed sign action.
--   3. Adds binding_basis — EXPLICIT provenance of bound_payload_digest:
--        'document-version-content-sha256'     (legacy document signing)
--        'ectd-sequence-leaf-manifest-sha256'  (derived sequence content hash)
--        'c2c-document-sections-sha256'        (derived document content hash)
--        'c2c-document-section-sha256'         (derived section content hash)
--        'governed-action-sha256-chain'        (no content hash derivable —
--                                               digest carries the ledger's
--                                               audit sha256 chain hash; an
--                                               honest ledger link, NOT a
--                                               content hash)
--      NULL on historical rows (their basis is derivable from which writer
--      created them; new writes always set it).
--   4. Adds a fail-closed anchor CHECK: every signature row must be anchored
--      to a document version pair OR a signed_target. No anchorless
--      "signatures" can ever be inserted. All historical rows satisfy the
--      document-pair arm.
--   5. Adds an inspector/lookup index over (organization_id, signed_target).
--
-- Additive + backward-compatible. Forward-only. Does not modify any prior
-- migration. Fresh installs get the columns from drizzle push (shared/schema.ts);
-- the CHECK constraint is SQL-only (drizzle cannot express it) and applies via
-- this file on the deploy-migrate path.
-- ============================================================================

BEGIN;

-- ── 1. Relax the document anchor (governed targets are not documents rows) ──

ALTER TABLE electronic_signatures ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE electronic_signatures ALTER COLUMN version_id  DROP NOT NULL;

-- ── 2. Governed typed target pointer ────────────────────────────────────────

ALTER TABLE electronic_signatures
  ADD COLUMN IF NOT EXISTS signed_target TEXT;

-- ── 3. Explicit binding basis for bound_payload_digest ──────────────────────

ALTER TABLE electronic_signatures
  ADD COLUMN IF NOT EXISTS binding_basis TEXT;

-- ── 4. Fail-closed anchor check ─────────────────────────────────────────────
-- Either a full document-version anchor or a governed target pointer. Never
-- neither. (Guarded: idempotent re-run safe.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'electronic_signatures_anchor_check'
       AND conrelid = 'electronic_signatures'::regclass
  ) THEN
    ALTER TABLE electronic_signatures
      ADD CONSTRAINT electronic_signatures_anchor_check
      CHECK (
        (document_id IS NOT NULL AND version_id IS NOT NULL)
        OR (signed_target IS NOT NULL AND signed_target <> '')
      );
  END IF;
END $$;

-- ── 5. Inspector / verification lookup ──────────────────────────────────────
-- "Show me every signature applied to this governed target in this org."

CREATE INDEX IF NOT EXISTS electronic_signatures_org_signed_target_idx
  ON electronic_signatures (organization_id, signed_target)
  WHERE signed_target IS NOT NULL;

COMMIT;
