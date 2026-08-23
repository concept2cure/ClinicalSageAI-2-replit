-- 20260821_regulatory_twin_simulations.sql
--
-- Give public.regulatory_twin_simulations a creator on a durable apply path.
--
-- WHY. The table was created by runtime DDL at module load in
-- server/routes/regulatory-digital-twin.ts — `ensureSimulationsTable()`, a
-- CREATE TABLE IF NOT EXISTS inside a try/catch that logged a warning and
-- continued. So the table existed only on a database whose application process
-- had booted at least once, and never on one built by provisioning alone.
-- scripts/ci/check-tables-against-live-schema.mjs flags exactly that: a table
-- the server queries that a full install-fresh + deploy-migrate run does not
-- produce. Its remedy text is this file — "put the creating migration on a
-- durable apply path".
--
-- Runtime DDL is the failure mode this repo keeps paying for: it runs as the
-- application role (which under the app_service split has no CREATE right), it
-- runs after the routes are already mounted, and its failure is swallowed. The
-- route's own `/health` handler ends `catch { /* table may not exist yet */ }`,
-- which is the shape of code written around a table that sometimes is not there.
--
-- The DDL below is byte-for-byte the DDL that function issued, so this is a
-- no-op on any database where it already ran, and `ensureSimulationsTable()` is
-- deleted in the same change — one creator, not two.
--
-- ── KNOWN GAP, deliberately not closed here ──────────────────────────────────
-- This table has NO tenant column, and server/routes/regulatory-digital-twin.ts
-- lists from it with no tenant predicate:
--
--     SELECT … FROM regulatory_twin_simulations ORDER BY created_at DESC LIMIT 100
--
-- so one tenant's stored submission_profile (submission type, therapeutic area,
-- agencies) is visible to every tenant. That is a route-level exposure, not a
-- provisioning one, and closing it means adding organization_id AND threading
-- org scope through the route's writes and reads. Adding the column here alone
-- would be worse than leaving it: a tenant column no writer stamps is what the
-- RLS sweep then policies, and `NULL = <tenant>` matches nothing — the dead
-- surface documented in docs/DB_PROVISIONING_CONTRACT.md. So the column is left
-- off and the exposure is recorded for the route's owner rather than
-- half-fixed. The simulations are disclosed in-code as illustrative RNG output,
-- not predictions, which bounds but does not remove the concern.

CREATE TABLE IF NOT EXISTS regulatory_twin_simulations (
  id                 TEXT PRIMARY KEY,
  submission_type    TEXT NOT NULL,
  therapeutic_area   TEXT NOT NULL,
  agencies           TEXT[] DEFAULT ARRAY['FDA'],
  submission_profile JSONB,
  results            JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary            JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_twin_sim_created
  ON regulatory_twin_simulations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_twin_sim_type
  ON regulatory_twin_simulations (submission_type);
