import { recordedLineageEligibleSql } from './recorded-lineage';

/** One disposition projection for every consumer. No flag bypasses an existing disposition. */
function alias(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid SQL alias');
  return value;
}
function matching(kind: 'captured' | 'vault', value: string): string {
  const a = alias(value);
  const program = kind === 'captured' ? 'client_program_id' : 'program_id';
  const target = kind === 'captured' ? 'captured_source_id' : 'vault_document_id';
  const linked = kind === 'captured' ? 'capturedSourceIds' : 'vaultDocumentIds';
  // Also bind the original hash: a new identity carrying the same original bytes
  // cannot silently resurrect a withdrawn source between the snapshot and ingest.
  const hash = kind === 'captured' ? 'checksum' : 'content_hash';
  const organization = kind==='captured' ? `dd.organization_id = ${a}.organization_id`
    : `EXISTS (SELECT 1 FROM public.regulatory_programs dd_program WHERE dd_program.id=${a}.program_id AND dd_program.organization_id=dd.organization_id)`;
  return `${organization} AND dd.program_id = ${a}.${program}
    AND (dd.${target} = ${a}.id OR dd.linked_ids->'${linked}' @> jsonb_build_array(${kind === 'captured' ? `${a}.id` : `${a}.id::text`})
      OR dd.source_sha256 = ${a}.${hash})`;
}
function eligible(kind: 'captured' | 'vault', a: string, binary: boolean): string {
  return `NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE ${matching(kind, a)}${binary ? '' : " AND dd.choice IN ('remove_data', 'supersede')"})`;
}
/** Impact retains a named unverified dependency for review even though its
 * lineage cannot qualify the data for a consumer. Direct dispositions still
 * exclude that child. This is internal to disposition impact. */
export const capturedOwnDataEligibleSql = (a: string): string => eligible('captured', a, false);
export const capturedDataEligibleSql = (a: string): string => `(${eligible('captured', a, false)} AND ${recordedLineageEligibleSql('captured',a)})`;
export const vaultDataEligibleSql = (a: string): string => eligible('vault', a, false);
export const capturedBinaryAvailableSql = (a: string): string => `(${eligible('captured', a, true)} AND ${recordedLineageEligibleSql('captured',a)})`;
export const vaultBinaryAvailableSql = (a: string): string => eligible('vault', a, true);
export const capturedDispositionChoiceSql = (a: string): string => `(SELECT dd.choice FROM public.document_data_dispositions dd WHERE ${matching('captured', a)} ORDER BY dd.disposition_sequence DESC, dd.created_at DESC, dd.id DESC LIMIT 1)`;
export const vaultDispositionChoiceSql = (a: string): string => `(SELECT dd.choice FROM public.document_data_dispositions dd WHERE ${matching('vault', a)} ORDER BY dd.disposition_sequence DESC, dd.created_at DESC, dd.id DESC LIMIT 1)`;
function uploadedEligible(value: string, binary: boolean): string {
  const a = alias(value);
  return `(NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id = ${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data','supersede')"}
    AND (dd.source_sha256=${a}.checksum_sha256 OR dd.linked_ids->'uploadIds' @> jsonb_build_array(${a}.id::text) OR EXISTS (
      SELECT 1 FROM public.cre_evidence_sources ds WHERE ds.organization_id = dd.organization_id
        AND ds.client_program_id = dd.program_id AND ds.checksum = dd.source_sha256
        AND ds.provenance->>'fileUploadId' = ${a}.id::text))) AND ${recordedLineageEligibleSql('upload',a)})`;
}
export const uploadedBinaryAvailableSql = (a: string): string => uploadedEligible(a, true);

/** Cached representations inherit their exact recorded source associations.
 * Existing normalizers define those identities; no digest invents an edge.
 * Data and original-file availability stay distinct for keep_data. CASE binds
 * the ancestry evaluation to the matched identity before executing its CTE;
 * PostgreSQL may reorder ordinary AND filters over unrelated tenant records. */
