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
export const capturedDataEligibleSql = (a: string): string => eligible('captured', a, false);
export const vaultDataEligibleSql = (a: string): string => eligible('vault', a, false);
export const capturedBinaryAvailableSql = (a: string): string => eligible('captured', a, true);
export const vaultBinaryAvailableSql = (a: string): string => eligible('vault', a, true);
export const capturedDispositionChoiceSql = (a: string): string => `(SELECT dd.choice FROM public.document_data_dispositions dd WHERE ${matching('captured', a)} ORDER BY dd.disposition_sequence DESC, dd.created_at DESC, dd.id DESC LIMIT 1)`;
export const vaultDispositionChoiceSql = (a: string): string => `(SELECT dd.choice FROM public.document_data_dispositions dd WHERE ${matching('vault', a)} ORDER BY dd.disposition_sequence DESC, dd.created_at DESC, dd.id DESC LIMIT 1)`;
export function uploadedBinaryAvailableSql(value: string): string {
  const a = alias(value);
  return `NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id = ${a}.organization_id
    AND (dd.source_sha256=${a}.checksum_sha256 OR dd.linked_ids->'uploadIds' @> jsonb_build_array(${a}.id::text) OR EXISTS (
      SELECT 1 FROM public.cre_evidence_sources ds WHERE ds.organization_id = dd.organization_id
        AND ds.client_program_id = dd.program_id AND ds.checksum = dd.source_sha256
        AND ds.provenance->>'fileUploadId' = ${a}.id::text)))`;
}
function atomEligible(value: string, binary: boolean): string {
  const a = alias(value);
  return `NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id = ${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data', 'supersede')"}
    AND public.document_disposition_atom_references(${a}.source_type,${a}.source_id,to_jsonb(${a}.structured_data),dd.linked_ids))`;
}
export const atomDataEligibleSql = (a: string): string => atomEligible(a, false);
export const atomOriginalFileAvailableSql = (a: string): string => atomEligible(a, true);
function ragEligible(value: string, binary: boolean): string {
  const a = alias(value);
  return `NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data','supersede')"}
    AND (public.document_disposition_rag_references(${a}.document_id,dd.linked_ids)
      OR dd.source_sha256=to_jsonb(${a})->>'file_hash'))`;
}
export const ragDataEligibleSql = (a: string): string => ragEligible(a,false);
export const ragOriginalFileAvailableSql = (a: string): string => ragEligible(a,true);
function artifactEligible(value: string, binary: boolean): string {
  const a = alias(value);
  return `NOT EXISTS (SELECT 1 FROM public.document_data_dispositions dd WHERE dd.organization_id=${a}.organization_id
    ${binary ? '' : "AND dd.choice IN ('remove_data','supersede')"}
    AND (public.document_disposition_artifact_references(${a}.id::text,${a}.artifact_id,to_jsonb(${a}.metadata),dd.linked_ids)
      OR EXISTS (SELECT 1 FROM public.file_uploads du WHERE du.id=${a}.metadata->>'fileId' AND du.organization_id=dd.organization_id AND du.checksum_sha256=dd.source_sha256)
      OR (dd.source_sha256=${a}.content_hash AND EXISTS (SELECT 1 FROM public.projects dp WHERE dp.id=${a}.project_id
        AND dp.organization_id=dd.organization_id AND dp.regulatory_program_id=dd.program_id))))`;
}
export const artifactDataEligibleSql = (a: string): string => artifactEligible(a,false);
export const artifactOriginalFileAvailableSql = (a: string): string => artifactEligible(a,true);
