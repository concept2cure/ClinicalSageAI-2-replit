-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Enable durable, thread-scoped AnA Document Studio draft version
--          history by giving concept2cure_artifacts a stable per-thread lookup
--          key (ana_thread_id + title_slug) so successive AnA drafts of the same
--          document append as governed versions instead of living only in the
--          per-session in-memory array.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 / Module 2 / Module 5 (any document AnA drafts).
--   - Integrity Risk Addressed: lost draft lineage — prior version history was
--     session-only and never persisted, breaking the auditable evidence chain
--     for AnA-authored regulatory documents.
--
-- Determinism Contract:
--   - Additive, nullable columns only. No change to canonical content schemas or
--     deterministic evidence pointers; no spec version bump required.
--
-- ADDITIVITY / SAFETY:
--   - Both columns are NULLABLE and added with IF NOT EXISTS. Existing rows are
--     untouched (NULL ana_thread_id / title_slug). The new btree index is a pure
--     read accelerator for the per-thread upsert lookup. Idempotent / re-runnable.
-- =============================================================================

ALTER TABLE concept2cure_artifacts
  ADD COLUMN IF NOT EXISTS ana_thread_id TEXT;

ALTER TABLE concept2cure_artifacts
  ADD COLUMN IF NOT EXISTS title_slug TEXT;

-- Lookup accelerator for the transactional per-thread draft upsert:
-- find the artifacts row by (org, project, thread, normalized title).
CREATE INDEX IF NOT EXISTS c2c_artifact_thread_lookup_idx
  ON concept2cure_artifacts (organization_id, project_id, ana_thread_id, title_slug);