function associatedEligible(
  value: string, binary: boolean, references: (ids: string) => string,
  candidates: { captured?: string; upload: string; artifact?: string },
): string {
  const a = alias(value);
  const captured = candidates.captured ? `NOT EXISTS (SELECT 1 FROM public.cre_evidence_sources dcr_source
      WHERE dcr_source.organization_id=${a}.organization_id
        AND CASE WHEN ${candidates.captured} THEN
          CASE WHEN ${references("jsonb_build_object('capturedSourceIds',jsonb_build_array(dcr_source.id))")}
            THEN NOT ${binary ? capturedBinaryAvailableSql('dcr_source') : capturedDataEligibleSql('dcr_source')} ELSE FALSE END
          ELSE FALSE END)` : 'TRUE';
  return `(${captured} AND NOT EXISTS (SELECT 1 FROM public.file_uploads dcr_upload
      WHERE dcr_upload.organization_id=${a}.organization_id
        AND CASE WHEN ${candidates.upload} THEN
          CASE WHEN ${references("jsonb_build_object('uploadIds',jsonb_build_array(dcr_upload.id::text))")}
            THEN NOT ${uploadedEligible('dcr_upload', binary)} ELSE FALSE END
          ELSE FALSE END)
    ${candidates.artifact ? `AND NOT EXISTS (SELECT 1 FROM public.concept2cure_artifacts dcr_artifact
      WHERE dcr_artifact.organization_id=${a}.organization_id
        AND CASE WHEN ${candidates.artifact} THEN
          CASE WHEN ${references("jsonb_build_object('artifactIds',jsonb_build_array(dcr_artifact.id::text,dcr_artifact.artifact_id))")}
            THEN NOT ${artifactEligible('dcr_artifact', binary)} ELSE FALSE END
          ELSE FALSE END)` : ''})`;
}
function atomEligible(value: string, binary: boolean): string {
  const a = alias(value);
  const references = (ids: string) => `public.document_disposition_atom_references(${a}.source_type,${a}.source_id,to_jsonb(${a}.structured_data),${ids})`;
  // These cheap identity candidates only bound lookup work. The existing
  // normalizer still decides which source types and recorded fields bind.
  const candidates = {
    captured: `(dcr_source.id::text=${a}.source_id OR 'cre_source:'||dcr_source.id::text=${a}.source_id
      OR dcr_source.id::text=to_jsonb(${a}.structured_data)->>'sourceId'
      OR to_jsonb(${a}.structured_data)->'supportingSourceIds' @> jsonb_build_array(dcr_source.id)
      OR to_jsonb(${a}.structured_data)->'supportingSourceIds' @> jsonb_build_array(dcr_source.id::text)
      OR to_jsonb(${a}.structured_data)->'contradictingSourceIds' @> jsonb_build_array(dcr_source.id)
      OR to_jsonb(${a}.structured_data)->'contradictingSourceIds' @> jsonb_build_array(dcr_source.id::text))`,
    upload: `(dcr_upload.id=${a}.source_id OR 'upload:'||dcr_upload.id=${a}.source_id)`,
    artifact: `(dcr_artifact.id::text=${a}.source_id OR dcr_artifact.artifact_id=${a}.source_id)`,
  };
  return `(NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id = ${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data', 'supersede')"}
    AND ${references('dd.linked_ids')}) AND ${associatedEligible(a, binary, references, candidates)})`;
}
export const atomDataEligibleSql = (a: string): string => atomEligible(a, false);
export const atomOriginalFileAvailableSql = (a: string): string => atomEligible(a, true);
function ragEligible(value: string, binary: boolean): string {
  const a = alias(value);
  const references = (ids: string) => `public.document_disposition_rag_references(${a}.document_id,${ids})`;
  const candidates = {
    captured: `('cre_source:'||dcr_source.id::text=${a}.document_id)`,
    upload: `(dcr_upload.id=${a}.document_id)`,
    artifact: `(dcr_artifact.id::text=${a}.document_id OR dcr_artifact.artifact_id=${a}.document_id)`,
  };
  return `(NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data','supersede')"}
    AND (${references('dd.linked_ids')}
      OR dd.source_sha256=to_jsonb(${a})->>'file_hash')) AND ${associatedEligible(a, binary, references, candidates)})`;
}
export const ragDataEligibleSql = (a: string): string => ragEligible(a,false);
export const ragOriginalFileAvailableSql = (a: string): string => ragEligible(a,true);
function artifactEligible(value: string, binary: boolean): string {
  const a = alias(value);
  const references = (ids: string) => `public.document_disposition_artifact_references(${a}.id::text,${a}.artifact_id,to_jsonb(${a}.metadata),${ids})`;
  return `(NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data','supersede')"}
    AND (${references('dd.linked_ids')}
      OR EXISTS (SELECT 1 FROM public.file_uploads du WHERE du.id=${a}.metadata->>'fileId' AND du.organization_id=dd.organization_id AND du.checksum_sha256=dd.source_sha256)
      OR (dd.source_sha256=${a}.content_hash AND EXISTS (SELECT 1 FROM public.projects dp WHERE dp.id=${a}.project_id
        AND dp.organization_id=dd.organization_id AND dp.regulatory_program_id=dd.program_id))))
    AND ${associatedEligible(a, binary, references, { upload: `(dcr_upload.id=${a}.metadata->>'fileId')` })})`;
}
export const artifactDataEligibleSql = (a: string): string => artifactEligible(a,false);
export const artifactOriginalFileAvailableSql = (a: string): string => artifactEligible(a,true);
