-- One mapping per (artifact, section) in c2c_artifact_section_map.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- The table had plain indexes only, the create route performed no existence
-- check, and no route could delete a mapping. A second row for the same
-- artifact in the same section therefore shipped the same document TWICE into
-- an agency-bound eCTD package (two leaves, two files, two checksum lines)
-- with no finding, and could not be removed once created. The assemble route
-- now skips such a row with LEAF-DUPLICATE-MAPPING; this makes the row
-- impossible in the first place.
--
-- ── What this does ──────────────────────────────────────────────────────────
-- 1. Removes existing duplicates, keeping the EARLIEST row for each
--    (artifact_id, section_db_id) — the one every reader saw first.
-- 2. Adds the unique index the schema now declares
--    (shared/schema.ts: c2c_artsec_artifact_section_uq).
--
-- Idempotent: safe to re-run.

DELETE FROM c2c_artifact_section_map dup
USING c2c_artifact_section_map keep
WHERE dup.artifact_id = keep.artifact_id
  AND dup.section_db_id = keep.section_db_id
  AND dup.id > keep.id;

CREATE UNIQUE INDEX IF NOT EXISTS c2c_artsec_artifact_section_uq
  ON c2c_artifact_section_map (artifact_id, section_db_id);
