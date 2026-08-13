-- Tenant export receipts — the record that makes the purge precondition checkable.
--
-- WHY. `purgeTenant` (services/tenant/tenant-offboarding.ts) refuses to destroy a
-- tenant without a `finalExportDigest`, on the grounds that the data-return
-- obligation must be discharged first. As first written it accepted any non-empty
-- string, which made the gate theatre: it reads as evidence in review and proves
-- nothing at the moment it matters.
--
-- This table is what turns the claim into a fact. Every full tenant export writes
-- a row; the purge looks the supplied digest up against it, scoped to the same
-- organization. A digest that was never produced — or was produced for a
-- DIFFERENT tenant — no longer opens the gate.
--
-- The row deliberately OUTLIVES the tenant. It is evidence that the data return
-- happened, and 21 CFR Part 11 §11.10(e) wants that evidence to survive the
-- record it describes. `organization_id` therefore carries no ON DELETE CASCADE
-- and no foreign key: the organizations row is retained in status 'purged' rather
-- than deleted, but the receipt must not become undeletable-by-accident either.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS tenant_export_receipts (
  id             BIGSERIAL PRIMARY KEY,
  organization_id INTEGER     NOT NULL,
  -- 'sha256:<64 hex>' over the canonical JSON of the export payload.
  digest         TEXT        NOT NULL,
  table_count    INTEGER     NOT NULL DEFAULT 0,
  row_count      BIGINT      NOT NULL DEFAULT 0,
  created_by     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The lookup the purge performs, and the idempotency key for re-exports that
-- produce identical content.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_export_receipts_org_digest
  ON tenant_export_receipts (organization_id, digest);

-- "Show me this tenant's exports, newest first" — the offboarding runbook view.
CREATE INDEX IF NOT EXISTS idx_tenant_export_receipts_org_created
  ON tenant_export_receipts (organization_id, created_at DESC);

COMMENT ON TABLE tenant_export_receipts IS
  'One row per full tenant export. Verified by purgeTenant before destruction; outlives the tenant as evidence the data-return obligation was met.';
