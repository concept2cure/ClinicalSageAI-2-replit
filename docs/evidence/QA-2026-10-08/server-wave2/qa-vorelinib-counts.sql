-- Read-only: every statement is a SELECT inside a READ ONLY transaction.
BEGIN READ ONLY;
\pset footer off

\echo '-- project and organization'
SELECT id, organization_id, name, deleted_at IS NULL AS live
  FROM regulatory_programs WHERE id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd';

\echo '-- (1) current vault documents: live rows, not superseded by a live successor, in this organization'
SELECT count(*) AS current_vault_documents
  FROM vault.documents d
  JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = 1 AND rp.deleted_at IS NULL
 WHERE d.program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd' AND d.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM vault.documents succ
                    WHERE succ.supersedes_id = d.id AND succ.program_id = d.program_id
                      AND succ.document_code IS NOT DISTINCT FROM d.document_code
                      AND succ.organization_id = d.organization_id
                      AND succ.deleted_at IS NULL AND d.deleted_at IS NULL);

\echo '-- (1b) live vault rows for the project, before the supersession rule (for context)'
SELECT count(*) AS live_vault_rows
  FROM vault.documents d
 WHERE d.program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd' AND d.deleted_at IS NULL;

\echo '-- (2) records count by the NEW vaultDocuments query text (projects.ts PROJECT_RECORD_READS), $1 = project, $2 = org = 1'
WITH r AS (
  SELECT d.id, d.document_code, d.document_title, d.version, d.created_at
    FROM vault.documents d
    JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = 1
   WHERE d.program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd' AND d.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM vault.documents succ
                      WHERE succ.supersedes_id = d.id AND succ.program_id = d.program_id
                        AND succ.document_code IS NOT DISTINCT FROM d.document_code
                        AND succ.organization_id = d.organization_id
                        AND succ.deleted_at IS NULL AND d.deleted_at IS NULL)
   ORDER BY d.created_at DESC LIMIT 200)
SELECT count(*) AS records_vault_documents FROM r;

\echo '-- (2b) records count by the NEW sources query text, $1 = project, $2 = org = 1'
WITH r AS (
  SELECT id, title, source_type, checksum, created_at
    FROM cre_evidence_sources WHERE client_program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd' AND organization_id = 1
     AND deleted_at IS NULL AND source_type = 'client_document'
     AND is_current IS NOT FALSE
   ORDER BY created_at DESC LIMIT 200)
SELECT count(*) AS records_sources FROM r;

\echo '-- (3) Data room sources under its live-source predicate (listClientDocuments, currentOnly, programId; org clause as written there)'
SELECT count(*) AS data_room_sources_predicate
  FROM cre_evidence_sources
 WHERE (organization_id IS NULL OR organization_id = 1)
   AND deleted_at IS NULL AND source_type = 'client_document'
   AND is_current IS NOT FALSE
   AND client_program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd';

\echo '-- (3b) what the project holds in cre_evidence_sources, by the three exclusions (for context)'
SELECT count(*) AS all_rows,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
       count(*) FILTER (WHERE deleted_at IS NULL AND source_type <> 'client_document') AS not_client_document,
       count(*) FILTER (WHERE deleted_at IS NULL AND source_type = 'client_document' AND is_current IS FALSE) AS retired
  FROM cre_evidence_sources
 WHERE client_program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd' AND organization_id = 1;

\echo '-- (4) Vault tree upload total: headsWhere with the disposition eligibility the tree applies (for context)'
SELECT count(*) AS tree_upload_heads
  FROM vault.documents d
 WHERE d.program_id = '50c41bb6-5796-4dc6-a848-72e4d1246ebd' AND d.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = 1 AND rp.deleted_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd
                    WHERE EXISTS (SELECT 1 FROM regulatory_programs dp WHERE dp.id = d.program_id AND dp.organization_id = dd.organization_id)
                      AND dd.program_id = d.program_id
                      AND (dd.vault_document_id = d.id OR dd.linked_ids->'vaultDocumentIds' @> jsonb_build_array(d.id::text) OR dd.source_sha256 = d.content_hash)
                      AND dd.choice IN ('remove_data', 'supersede'))
   AND NOT EXISTS (SELECT 1 FROM vault.documents succ
                    WHERE succ.supersedes_id = d.id AND succ.program_id = d.program_id
                      AND succ.document_code IS NOT DISTINCT FROM d.document_code
                      AND succ.organization_id = d.organization_id
                      AND succ.deleted_at IS NULL AND d.deleted_at IS NULL);

ROLLBACK;
