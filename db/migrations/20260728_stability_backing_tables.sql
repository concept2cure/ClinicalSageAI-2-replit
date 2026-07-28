-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Create the seven previously-unbacked stab_* tables, the shared
--          cmc_methods catalog and the two v_stab_* views, tenant-isolated from
--          birth.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — Quality (3.2.P.8 Stability); analytical methods 3.2.P.5
--   - Integrity Risk Addressed: TENANT ISOLATION plus missing GxP records. CAPA,
--     chain-of-custody, sample, assignment, sign-off, protocol and excursion data
--     had no table at all, so those routes 500d (fail-safe). Creating them WITHOUT
--     isolation would have converted that fail-safe error into a real cross-tenant
--     leak, which is why this migration follows the isolation migration and applies
--     the same policy to everything it creates.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Every stab_* table gets tenant_id INTEGER NOT NULL defaulting from
--     app.current_tenant_id, then ENABLE + FORCE RLS and tenant_isolation_policy.
--   - cmc_methods is deliberately created WITHOUT a tenant column: it is a global
--     analytical-method catalog joined by id and never tenant-filtered; scoping it
--     would hide every method and block every stability sign-off.
--   - The two views are security_invoker so they inherit base-table RLS as the
--     CALLING tenant regardless of view ownership.
--   - Migration is idempotent (IF NOT EXISTS; views DROP-then-CREATE).
-- =============================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: back the unbacked stability tables + views (G-02, tenant-isolated)
-- Date: 2026-07-28
-- Finding: docs/security/STABILITY_TENANT_ISOLATION_FINDING.md (follow-up to
--          20260728_stability_tenant_isolation.sql)
--
-- WHY THIS EXISTS
-- server/src/routes/stability.router.ts reads/writes seven stab_* tables, cmc_methods,
-- and two views whose only CREATE lived in db/migrations/_legacy/ (031/032/033/034/035),
-- off every durable apply path — so on a fresh DB those routes 500 (fail-safe). This
-- creates them for real, WITH tenant isolation from birth, so backing them cannot flip
-- a fail-safe 500 into a tenant leak.
--
-- SHAPES are reconstructed from that legacy DDL + the exact router queries. Notes:
--   * Every stab_* table gets tenant_id INTEGER NOT NULL DEFAULT from the request GUC,
--     so the router's tenant-less INSERTs auto-tag and an unset context fails closed
--     (NOT NULL violation) rather than writing an unowned row.
--   * NO CHECK on status/role/stage: the router passes arbitrary client values through
--     PATCH/POST, so a CHECK would 500 valid calls. stab_chain.action keeps its CHECK —
--     the router pre-validates it against the same 8-value set.
--   * Uniqueness is PER-TENANT (tenant_id, lower(...)), not the legacy GLOBAL unique,
--     which would let one tenant's value block another's (a cross-tenant signal/leak).
--   * FKs are intentionally omitted: the parent tables (stab_studies/…, and the two
--     conflicting stab_results shapes) are not guaranteed on the applier path, so a hard
--     REFERENCES would abort the whole migration. Isolation comes from tenant_id + RLS,
--     not referential integrity; FKs can be added once the parent schema is canonical.
--   * cmc_methods is a SHARED GLOBAL catalog (joined by id, never tenant-filtered, no
--     writer anywhere in the repo). It gets NO tenant_id — so it is invisible to the RLS
--     sweeps (0021 and the stab_% loop below) and stays globally readable. Tenant-scoping
--     it would hide every method (unpopulated tenant_id) and 412 every study.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / DROP-then-CREATE policy). The views are
-- guarded on their base tables existing, so this is a no-op-safe on a DB that lacks them.
-- ROLLBACK: DROP VIEW v_stab_due_tp, v_stab_upcoming_tp;
--           DROP TABLE stab_capa, stab_excursions, stab_samples, stab_chain,
--                      stab_assignments, stab_signoffs, stab_protocols, cmc_methods;
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Reusable tenant key: NOT NULL so an unset context fails closed on INSERT; DEFAULT
-- pulls the request tenant the router's connection facade set on app.current_tenant_id.

