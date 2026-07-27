-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — MDx task metadata (lifecycle phase + filing scope)
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give the canonical `unified_tasks` store the MDx/regulatory task
--          metadata the board read-model needs — lifecycle phase, target
--          market, filing type, study/deliverable linkage, and client
--          visibility — so the Task Board stops returning `phase: null` as a
--          documented GAP and renders governed, real values instead.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (task governance across Protocol Design, CMC,
--     Medical Device, IND Wizard, eCTD Co-Author, and Vault workstreams).
--   - Integrity Risk Addressed: today no lifecycle phase exists on tasks, so
--     the board read-model (server/routes/taskBoard.routes.ts) hardcodes
--     phase: null and no MDx filing context (market / filing type / study /
--     deliverable / client visibility) can be recorded or audited per task.
--
-- Determinism Contract:
--   - Additive nullable columns only; nothing existing is rewritten and no
--     defaults are backfilled. No spec version bump.
--
-- Notes:
--   - lifecycle_phase domain (enforced in app code, not a DB enum, to stay
--     additive): strategy | design | verification | clinical_performance |
--     submission_prep | authority_review | market_authorization | postmarket.
--   - client_visibility: internal | client_visible (app-enforced domain).
--   - study_id / deliverable_id are plain integers (no FK) — the referenced
--     stores are tenant-provisioned and may be absent; app code resolves them.
--   - Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only.
--
-- Rollback:
--   DROP INDEX IF EXISTS unified_lifecycle_phase_idx;
--   ALTER TABLE unified_tasks DROP COLUMN IF EXISTS lifecycle_phase;
--   ALTER TABLE unified_tasks DROP COLUMN IF EXISTS market;
--   ALTER TABLE unified_tasks DROP COLUMN IF EXISTS filing_type;
--   ALTER TABLE unified_tasks DROP COLUMN IF EXISTS study_id;
--   ALTER TABLE unified_tasks DROP COLUMN IF EXISTS deliverable_id;
--   ALTER TABLE unified_tasks DROP COLUMN IF EXISTS client_visibility;
-- =============================================================================

ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS lifecycle_phase text;
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS market text;
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS filing_type text;
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS study_id integer;
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS deliverable_id integer;
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS client_visibility text;

CREATE INDEX IF NOT EXISTS unified_lifecycle_phase_idx
  ON unified_tasks (lifecycle_phase);
