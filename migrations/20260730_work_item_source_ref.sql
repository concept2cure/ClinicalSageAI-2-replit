-- Work items: add source_ref for string/UUID-keyed sources.
--
-- c2c_project_work_items identifies its origin by (source_type, source_id,
-- org_id) — an INTEGER source_id, which fits review threads/tasks but not
-- sources keyed by a UUID. Regulatory correspondence therefore inserted its
-- work items with source_type 'review_task' and source_id 0, which:
--   1. collided with real review tasks in the upsert/dedup lookup, and
--   2. collapsed every correspondence work item in an org onto the SAME key,
--      so none could be traced back to the issue that created it.
--
-- source_ref carries the originating string id (e.g. a correspondence issue
-- UUID) so those rows stay individually traceable; it is NULL for the existing
-- integer-keyed sources, which are unchanged.
--
-- Additive + idempotent: safe to re-run and safe against a populated table.

ALTER TABLE c2c_project_work_items
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE INDEX IF NOT EXISTS c2c_pwi_source_ref_idx
  ON c2c_project_work_items (source_ref);
