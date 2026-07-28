-- ─────────────────────────────────────────────────────────────────────────────
-- eCTD REGULATORY AUDIT CONTEXT
--
-- Change:      Make the CMC Module 3 uniqueness constraints tenant-scoped.
-- Regulation:  21 CFR Part 11 §11.10(a) — record accuracy and integrity;
--              §11.10(c) — protection of records throughout the retention period.
-- Records:     cmc_module3_sections (eCTD Module 3 section bodies, carrying
--              approval_state), cmc_source_objects (canonical CMC source data).
-- Reversible:  Yes — the prior indexes can be recreated, though doing so
--              reinstates the defect below.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Both tables were unique on a key that OMITS organization_id:
--
--   migrations/0016_module3_workflow_convergence.sql:22
--     ADD CONSTRAINT cmc_module3_sections_project_section UNIQUE (project_id, section_key)
--   migrations/0017_module3_project_id_fix.sql:102,107
--     CREATE UNIQUE INDEX cmc_source_objects_project_key_idx
--       ON cmc_source_objects(project_id, source_type, source_key, version);
--     CREATE UNIQUE INDEX cmc_module3_sections_project_key_idx
--       ON cmc_module3_sections(project_id, section_key);
--
-- Uniqueness that ignores the tenant column is not a constraint bug in the
-- abstract — it is the arbiter that ON CONFLICT resolves against, so it decides
-- WHOSE ROW an upsert lands on. server/api/cmc/module3OperatingSystemRoutes.ts
-- upserted with `ON CONFLICT (project_id, section_key)`, which matches any
-- tenant's row for that project id. Because the DO UPDATE SET list does not
-- touch organization_id, the overwritten row KEPT the victim's tenant id and
-- stayed invisible to the caller.
--
-- 0017 also converted project_id to TEXT and dropped its FK to cmc_projects,
-- noting that "the application layer handles project scoping". It did not: the
-- handler took :projectId straight from the URL with no ownership check, and
-- `projects.id` is a global serial, so victim ids are enumerable (1, 2, 3, …).
--
-- The compile path made it destructive rather than merely wrong. The composer
-- emits all 17 sections regardless of input, so a caller with no source objects
-- for that project still produced 17 placeholder bodies ("has no source data
-- available") — and the upsert wrote `stale = false, stale_reason = NULL` while
-- leaving `approval_state` untouched. The victim's sections were therefore
-- emptied AND left marked approved and not-stale, which is exactly what
-- canFinalizeExport reads. A blind cross-tenant write that a downstream export
-- guard then waves through.
--
-- ── WHY BOTH OLD OBJECTS MUST GO ─────────────────────────────────────────────
-- Dropping them is not cleanup, it is the fix. Leaving either in place while
-- the code arbitrates on the new key converts the silent clobber into a unique
-- violation on legitimate use: two tenants compiling the same project id would
-- collide on the old narrower key. The new key is strictly wider, so no dedupe
-- pass is needed — every row that satisfied the old constraint satisfies this
-- one.
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── cmc_module3_sections ─────────────────────────────────────────────────────
-- 0016 created a table CONSTRAINT; 0017 created a bare INDEX of the same shape.
-- Both are org-blind and both can serve as an ON CONFLICT arbiter, so both go.
ALTER TABLE cmc_module3_sections
  DROP CONSTRAINT IF EXISTS cmc_module3_sections_project_section;
DROP INDEX IF EXISTS cmc_module3_sections_project_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS cmc_module3_sections_org_project_key_idx
  ON cmc_module3_sections (organization_id, project_id, section_key);

-- ── cmc_source_objects ───────────────────────────────────────────────────────
-- Same defect, and worse in kind: the source-object upsert let one tenant write
-- attacker-chosen JSON into another tenant's canonical CMC inputs, from which
-- every later compile derives.
DROP INDEX IF EXISTS cmc_source_objects_project_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS cmc_source_objects_org_project_key_idx
  ON cmc_source_objects (organization_id, project_id, source_type, source_key, version);

COMMIT;
