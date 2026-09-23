-- Migration: Project Charter, Timeline Phases & Commitments
-- Date: 2026-03-27
-- Description: Regulatory project charter system with submission-specific templates,
--              phase-based timeline, and commitment tracking with 21 CFR Part 11 signing.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECT CHARTERS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_charters (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,

  -- Submission classification
  submission_type TEXT NOT NULL,      -- IND, NDA, BLA, 510K, PMA, MAA, DE_NOVO, EUA, IVDR
  regulatory_region TEXT NOT NULL,    -- FDA, EMA, PMDA, MHRA, HealthCanada, TGA, NMPA
  product_name TEXT NOT NULL,
  product_type TEXT,                  -- drug, biologic, device, combination, ivd
  indication TEXT,
  target_population TEXT,

  -- Device-specific
  predicate_devices JSONB,
  device_class TEXT,
  product_code TEXT,

  -- Strategy
  regulatory_strategy TEXT,
  critical_success_factors JSONB,
  risk_mitigation_plan TEXT,
  communication_plan TEXT,
  quality_targets JSONB,

  -- Dates
  target_submission_date TIMESTAMP,
  target_approval_date TIMESTAMP,

  -- Custom instructions
  custom_instructions TEXT,

  -- Approval workflow
  approval_status TEXT DEFAULT 'draft',
  approved_by INTEGER,
  approved_at TIMESTAMP,

  -- Audit
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS proj_charter_org_idx ON project_charters(organization_id);
CREATE INDEX IF NOT EXISTS proj_charter_project_idx ON project_charters(project_id);
CREATE INDEX IF NOT EXISTS proj_charter_type_idx ON project_charters(submission_type);
CREATE INDEX IF NOT EXISTS proj_charter_status_idx ON project_charters(approval_status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHARTER SECTIONS, TIMELINE PHASES, PROJECT COMMITMENTS — REMOVED 2026-09-10
-- ═══════════════════════════════════════════════════════════════════════════════
-- WO-1 (ADR-0006). This file used to create those three tables here, with nine
-- indexes. It no longer does, and nothing is lost, because on the one applier
-- that runs this file the tables were created and then destroyed before
-- anything could use them.
--
-- THE CHAIN, by install-fresh overlay sort position:
--   #18   this file                                    CREATE the three
--   #93   migrations/20260611_drop_charter_staging_tables.sql   DROP the three
--   #118  migrations/20260629_charter_tables_rebuild.sql        CREATE them again,
--         with a larger shape (22 / 26 / 45 columns against 11 / 19 / 27) plus
--         charter_audit_events
--
-- 20260611 dropped them deliberately — decision register #727 item 10, recorded
-- in its header as "nowhere in the build backlog (#619); owner approved
-- resolution as a formal drop" — and deliberately without CASCADE: "if a drop
-- fails on a dependency, that dependency is evidence the table is not dead;
-- investigate rather than cascade."
--
-- NOTHING IN BETWEEN DEPENDED ON THEM. 99 overlay files sort between #18 and
-- #118; a grep of the whole migrations/ and db/migrations/ trees for a
-- REFERENCES, INSERT, ALTER, view, trigger or function touching
-- charter_sections, timeline_phases or project_commitments returns hits only
-- inside the three files above. The one FK — project_commitments.phase_id ->
-- timeline_phases(id) — is self-contained within whichever file declares it.
--
-- NOTHING IS LOST IN SHAPE OR INDEXES EITHER. 20260629 declares every column
-- this file declared and 18 more, and its index set is a strict SUPERSET of the
-- nine removed here (it adds charter_sections_status_idx,
-- proj_commitments_category_idx, proj_commitments_critical_idx,
-- timeline_phases_team_idx). A database built from empty by
-- scripts/db/provision-test-db.sh matches 20260629 exactly for all three tables
-- — zero columns declared-but-absent, zero live-but-undeclared — and carries
-- 20260629's timestamptz/json types rather than this file's timestamp/jsonb.
--
-- CLAUDE.md RULE 1 is satisfied by amending in place rather than appending a
-- DROP: this file is not in C2C_MIGRATION_FILES, so it never replays against a
-- populated database, and the removal simply stops a create-then-drop cycle
-- that produced nothing on a fresh one.
--
-- `project_charters` above STAYS. This file is its only creator anywhere in the
-- repository, 20260611 kept it on purpose, and 20260629 declares foreign keys
-- into it. See WO-15: it is frozen at 27 columns while
-- shared/schema/project-charter.ts declares 48, and
-- server/routes/charters.ts:401 selects all of them.
-- ═══════════════════════════════════════════════════════════════════════════════
