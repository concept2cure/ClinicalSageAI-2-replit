-- Read-only. Live submission leaves on a co-author document whose current text
-- no longer matches the sha256 the leaf pinned when it was placed, with:
--   * whether the copy is an Authoring filing copy (metadata.source),
--   * whether a placement re-take rewrote it after the pin (audit_events
--     'coauthor_document.retaken' later than document_pinned_at),
--   * which coauthor_document_versions row still holds the pinned text, if any
--     (versionReplacedCoauthorContent kept the replaced text there).
-- Run as a role that sees every organization (RLS bypass) or per organization.
BEGIN TRANSACTION READ ONLY;
SELECT l.id                                         AS leaf_id,
       l.organization_id,
       s.sequence_number,
       s.status                                     AS sequence_status,
       l.section_code,
       l.document_id                                AS copy_id,
       c.metadata ->> 'source'                      AS copy_source,
       c.metadata ->> 'docId'                       AS source_authoring_doc,
       left(l.document_content_sha256, 12)          AS pinned_sha256,
       left(encode(sha256(convert_to(coalesce(c.content, ''), 'UTF8')), 'hex'), 12) AS current_sha256,
       l.document_pinned_at,
       c.updated_at                                 AS copy_updated_at,
       EXISTS (SELECT 1 FROM audit_events e
                WHERE e.entity_type = 'coauthor_document' AND e.entity_id::text = c.id::text
                  AND e.event_type = 'coauthor_document.retaken'
                  AND e.timestamp > l.document_pinned_at) AS retaken_after_pin,
       (SELECT v.version_number FROM coauthor_document_versions v
         WHERE v.document_id = c.id
           AND encode(sha256(convert_to(coalesce(v.content, ''), 'UTF8')), 'hex') = l.document_content_sha256
         ORDER BY v.version_number DESC LIMIT 1)   AS pinned_text_in_version
  FROM submission_leaves l
  JOIN coauthor_documents c ON c.id = l.document_id AND c.organization_id = l.organization_id
  JOIN ectd_sequences s     ON s.id = l.sequence_id
 WHERE l.document_table = 'coauthor_documents'
   AND l.deleted_at IS NULL
   AND l.document_content_sha256 IS NOT NULL
   AND l.document_content_sha256 <> encode(sha256(convert_to(coalesce(c.content, ''), 'UTF8')), 'hex')
 ORDER BY l.organization_id, l.id;
ROLLBACK;

-- Leaves placed before pinning existed (document_content_sha256 IS NULL) cannot
-- be compared by hash. A placement re-take after such a leaf was created is the
-- same rewrite, found by its audit event instead.
BEGIN TRANSACTION READ ONLY;
SELECT l.id AS leaf_id, l.organization_id, l.sequence_id, l.section_code, l.document_id AS copy_id,
       l.created_at AS leaf_created_at, e.timestamp AS retaken_at,
       e.metadata -> 'before' ->> 'contentSha256' AS replaced_sha256,
       e.metadata ->> 'supersededVersion'         AS replaced_text_in_version
  FROM submission_leaves l
  JOIN audit_events e ON e.entity_type = 'coauthor_document' AND e.entity_id::text = l.document_id::text
                     AND e.event_type = 'coauthor_document.retaken' AND e.timestamp > l.created_at
 WHERE l.document_table = 'coauthor_documents' AND l.deleted_at IS NULL
   AND l.document_content_sha256 IS NULL
 ORDER BY l.organization_id, l.id;
ROLLBACK;
