-- =============================================================================
-- contradiction_links — port onto a durable applier
-- =============================================================================
-- Compliance: 21 CFR Part 11 (traceability of governed reasoning), ALCOA+
-- Purpose: create the table `server/services/assumption-registry-service.ts`
--          writes and reads, which no file in this repository creates.
--
-- ── WHY THIS EXISTS, AND WHO BROKE IT ────────────────────────────────────────
-- ADR-0007 point 6 recorded a residual: `contradiction_links` "has DDL only in
-- dead `migrations/0010`", so the assumption↔object contradiction-linking
-- sub-feature was expected to fail, and porting-or-retiring was left as a
-- scoped follow-up.
--
-- That description had one word wrong, and the word mattered. 0010 was dead on
-- deploy-migrate, which applies only C2C_MIGRATION_FILES. It was NOT dead on
-- install-fresh, whose root-tree overlay reads every `migrations/*.sql`. So
-- until 2026-09-10 every from-scratch database DID have this table, and the
-- sub-feature's failure was confined to environments carried forward by
-- deploy-migrate alone.
--
-- Then commit 9a47438b6 (WO-1) retired migrations/0010 to
-- tests/schema-contract/fixtures/, on the strength of the ADR's "dead" — and
-- removed the only creator from the only applier that still ran it. Nothing in
-- the repository reported that: `ci:duplicate-table-ddl` went from 51 to 47,
-- `ci:unbacked-tables` stayed green, and every schema-contract test passed. It
-- surfaced only when `ci:tables-live-schema` ran against a real PostgreSQL 16
-- built by install-fresh + deploy-migrate and reported one table absent that
-- was not in its baseline.
--
-- That is the WO-1/WO-2 thesis demonstrated on its author: a repository-only
-- check cannot see which tables a provisioning run actually produces, and the
-- gate that can is the one that caught it.
--
-- ── WHY IT IS HERE RATHER THAN BACK IN THE ROOT TREE ─────────────────────────
-- Restoring 0010 would restore the duplicate CREATE TABLE definitions WO-1
-- retired it to resolve, and would put the table back on install-fresh ONLY —
-- so a database provisioned before this date, carried forward by
-- deploy-migrate, would still never get it. This file is listed in
-- C2C_MIGRATION_FILES instead, which per CLAUDE.md RULE 1 re-executes on every
-- deploy, so it reaches existing databases as well as new ones. That is WO-1's
-- exit criterion B: convergence needs a replaying applier, not an amended
-- creator.
--
-- The shape is taken verbatim from the retired file
-- (tests/schema-contract/fixtures/drizzle-shaped-operating-system.sql:376),
-- minus its `domain_track` enum column: that type is declared in the same
-- retired file and nothing else creates it, and the service neither writes nor
-- reads that column. Adding a column no code touches, backed by a type no
-- applier creates, is how the original defect started.
--
-- Idempotent: CREATE TABLE / CREATE INDEX IF NOT EXISTS throughout. Additive
-- only — no DROP, per RULE 1.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contradiction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- public schema + organization_id INTEGER NOT NULL, so the canonical tenant
  -- sweep (db/migrations/20260801_tenant_isolation_sweep.sql, which
  -- ci:migration-set-order pins to the END of C2C_MIGRATION_FILES) picks this
  -- table up and attaches tenant_isolation_policy. A uuid org key or a
  -- non-public schema would ship with no policy — RULE 1's second corollary.
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  source_type  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  source_label TEXT,

  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  target_label TEXT,

  comparison_type TEXT NOT NULL,
  field_path      TEXT,

  regulator_body TEXT,
  section_codes  JSONB DEFAULT '[]'::jsonb,

  -- Link state is is_active + inconsistency_detected, not a status string. The
  -- service learned this the hard way: an earlier INSERT wrote a literal 'open'
  -- into a `status` column that does not exist here, and 42703'd at plan time.
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at        TIMESTAMP,
  inconsistency_detected BOOLEAN DEFAULT FALSE,
  inconsistency_detail   TEXT,

  -- INTEGER REFERENCES users(id), not a label. An unattributable link records
  -- NULL rather than inventing an actor.
  created_by_id INTEGER REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- getContradictionLinks() filters project_id + organization_id and orders by
-- created_at DESC; this index serves that read exactly.
CREATE INDEX IF NOT EXISTS idx_contradiction_links_project_org
  ON contradiction_links (project_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contradiction_links_org
  ON contradiction_links (organization_id);

CREATE INDEX IF NOT EXISTS idx_contradiction_links_active
  ON contradiction_links (organization_id, is_active)
  WHERE is_active;

COMMENT ON TABLE contradiction_links IS
  'Links an assumption to an object whose value may contradict it. Ported onto '
  'C2C_MIGRATION_FILES on 2026-09-10 (WO-2) after commit 9a47438b6 removed its '
  'only creator from install-fresh. See ADR-0007 point 6.';

COMMIT;
