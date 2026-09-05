-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Create manufacturing.responses, the table the manufacturing routes read and write, so the finding-response surface stops failing on a database whose application role cannot create tables.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.P.3 manufacture; the written response to an
--     inspection or audit finding, and the evidence cited to close it.
--   - Integrity Risk Addressed: a route that provisions its own store at
--     request time. The DDL ran as the request's role, which holds DML on the
--     manufacturing schema and nothing more, so the surface failed wherever the
--     non-superuser runtime role is used — and repeated on every request,
--     because the "ready" flag is only set after the DDL succeeds.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Shape and tenancy follow this schema, not the public one: every table in
--     `manufacturing` keys on `org_id UUID` and carries the uuid-matching
--     tenant_isolation_policy that 066 installed. Matching them is what makes
--     one predicate cover the schema.
--   - Idempotent: CREATE TABLE / INDEX IF NOT EXISTS; policy dropped and
--     recreated.
-- =============================================================================
--
-- ── What this closes ─────────────────────────────────────────────────────────
-- server/routes/manufacturing-routes.ts carried ensureResponsesTable(), a
-- CREATE TABLE IF NOT EXISTS executed on the first request, with a comment
-- naming the reason: "This covers the gap where migration-066 does not include
-- a responses table." Covering a provisioning gap from inside a request handler
-- only works while the application connects as a role that may create tables.
-- It does not in any deployment that uses the runtime role, so
-- GET /api/manufacturing/responses answered 500 MFG_RESPONSES_LIST_ERROR
-- (verified live against a provisioned database with RLS_ENFORCE=on).
--
-- The columns are exactly the ones the two handlers read and write:
--   SELECT * … WHERE org_id = $1 ORDER BY updated_at DESC
--   INSERT (finding_id, section, response_text, evidence_ids, org_id)
--   UPDATE … WHERE id = $5 AND org_id = $6
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS manufacturing;

CREATE TABLE IF NOT EXISTS manufacturing.responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id    TEXT NOT NULL,
  section       TEXT,
  response_text TEXT NOT NULL,
  evidence_ids  JSONB NOT NULL DEFAULT '[]',
  org_id        UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The listing filters on org_id and orders by updated_at; the finding view
-- gathers every response to one finding.
CREATE INDEX IF NOT EXISTS manufacturing_responses_org_updated_idx
  ON manufacturing.responses (org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS manufacturing_responses_finding_idx
  ON manufacturing.responses (org_id, finding_id);

-- The predicate 066 installed on every other table in this schema, verbatim:
-- uuid-shaped tenant, and a NULL org_id stays readable so rows written before a
-- tenant scope existed are not orphaned out of sight.
ALTER TABLE manufacturing.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturing.responses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON manufacturing.responses;
CREATE POLICY tenant_isolation_policy ON manufacturing.responses
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR org_id = (substring(current_setting('app.current_org_id', TRUE) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))::uuid
    OR org_id IS NULL
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR org_id = (substring(current_setting('app.current_org_id', TRUE) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))::uuid
    OR org_id IS NULL
  );
