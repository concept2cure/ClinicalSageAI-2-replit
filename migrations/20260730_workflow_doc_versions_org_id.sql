-- 20260730_workflow_doc_versions_org_id.sql
--
-- Add organization_id to workflow_document_versions so version rows carry a
-- DIRECT tenant scope, consistent with concept2cure_artifact_versions and
-- module_documents. Previously tenant isolation for a version depended entirely
-- on joining through its parent unified_documents row; every writer now stamps
-- the org directly, and this column also brings the table under the uniform
-- organization_id RLS policy (see migrations/0021_enable_rls_everywhere.sql).
--
-- Non-breaking: the column is added NULLABLE and backfilled from the parent
-- document. It is intentionally left nullable here (not NOT NULL) so the add is
-- safe without a coordinated write freeze; once every historical row is
-- backfilled and all writers are confirmed to populate it, a follow-up may set
-- NOT NULL.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE workflow_document_versions
  ADD COLUMN IF NOT EXISTS organization_id integer;

-- Backfill from the parent unified document.
UPDATE workflow_document_versions v
SET organization_id = d.organization_id
FROM unified_documents d
WHERE v.document_id = d.id
  AND v.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wf_doc_versions_org
  ON workflow_document_versions (organization_id);
