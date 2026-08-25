-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — unified_tasks soft delete (record retention)
-- Compliance: 21 CFR Part 11 (record retention, auditability), ALCOA+
-- Purpose: Give the canonical task store a soft-delete lane. Until now the
--          ONLY removal path for a unified task was a hard DELETE, which
--          destroys the record a regulated audit needs (collaboration/tasking
--          assessment D24). Rows gain `deleted_at` / `deleted_by`; every
--          read-model filters `deleted_at IS NULL`; the archive endpoint
--          stamps rather than deletes, and writes the governed ledger.
--
-- Determinism Contract:
--   - Additive nullable columns only; nothing existing is rewritten and no
--     value is backfilled. Existing rows read as not-deleted (NULL).
--   - Idempotent: IF NOT EXISTS on both columns and the partial index.
--   - No FK on deleted_by: the deleting user may be deprovisioned later and
--     the tombstone must survive them (retention outlives accounts).
-- =============================================================================

ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS deleted_by INTEGER;

-- Partial index: the live-rows predicate every read now carries stays cheap,
-- and the tombstone scan (compliance review of what was archived) is indexed
-- without taxing the hot path.
CREATE INDEX IF NOT EXISTS unified_tasks_deleted_at_idx
  ON unified_tasks (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN unified_tasks.deleted_at IS
  'Soft-delete timestamp — NULL means live. Rows are never hard-deleted over HTTP (Part 11 retention).';
COMMENT ON COLUMN unified_tasks.deleted_by IS
  'User id that archived the task (no FK: the tombstone must outlive the account).';