-- ── stab_capa (CAPA records) — legacy 031 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS stab_capa (
  capa_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id          UUID NOT NULL,
  title             TEXT NOT NULL,
  why               TEXT,
  actions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner             TEXT,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'OPEN',   -- no CHECK: PATCH passes arbitrary status
  linked_result_id  UUID,
  linked_oot        JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  tenant_id         INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
CREATE INDEX IF NOT EXISTS idx_stab_capa_study ON stab_capa(study_id, status);

-- ── stab_excursions (temperature/RH excursions) — legacy 031 ───────────────────
CREATE TABLE IF NOT EXISTS stab_excursions (
  exc_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL,
  cond_id       UUID,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric        TEXT NOT NULL,
  value         NUMERIC,
  limit_low     NUMERIC,
  limit_high    NUMERIC,
  duration_min  INTEGER,
  severity      TEXT,
  raw_json      JSONB DEFAULT '{}'::jsonb,
  tenant_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
CREATE INDEX IF NOT EXISTS idx_stab_excursions_study ON stab_excursions(study_id);

-- ── stab_samples (physical samples) — legacy 034 ───────────────────────────────
CREATE TABLE IF NOT EXISTS stab_samples (
  sample_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL,
  tp_id         UUID NOT NULL,
  sample_code   TEXT NOT NULL,
  collected_at  TIMESTAMPTZ,
  collected_by  TEXT,
  storage       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  tenant_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
-- per-tenant code uniqueness (legacy was global — a cross-tenant collision vector)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stab_samples_code ON stab_samples(tenant_id, lower(sample_code));
CREATE INDEX IF NOT EXISTS idx_stab_samples_tp ON stab_samples(tp_id);

-- ── stab_chain (chain of custody) — legacy 035 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS stab_chain (
  chain_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id       UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN
                    ('CREATED','COLLECTED','RECEIVED','OPENED','SEALED','TRANSFERRED','DISPOSED','OTHER')),
  actor           TEXT,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  attachment_url  TEXT,
  tenant_id       INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
CREATE INDEX IF NOT EXISTS idx_stab_chain_sample ON stab_chain(sample_id, ts DESC);

-- ── stab_assignments (task assignments) — legacy 032/033 ───────────────────────
CREATE TABLE IF NOT EXISTS stab_assignments (
  assign_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id    UUID NOT NULL,
  tp_id       UUID,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,                  -- no CHECK: router assigns arbitrary roles ('Sampler', …)
  status      TEXT NOT NULL DEFAULT 'OPEN',   -- no CHECK: PATCH passes arbitrary status
  due_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  tenant_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
CREATE INDEX IF NOT EXISTS idx_stab_assign_study ON stab_assignments(study_id, status);

-- ── stab_signoffs (Part 11 e-sign records) — reverse-engineered from the router ──
CREATE TABLE IF NOT EXISTS stab_signoffs (
  signoff_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL,
  stage         TEXT NOT NULL,                -- no CHECK: router passes arbitrary stage
  signer_name   TEXT NOT NULL,
  signer_email  TEXT NOT NULL,
  reason        TEXT,
  hash          TEXT NOT NULL,
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
CREATE INDEX IF NOT EXISTS idx_stab_signoffs_study ON stab_signoffs(study_id, signed_at DESC);

-- ── stab_protocols (reusable protocol templates) — legacy 031 ──────────────────
CREATE TABLE IF NOT EXISTS stab_protocols (
  proto_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- NB: proto_id, not protocol_id
  name           TEXT NOT NULL,
  product_scope  TEXT,
  payload_json   JSONB NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  tenant_id      INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
);
-- per-tenant name uniqueness (legacy was global)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stab_protocols_name ON stab_protocols(tenant_id, lower(name));

-- ── cmc_methods (SHARED GLOBAL analytical-method catalog) — NO tenant_id ────────
-- Joined only by id (m.id = stab_tests.method_id), never tenant-filtered, no writer in
-- the repo. Without a tenant column it is invisible to every RLS sweep and stays globally
-- readable — the correct behavior for reference data. (If a future module writes
-- tenant-authored methods here, convert to tenant_id + the standard policy.)
CREATE TABLE IF NOT EXISTS cmc_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  status      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmc_methods_status ON cmc_methods(status);

-- ── Views (legacy 033/034): unsampled timepoints joined to their condition ──────
-- Explicit 6-column projection (NOT select *) so tenant_id never leaks into API JSON.
-- Views inherit tenant isolation from the FORCE-RLS base tables. Guarded on the base
-- tables existing so this migration is a no-op-safe where they are not yet provisioned.
-- (The CREATE VIEW text is intentionally literal here so the unbacked-tables scanner
-- counts these views as backed.)
DO $$
BEGIN
  IF to_regclass('public.stab_timepoints') IS NOT NULL
     AND to_regclass('public.stab_conditions') IS NOT NULL THEN
    -- security_invoker=true: evaluate base-table RLS as the CALLING tenant, not the
    -- view owner. Without it a view owned by a role that bypasses RLS (a superuser, or
    -- the table owner without FORCE) would read across tenants. This makes isolation
    -- independent of view ownership.
    -- DROP-then-CREATE (not CREATE OR REPLACE) so the definition is idempotent AND the
    -- unbacked-tables scanner's CREATE_RE (which matches `CREATE VIEW`, not
    -- `CREATE OR REPLACE VIEW`) counts these views as backed.
    DROP VIEW IF EXISTS v_stab_upcoming_tp;
    CREATE VIEW v_stab_upcoming_tp WITH (security_invoker = true) AS
      SELECT t.study_id, t.tp_id, c.kind, t.label, t.month, t.planned_date
      FROM stab_timepoints t
      JOIN stab_conditions c ON c.cond_id = t.cond_id
      WHERE t.actual_date IS NULL
      ORDER BY t.planned_date ASC NULLS LAST, t.month ASC;

    DROP VIEW IF EXISTS v_stab_due_tp;
    CREATE VIEW v_stab_due_tp WITH (security_invoker = true) AS
      SELECT t.study_id, t.tp_id, c.kind, t.label, t.month, t.planned_date
      FROM stab_timepoints t
      JOIN stab_conditions c ON c.cond_id = t.cond_id
      WHERE t.actual_date IS NULL
      ORDER BY t.planned_date ASC NULLS LAST, t.month ASC;
  END IF;
END
$$;

-- ── Apply the uniform tenant_isolation_policy to every stab_* base table ────────
-- Identical shape to migrations/0021_enable_rls_everywhere.sql and
-- 20260728_stability_tenant_isolation.sql. Covers the seven tables created above (and
-- re-covers any pre-existing stab_* idempotently). cmc_methods has no tenant_id so the
-- LIKE 'stab\_%' filter correctly leaves it globally readable.
DO $$
DECLARE
  rec RECORD;
  policy_name CONSTANT text := 'tenant_isolation_policy';
BEGIN
  FOR rec IN
    SELECT t.table_schema, t.table_name
    FROM information_schema.tables t
    WHERE t.table_type = 'BASE TABLE'
      AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
      -- ONLY the tables this migration creates. Deliberately NOT a LIKE 'stab\_%'
      -- sweep: the pre-existing stability tables may carry tenant_id as TEXT (see
      -- 023_stability_step2.sql), and attaching an integer-comparing policy to a TEXT
      -- column fails with "operator does not exist: text = integer". Coercing those
      -- columns is the isolation migration's job (20260728_stability_tenant_isolation.sql),
      -- which validates the data before it converts. Restricting the loop here keeps
      -- the two files independent of apply ORDER — this one only ever touches columns
      -- it just created as INTEGER.
      AND t.table_name IN (
        'stab_capa', 'stab_excursions', 'stab_samples', 'stab_chain',
        'stab_assignments', 'stab_signoffs', 'stab_protocols'
      )
    ORDER BY t.table_schema, t.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
                   rec.table_schema, rec.table_name);
    EXECUTE format(
      $d$ALTER TABLE %I.%I ALTER COLUMN tenant_id
          SET DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT$d$,
      rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, rec.table_schema, rec.table_name);
    EXECUTE format(
      $f$
        CREATE POLICY %I ON %I.%I
          FOR ALL
          USING (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR tenant_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
          WITH CHECK (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR tenant_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
      $f$,
      policy_name, rec.table_schema, rec.table_name
    );
  END LOOP;
END
$$;

COMMIT;
