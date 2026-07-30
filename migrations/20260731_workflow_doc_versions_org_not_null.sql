-- 20260731_workflow_doc_versions_org_not_null.sql
--
-- Tighten workflow_document_versions.organization_id to NOT NULL.
--
-- The column was added NULLABLE and backfilled in 20260730_workflow_doc_versions_org_id.sql.
-- Every production writer (ModuleIntegrationService.registerDocument + updateDocument,
-- ai-actions promote-artifact, ai-actions save-document-version) now stamps it directly,
-- and every historical row is backfillable from the parent unified_documents row via the
-- NOT NULL document_id FK. The constraint is therefore safe to enforce, and it upgrades the
-- direct tenant scope from "populated by convention" to "guaranteed by the database".
-- ────────────────────────────────────────────────────────────────────────

-- Idempotent re-backfill in case any row was inserted nullable between the add and now.
UPDATE workflow_document_versions v
SET organization_id = d.organization_id
FROM unified_documents d
WHERE v.document_id = d.id
  AND v.organization_id IS NULL;

ALTER TABLE workflow_document_versions
  ALTER COLUMN organization_id SET NOT NULL;
