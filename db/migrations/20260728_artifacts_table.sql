-- ─────────────────────────────────────────────────────────────────────────────
-- artifacts — chat-generated artifacts (outlines, validation reports, drafts)
--
-- WHY THIS EXISTS
-- Two shipped code paths address this table and NOTHING created it:
--
--   writer  server/routes/chat-actions.ts:152
--           INSERT INTO artifacts (...) ON CONFLICT (id) DO NOTHING
--           mounted at /api by server/bootstrap/register-advanced-platform-routes.ts:290
--   reader  server/routes/workspace-summary.ts:150
--           SELECT id, type, title, status, project_id, created_at
--           FROM artifacts WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5
--
-- The write is deliberately fire-and-forget — the call site ends in
-- `.catch(e => console.warn('[artifacts] persist failed:', e?.message))` — so
-- every insert has been failing with "relation \"artifacts\" does not exist",
-- getting swallowed into a warn, and the request has been returning
-- `{ ok: true }`. Every artifact a user generated through chat was discarded
-- while the response said it was saved, and the workspace's "Recent artifacts"
-- panel has had nothing to read.
--
-- This is the failure mode scripts/ci/check-unbacked-tables.mjs was written to
-- catch, described in its own header: "a write wrapped in try/catch degrades to
-- a silent no-op". Same shape as the Part 11 authoring audit trail that wrote to
-- a table that never existed and logged CRITICAL for the life of the feature.
--
-- COLUMN TYPES follow the call sites, not a guess:
--   id          TEXT    — writer passes `val-${Date.now()}` style keys, not UUIDs,
--                         and relies on ON CONFLICT (id), so it is the PK.
--   org_id      INTEGER — the app tenant model, and what 0021's policy casts to.
--   project_id  TEXT    — comes from a URL param; no FK is asserted because the
--                         writer does not guarantee the project exists.
--   created_at          — the reader ORDER BYs it and the writer never sets it,
--                         so it must default.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artifacts (
    id          TEXT PRIMARY KEY,
    org_id      INTEGER NOT NULL,
    project_id  TEXT,
    type        TEXT NOT NULL DEFAULT 'document',
    title       TEXT,
    status      TEXT NOT NULL DEFAULT 'generated',
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Serves the reader's exact access pattern: newest-first within one org.
CREATE INDEX IF NOT EXISTS artifacts_org_created_idx
    ON artifacts (org_id, created_at DESC);

-- ── Tenant isolation ─────────────────────────────────────────────────────────
-- migrations/0021_enable_rls_everywhere.sql policies every table carrying an
-- org_id/tenant_id, but it is a DYNAMIC migration that has already run on every
-- provisioned database and never revisits tables added later. A new tenant table
-- with no policy of its own is fully readable across tenants once RLS_ENFORCE=on
-- — so the policy ships WITH the table, in the same file, rather than depending
-- on a migration that will not run again.
--
-- Shape copied verbatim from 0021 so the two converge: shadow-mode bypass when
-- app.rls_enforce is not 'on', tenant match against either session variable, and
-- the super-admin escape hatch.
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON artifacts;
CREATE POLICY tenant_isolation_policy ON artifacts
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR org_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR org_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );
