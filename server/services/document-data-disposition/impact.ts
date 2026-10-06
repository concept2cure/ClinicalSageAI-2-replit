import type { DocumentDispositionLinkedIds, DocumentDispositionTarget } from '../../../shared/document-data-disposition';
import { DispositionError, DISPOSITION_HASH as HASH, type DispositionPreviewInput, type DispositionQueryable, type Snapshot } from './types';
import { hashSnapshot } from './tokens';
const SUCCESSFUL_EXTRACTIONS = ['extracted', 'reconciled', 'verified'];
const ACTIVE_STAGES = ['in_review', 'reviewed', 'approved', 'placed', 'packaged', 'submitted'];
const iso = (v: unknown): string => v instanceof Date ? v.toISOString() : String(v);
const unique = (values: string[]): string[] => [...new Set(values)].sort();
async function source(q: DispositionQueryable, input: DispositionPreviewInput, id: string): Promise<any> {
  const rows = input.targetType === 'captured_source'
    ? (await q.query(`SELECT id, title, checksum AS hash, extraction_status, ingestion_status, previous_version_id,
        provenance, metadata, is_current, deleted_at FROM cre_evidence_sources
        WHERE id = $1 AND organization_id = $2 AND client_program_id = $3 AND source_type = 'client_document' AND deleted_at IS NULL`, [id,input.organizationId,input.programId])).rows
    : (await q.query(`SELECT d.id, d.organization_id, document_title AS title, content_hash AS hash, processing_status, extracted_text,
        supersedes_id, retention_until, d.deleted_at FROM vault.documents d
        JOIN regulatory_programs rp ON rp.id=d.program_id
        WHERE d.id = $1::uuid AND rp.organization_id = $2 AND d.program_id = $3 AND d.deleted_at IS NULL`, [id,input.organizationId,input.programId])).rows;
  if (rows.length !== 1) throw new DispositionError(404, 'NOT_FOUND', 'Project or source not found.');
  const row = rows[0];
  if (input.targetType==='vault_document' && row.organization_id!==null && Number(row.organization_id)!==input.organizationId) {
    throw new DispositionError(409,'UNVERIFIED_SCOPE','The Vault version’s recorded tenant conflicts with its owning project. Nothing was changed.');
  }
  if (!HASH.test(String(row.hash ?? ''))) throw new DispositionError(409, 'UNVERIFIED_SOURCE', 'No verified original SHA-256 is recorded for this source. Nothing was changed.');
  return row;
}
async function observe(q: DispositionQueryable, name: string, sql: string, params: unknown[], fingerprints: Record<string, string>): Promise<number> {
  const out = await q.query(`SELECT count(*)::int AS n, encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(z)::text, E'\\n' ORDER BY to_jsonb(z)::text),''),'UTF8')),'hex') AS fingerprint FROM (${sql}) z`, params);
  const rawCount = out.rows[0]?.n;
  const n = typeof rawCount==='number' ? rawCount : Number.NaN;
  if (!Number.isSafeInteger(n) || n < 0 || !HASH.test(out.rows[0]?.fingerprint ?? '')) throw new DispositionError(503, 'IMPACT_UNAVAILABLE', `The ${name} impact is unavailable. Nothing was changed.`);
  fingerprints[name] = out.rows[0].fingerprint;
  return n;
}

async function readLinks(q: DispositionQueryable, input: DispositionPreviewInput, src: any) {
  const params = [input.organizationId,input.programId,src.hash];
  const captures = (await q.query(`SELECT id, title, checksum, extraction_status, ingestion_status, previous_version_id, provenance, metadata, is_current, updated_at FROM cre_evidence_sources WHERE organization_id = $1 AND client_program_id = $2 AND checksum = $3 AND source_type = 'client_document' AND deleted_at IS NULL ORDER BY id`, params)).rows;
  const vaults = (await q.query(`SELECT d.id::text AS id,d.organization_id, content_hash, document_title, processing_status, extracted_text, retention_until, supersedes_id, d.updated_at FROM vault.documents d JOIN regulatory_programs rp ON rp.id=d.program_id WHERE rp.organization_id = $1 AND program_id = $2 AND content_hash = $3 AND d.deleted_at IS NULL ORDER BY d.id`,params)).rows;
  if (vaults.some((r)=>r.organization_id!==null && Number(r.organization_id)!==input.organizationId)) throw new DispositionError(409,'UNVERIFIED_SCOPE','A linked Vault version’s tenant conflicts with its owning project.');
  if (captures.length > 1 || vaults.length > 1) throw new DispositionError(409,'AMBIGUOUS_LINKS','Multiple project identities hold these original bytes. Resolve that ambiguity before removal.');
  const namedUploads = unique(captures.map((r) => String(r.provenance?.fileUploadId ?? '')).filter(Boolean));
  const uploads = (await q.query(`SELECT id, checksum_sha256, storage_path, status FROM file_uploads WHERE organization_id = $1 AND id = ANY($2::text[]) ORDER BY id`, [input.organizationId,namedUploads])).rows;
  if (uploads.length !== namedUploads.length || uploads.some((r) => r.checksum_sha256 !== src.hash || !String(r.storage_path).startsWith(`uploads/org-${input.organizationId}/`))) {
    throw new DispositionError(409,'UNVERIFIED_LINKS','A linked upload is missing, belongs to another scope, or does not match the captured hash.');
  }
  // The artifact carries extracted-text hash, not original-byte hash. Its recorded
  // upload pointer is therefore proved through the exact-hash verified upload.
  const artifacts = (await q.query(`SELECT a.id::text AS id, a.artifact_id, a.content_hash, a.content, a.status, a.metadata
      FROM concept2cure_artifacts a JOIN projects p ON p.id = a.project_id AND p.organization_id = a.organization_id
      WHERE a.organization_id = $1 AND p.regulatory_program_id = $2
        AND (a.metadata->>'fileId' = ANY($3::text[]) OR a.content_hash = $4)
      ORDER BY a.id`, [input.organizationId,input.programId,namedUploads,src.hash])).rows;
  const linkedIds: DocumentDispositionLinkedIds = {
    capturedSourceIds: captures.map((r) => Number(r.id)), vaultDocumentIds: vaults.map((r) => String(r.id)),
    artifactIds: unique(artifacts.flatMap((r) => [String(r.id),String(r.artifact_id)])), uploadIds: namedUploads,
  };
  const fingerprints: Record<string,string> = { captures: hashSnapshot(captures), vaults: hashSnapshot(vaults), uploads: hashSnapshot(uploads), artifacts: hashSnapshot(artifacts) };
  return {captures,vaults,artifacts,linkedIds,fingerprints};
}
async function readImpactCounts(q: DispositionQueryable, input: DispositionPreviewInput, linkedIds: DocumentDispositionLinkedIds, artifacts: any[], fingerprints: Record<string,string>) {
  const ids = [input.organizationId,JSON.stringify(linkedIds)];
  const atomSql = `SELECT * FROM lumen_data_atoms a WHERE a.organization_id = $1
    AND public.document_disposition_atom_references(a.source_type,a.source_id,to_jsonb(a.structured_data),$2::jsonb)`;
  const atoms = await observe(q,'atoms',atomSql,ids,fingerprints);
  // tenant-isolation-safe: readLinks proves each exact-hash Vault ID through regulatory_programs.organization_id and this program before this child-only count.
  const vaultChunks = await observe(q,'vaultChunks','SELECT * FROM vault.document_chunks WHERE document_id::text = ANY($1::text[])',[linkedIds.vaultDocumentIds],fingerprints);
  const ragChunks = await observe(q,'ragChunks',`SELECT c.* FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id
    WHERE d.organization_id = $1 AND public.document_disposition_rag_references(d.document_id,$2::jsonb)`,[input.organizationId,JSON.stringify(linkedIds)],fingerprints);
  await observe(q,'ragDocuments',`SELECT d.* FROM rag_documents d WHERE d.organization_id=$1 AND public.document_disposition_rag_references(d.document_id,$2::jsonb)`,[input.organizationId,JSON.stringify(linkedIds)],fingerprints);
  const catalogValues = await observe(q,'catalogValues',`SELECT dc.document_id, kv.key, kv.value FROM vault.document_catalog dc
    CROSS JOIN LATERAL jsonb_path_query(COALESCE(dc.key_data,'{}'::jsonb), 'strict $.** ? (@.type() != "object" && @.type() != "array" && @.type() != "null")') WITH ORDINALITY kv(value,key)
    WHERE dc.document_id::text = ANY($1::text[])`,[linkedIds.vaultDocumentIds],fingerprints);
  await observe(q,'catalogRows','SELECT * FROM vault.document_catalog WHERE document_id::text = ANY($1::text[])',[linkedIds.vaultDocumentIds],fingerprints);
  const authorCitations = await observe(q,'authorCitations',`SELECT * FROM authoring_citations WHERE tenant_id = $1 AND source = 'cre_evidence_source' AND reference_id = ANY($2::text[])`,[input.organizationId,linkedIds.capturedSourceIds.map(String)],fingerprints);
  const vaultCitations = await observe(q,'vaultCitations',`SELECT * FROM vault.evidence_citations WHERE source_document_id::text = ANY($1::text[]) OR evidence_document_id::text = ANY($1::text[])`,[linkedIds.vaultDocumentIds],fingerprints);
  const lineage = await observe(q,'lineage',`SELECT * FROM document_span_lineage WHERE organization_id = $1 AND (source = 'cre_evidence_source' AND reference_id = ANY($2::text[]))`,[input.organizationId,linkedIds.capturedSourceIds.map(String)],fingerprints);
  const cmcReferences = await observe(q,'cmcReferences',`SELECT * FROM cmc_source_evidence WHERE organization_id=$1 AND program_id=$2 AND vault_document_id::text=ANY($3::text[]) AND unlinked_at IS NULL`,[input.organizationId,input.programId,linkedIds.vaultDocumentIds],fingerprints);
  const governedReferences = await observe(q,'governedReferences',`SELECT g.* FROM governed_dependencies g JOIN projects p ON p.id=g.project_id AND p.organization_id=g.organization_id
    WHERE g.organization_id=$1 AND p.regulatory_program_id=$2 AND g.source_type='artifact' AND g.source_id=ANY($3::text[])`,[input.organizationId,input.programId,linkedIds.artifactIds],fingerprints);
  const downstreamReferences = lineage+cmcReferences+governedReferences;
  const legalHolds = await observe(q,'holds',`SELECT * FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL AND (program_id = $2 OR document_id::text = ANY($3::text[]))`,[input.organizationId,input.programId,linkedIds.vaultDocumentIds],fingerprints);
  const vaultApprovals = await observe(q,'approvals',`SELECT * FROM canonical_documents WHERE organization_id = $1 AND source_refs->'vault_documents'->>'nativeId' = ANY($2::text[]) AND stage = ANY($3::text[])`,[input.organizationId,linkedIds.vaultDocumentIds,ACTIVE_STAGES],fingerprints);
  const authorApprovals = await observe(q,'authorApprovals',`SELECT DISTINCT d.* FROM authoring_documents d JOIN authoring_sections s ON s.doc_id=d.id AND s.tenant_id=d.tenant_id
    JOIN authoring_citations c ON c.section_id=s.id AND c.tenant_id=d.tenant_id WHERE d.tenant_id=$1 AND c.source='cre_evidence_source' AND c.reference_id=ANY($2::text[])
    AND (d.status IN ('review','in_review','approved','locked','submitted','frozen') OR d.approved_at IS NOT NULL OR d.frozen_at IS NOT NULL OR d.locked_at IS NOT NULL)`,[input.organizationId,linkedIds.capturedSourceIds.map(String)],fingerprints);
  const c2cApprovals = await observe(q,'c2cApprovals',`SELECT DISTINCT d.* FROM c2c_documents d LEFT JOIN c2c_document_sections s ON s.document_id=d.id
    JOIN document_span_lineage l ON l.organization_id=d.org_id AND ((l.document_table='c2c_documents' AND l.document_id=d.id) OR (l.document_table='c2c_document_sections' AND l.document_id=s.id::text))
    WHERE d.org_id=$1 AND d.project_id=$2 AND l.source='cre_evidence_source' AND l.reference_id=ANY($3::text[])
      AND (d.status IN ('review','approved','locked','submitted') OR s.status IN ('review','approved','locked'))`,[input.organizationId,input.programId,linkedIds.capturedSourceIds.map(String)],fingerprints);
  const active = vaultApprovals+authorApprovals+c2cApprovals+artifacts.filter((r)=>['approved','locked'].includes(r.status)).length;
  return {atoms,vaultChunks,ragChunks,catalogValues,authorCitations,vaultCitations,downstreamReferences,legalHolds,active,cmcReferences,governedReferences};
}
async function readCurrent(q: DispositionQueryable, input: DispositionPreviewInput, hash: string) {
  const params = [input.organizationId,input.programId,hash];
  const currentRows = (await q.query(`SELECT id::text, choice, created_at, captured_source_id::text,vault_document_id::text,disposition_sequence,linked_ids,replacement_captured_source_id::text, replacement_vault_document_id::text FROM document_data_dispositions WHERE organization_id = $1 AND program_id = $2 AND source_sha256 = $3 ORDER BY disposition_sequence DESC LIMIT 1`,params)).rows;
  const current = currentRows[0];
  const currentDisposition = current ? { id: current.id, choice: current.choice, createdAt: iso(current.created_at), replacementId: current.replacement_captured_source_id ?? current.replacement_vault_document_id ?? null } : null;
  return {current,currentDisposition};
}
function capturedSuccessor(r: any, src: any, usable: boolean): boolean {
  return String(r.previous_version_id)===String(src.id) && r.ingestion_status==='ingested' && SUCCESSFUL_EXTRACTIONS.includes(r.extraction_status) && r.is_current!==false && usable;
}
function vaultSuccessor(r: any, src: any): boolean {
  return String(r.supersedes_id)===String(src.id) && r.processing_status==='INDEXED' && Boolean(String(r.extracted_text ?? '').trim());
}
async function readReplacement(q: DispositionQueryable, input: DispositionPreviewInput, src: any, fingerprints: Record<string,string>): Promise<DocumentDispositionTarget|null> {
  if (!input.replacementId) return null;
  {
    const r = await source(q,input,input.replacementId);
    const usable = input.targetType === 'captured_source' ? await observe(q,'replacementAtoms',`SELECT a.* FROM lumen_data_atoms a WHERE a.organization_id=$1 AND a.source_type='chat_upload' AND a.source_id=$2 AND a.status='active' AND length(btrim(a.content)) > 0`,[input.organizationId,`cre_source:${r.id}`],fingerprints) > 0 : true;
    const isSuccessor = input.targetType === 'captured_source' ? capturedSuccessor(r,src,usable) : vaultSuccessor(r,src);
    if (!isSuccessor || r.hash === src.hash) throw new DispositionError(409,'INVALID_SUCCESSOR','The named replacement must be a verified direct successor in this project with usable extraction.');
    const disposed = await q.query('SELECT id FROM document_data_dispositions WHERE organization_id=$1 AND program_id=$2 AND source_sha256=$3',[input.organizationId,input.programId,r.hash]);
    if (disposed.rows.length) throw new DispositionError(409,'INVALID_SUCCESSOR','The named replacement has already been withdrawn.');
    const replacement = { type: input.targetType, id: String(r.id), title: String(r.title ?? ''), sha256: r.hash };
    fingerprints.replacement = hashSnapshot(r);
    return replacement;
  }
}
function sameOriginalTarget(input: DispositionPreviewInput, src: any, current: any): boolean {
  return String(current.captured_source_id ?? current.vault_document_id)===String(src.id) && (input.targetType==='captured_source')===(current.captured_source_id!==null);
}
function dispositionBlockers(input: DispositionPreviewInput, src: any, prior: {current: any; currentDisposition: Snapshot['currentDisposition']}, enabled: boolean, impact: {legalHolds:number; active:number; cmcReferences:number; governedReferences:number}): string[] {
  const {current,currentDisposition}=prior;
  const {legalHolds,active,cmcReferences,governedReferences}=impact;
  const blockers: string[] = [];
  if (!enabled) blockers.push('Document disposition enforcement is awaiting verified activation.');
  if (currentDisposition && currentDisposition.choice!=='keep_data') blockers.push('This source data already has a terminal withdrawal or supersession disposition.');
  if (current && !sameOriginalTarget(input,src,current)) blockers.push('Manage retained data through the original typed source target recorded in its disposition.');
  if (legalHolds > 0) blockers.push('An active legal hold requires governed review before this project withdrawal.');
  if (active > 0) blockers.push('Active review, approval or submitted content depends on this file. Governed review is required.');
  if (cmcReferences > 0 || governedReferences > 0) blockers.push('Governed CMC evidence or downstream dependency links require review before withdrawal.');
  return blockers;
}
function extractedTexts(captures: any[], vaults: any[], artifacts: any[]): number {
  return captures.filter((r)=>SUCCESSFUL_EXTRACTIONS.includes(r.extraction_status)).length + vaults.filter((r)=>String(r.extracted_text ?? '').trim()).length + artifacts.filter((r)=>String(r.content ?? '').trim()).length;
}
function retentionUntil(vaults: any[]): string|null {
  return vaults.map((r)=>r.retention_until ? iso(r.retention_until).slice(0,10) : null).filter(Boolean).sort().at(-1) ?? null;
}
export async function readDispositionSnapshot(q: DispositionQueryable, input: DispositionPreviewInput, enabled: boolean): Promise<Snapshot> {
  const src = await source(q,input,String(input.targetId));
  const {captures,vaults,artifacts,linkedIds,fingerprints}=await readLinks(q,input,src);
  const {atoms,vaultChunks,ragChunks,catalogValues,authorCitations,vaultCitations,downstreamReferences,legalHolds,active,cmcReferences,governedReferences}=await readImpactCounts(q,input,linkedIds,artifacts,fingerprints);
  const {current,currentDisposition}=await readCurrent(q,input,src.hash);
  const replacement=await readReplacement(q,input,src,fingerprints);
  const blockers=dispositionBlockers(input,src,{current,currentDisposition},enabled,{legalHolds,active,cmcReferences,governedReferences});
  return {
    target: { type:input.targetType,id:String(src.id),title:String(src.title ?? ''),sha256:src.hash }, linkedIds,
    counts: { extractedTexts: extractedTexts(captures,vaults,artifacts),
      chunks:vaultChunks+ragChunks,atoms,catalogValues,citations:authorCitations+vaultCitations,downstreamReferences },
    retention: { legalHolds, retentionUntil: retentionUntil(vaults), physicalErasure:false },
    approvals:{active}, blockers,replacement,currentDisposition,fingerprints,sequence:current?Number(current.disposition_sequence)+1:1,
  };
}
