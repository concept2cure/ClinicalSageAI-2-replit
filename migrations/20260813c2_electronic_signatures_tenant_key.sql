-- ═══════════════════════════════════════════════════════════════════════════
-- electronic_signatures.organization_id — the tenant key nothing ever created
--
-- THE DEFECT
-- `shared/schema.ts` declares `organizationId: integer('organization_id')` on
-- electronic_signatures and builds two indexes over it. `server/services/part11/
-- signature-persistence.ts` REQUIRES it — it throws
-- "electronic_signatures: organizationId is required (tenant scope)" when the
-- value is missing — and writes it on every insert.
--
-- No migration has ever created the column. The base journal's CREATE TABLE
-- does not have it, and no ALTER anywhere adds it. The schema exists in two
-- substrates (a drizzle-push model and this SQL lineage) and they diverged: the
-- model has the column, the lineage does not.
--
-- Two consequences, both live before this file:
--
--   1. DEPLOY BREAKS. `20260813d_esignature_governed_unification.sql` builds
--      `electronic_signatures (organization_id, signed_target)` and fails with
--      42703 `column "organization_id" does not exist`. Everything ordered after
--      it in C2C_MIGRATION_FILES — INCLUDING the tenant isolation sweep — never
--      runs. One missing column silently disables the isolation pass for the
--      whole tail of the set.
--
--   2. PART 11 SIGNATURES HAVE NO TENANT BOUNDARY. The isolation sweep policies
--      tables that carry a tenant column and SKIPS those that do not — silently,
--      by design, because a table with no tenant key has no predicate to write.
--      So electronic_signatures, the 21 CFR Part 11 §11.50/§11.70 signature
--      record, sat unpoliced. Not mis-policied — invisible to the control.
--
-- WHY NULLABLE
-- Deliberately matches the drizzle model (`integer('organization_id')`, no
-- `.notNull()`), because the point of this file is to make the two substrates
-- AGREE. A NOT NULL here would re-introduce the divergence pointing the other
-- way and would fail on any row the backfill below cannot attribute.
--
-- WHAT A NULL MEANS AFTER THE SWEEP
-- The sweep's predicate is `organization_id = current_tenant_id`, so a NULL row
-- matches no tenant and is invisible to all of them. That is fail-closed and
-- therefore the safe direction, but for a Part 11 record "invisible" is not
-- nothing: the row is retained and reachable by direct DBA query, but no
-- application path will return it. The backfill below is what keeps that set
-- empty in practice — every historical signature is document-anchored, and
-- documents.organization_id is NOT NULL, so every existing row is attributable.
-- Rows born after this lands always carry the column (the write path throws
-- without it).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, a backfill guarded on IS NULL, and
-- CREATE INDEX IF NOT EXISTS. A deploy re-runs the whole set every time.
--
-- @compliance 21 CFR Part 11 §11.50 (signature manifestations), §11.70
--             (signature/record linking), §11.10(d) (limiting system access to
--             authorized individuals — which is what the RLS policy this
--             unblocks actually enforces).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. The column ───────────────────────────────────────────────────────────

ALTER TABLE electronic_signatures
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);

-- ── 2. Backfill from the document each signature anchors to ─────────────────
-- documents.organization_id is NOT NULL, so any signature carrying a
-- document_id is attributable. Guarded on IS NULL so a re-run is a no-op and so
-- an already-correct row is never rewritten.

UPDATE electronic_signatures es
   SET organization_id = d.organization_id
  FROM documents d
 WHERE es.document_id = d.id
   AND es.organization_id IS NULL;

-- ── 3. Tenant lookup index ──────────────────────────────────────────────────
-- The RLS predicate the sweep installs filters on this column on EVERY read of
-- the table, so it needs an index of its own — the two composite indexes in
-- 20260813d lead with organization_id but are partial (signed_target IS NOT
-- NULL) or keyed on bound_payload_digest, so neither serves a bare tenant scan.

CREATE INDEX IF NOT EXISTS electronic_signatures_organization_id_idx
  ON electronic_signatures (organization_id);

COMMIT;
