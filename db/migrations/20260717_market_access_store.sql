-- DEPRECATED (2026-08): superseded by the REAL market_access_positions store
-- (20260801_market_access_store.sql), which has a live write path
-- (market-access-service.ts via POST /api/market-access). GET /api/market-access now
-- reads that real, org-scoped store — see docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This blob is retained (non-destructive) but is
-- no longer written by the demo seed nor read by any route. A later migration may DROP it
-- once no environment references it.
--
-- Market-access & reimbursement store — the payer-coverage / value-dossier /
-- coding-strategy record backing the v2 MarketAccess surface's GET read. One row
-- per market-access program per org (the org's CGM program, BX-204), holding the
-- three rendered lists as JSONB nested arrays so the row rehydrates straight into
-- the surface's shapes: coverage[] (CoverageRow), dossier[] (DossierSection),
-- coding[] (CodingRow). These are per-org instance rows — the payer/coverage
-- status, dossier section progress and coding decisions the org is actually
-- working — not a static code catalog. Org-scoped, FK-free, schema-only,
-- idempotent. `program` is the natural per-org key; the access-strategy tab is
-- static prose, not instance data, so it is not stored here.

CREATE TABLE IF NOT EXISTS c2c_market_access (
  organization_id   INTEGER NOT NULL,
  program           TEXT    NOT NULL,
  coverage          JSONB NOT NULL DEFAULT '[]'::jsonb,
  dossier           JSONB NOT NULL DEFAULT '[]'::jsonb,
  coding            JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, program)
);
