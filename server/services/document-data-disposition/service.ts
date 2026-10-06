import { randomUUID } from 'node:crypto';
import type { DocumentDispositionPreview, DocumentDispositionRecord } from '../../../shared/document-data-disposition';
import { DOCUMENT_DISPOSITION_REASON_MIN, DOCUMENT_DISPOSITION_REASON_MAX } from '../../../shared/document-data-disposition';
import { programInOrganization, canMutateProgram } from '../c2c/program-access';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { DispositionError, DISPOSITION_UUID as UUID, DISPOSITION_HASH as HASH, type DispositionPreviewInput, type DispositionApplyInput, type DispositionQueryable, type DispositionServiceDependencies, type Snapshot } from './types';
import { createDispositionTokenCodec, hashSnapshot } from './tokens';
import { readDispositionSnapshot } from './impact';
export * from './types';

/** All records contributing to the preview are write-locked during confirmation.
 * This prevents a late chunk, citation, hold or approval slipping between the
 * freshness check and its append-only receipt. Preview reads are snapshot-only.
 */
const IMPACT_TABLES = [
  'public.authoring_citations', 'public.authoring_documents', 'public.authoring_sections',
  'public.c2c_document_sections', 'public.c2c_documents', 'public.canonical_documents', 'public.cmc_source_evidence', 'public.concept2cure_artifacts',
  'public.cre_evidence_sources', 'public.document_span_lineage', 'public.file_uploads',
  'public.governed_dependencies', 'public.lumen_data_atoms', 'public.projects', 'public.rag_chunks', 'public.rag_documents',
  'vault.document_catalog', 'vault.document_chunks', 'vault.documents', 'vault.evidence_citations', 'vault.legal_holds',
] as const;
function assertInput(input: DispositionPreviewInput): void {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId <= 0 || !UUID.test(input.programId)
      || !Number.isSafeInteger(input.actorId) || input.actorId <= 0) {
    throw new DispositionError(400, 'INVALID_SCOPE', 'A verified organization, project and actor are required.');
  }
  if (!['captured_source', 'vault_document'].includes(input.targetType)
      || (input.targetType === 'captured_source' ? !/^[1-9][0-9]*$/.test(String(input.targetId)) || !Number.isSafeInteger(Number(input.targetId)) : !UUID.test(String(input.targetId)))
      || (input.replacementId !== undefined && (input.targetType === 'captured_source' ? !/^[1-9][0-9]*$/.test(String(input.replacementId)) || !Number.isSafeInteger(Number(input.replacementId)) : !UUID.test(String(input.replacementId))))) {
    throw new DispositionError(400, 'INVALID_TARGET', 'Choose a typed captured source or Vault version identity.');
  }
}
async function persistDisposition(q: DispositionQueryable, input: DispositionApplyInput, state: Snapshot, context: {previewHash: string; createdAt: string; deps: DispositionServiceDependencies}) {
  const {previewHash,createdAt,deps}=context;
  const id = randomUUID();
  const previousDispositionId = state.currentDisposition?.id??null;
  const auditReceipt = await deps.audit(q,{ organizationId:input.organizationId,userId:input.actorId,action:'document_data.disposition',resourceType:'document_data_dispositions',resourceId:id,reason:input.reason.trim(),details:{ programId:input.programId,target:state.target,choice:input.choice,linkedIds:state.linkedIds,replacement:state.replacement,previewHash:previewHash,impact:state.counts,previousDispositionId,dispositionSequence:state.sequence,physicalErasure:false } });
  if (!UUID.test(auditReceipt.id) || !HASH.test(auditReceipt.sha256Chain)) throw new DispositionError(503,'AUDIT_UNAVAILABLE','No valid chained audit receipt was recorded. Nothing was changed.');
  await q.query(`INSERT INTO public.document_data_dispositions (id,organization_id,program_id,captured_source_id,vault_document_id,choice,reason,actor_id,source_sha256,preview_hash,linked_ids,replacement_captured_source_id,replacement_vault_document_id,impact_snapshot,audit_receipt,created_at,previous_disposition_id,disposition_sequence)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18)`,[id,input.organizationId,input.programId,input.targetType==='captured_source'?Number(input.targetId):null,input.targetType==='vault_document'?input.targetId:null,input.choice,input.reason.trim(),input.actorId,state.target.sha256,previewHash,JSON.stringify(state.linkedIds),input.choice==='supersede'&&input.targetType==='captured_source'?Number(input.replacementId):null,input.choice==='supersede'&&input.targetType==='vault_document'?input.replacementId:null,JSON.stringify(state),JSON.stringify(auditReceipt),createdAt,previousDispositionId,state.sequence]);
  const disposition: DocumentDispositionRecord = { id,choice:input.choice,target:state.target,linkedIds:state.linkedIds,replacementId:input.replacementId??null,previousDispositionId,createdAt,auditReceipt };
  const updated = {...state,sequence:state.sequence+1,currentDisposition:{id,choice:input.choice,createdAt,replacementId:input.replacementId??null},blockers:input.choice==='keep_data'?[]:['This source data already has a terminal withdrawal or supersession disposition.']};
  return {disposition,updated};
}
export function createDocumentDispositionService(deps: DispositionServiceDependencies) {
  const now = deps.clock ?? (() => new Date());
  const { token, decode } = createDispositionTokenCodec(deps);
  async function transaction<T>(operation: (q: DispositionQueryable) => Promise<T>, write = false): Promise<T> {
    const q = await deps.db.connect();
    try {
      await q.query(write ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await q.query("SET LOCAL statement_timeout = '30s'");
      const result = await operation(q);
      await q.query('COMMIT');
      return result;
    } catch (err: any) {
      await q.query('ROLLBACK').catch(() => {});
      if (err instanceof DispositionError) throw err;
      if (['40001','40P01','23505'].includes(err?.code)) throw new DispositionError(409, 'STALE_PREVIEW', 'The source changed during confirmation. Open a fresh impact preview.');
      throw new DispositionError(503, 'IMPACT_UNAVAILABLE', 'The complete source impact or audit receipt could not be verified. Nothing was changed.');
    } finally { q.release(); }
  }
  async function scoped(q: DispositionQueryable, input: DispositionPreviewInput, write: boolean) {
    await setTenantContextTx(q, input.organizationId, input.orgRole);
    if (!await programInOrganization(q, input.programId, input.organizationId)) throw new DispositionError(404, 'NOT_FOUND', 'Project or source not found.');
    if (write) {
      const program = await q.query('SELECT lead_user_id FROM regulatory_programs WHERE id = $1 AND organization_id = $2', [input.programId,input.organizationId]);
      if (!canMutateProgram({ actor: { userId: input.actorId, orgRole: input.orgRole }, program: { leadUserId: program.rows[0]?.lead_user_id ?? null } })) {
        throw new DispositionError(403, 'FORBIDDEN', 'Only a project lead or organization manager can withdraw this source.');
      }
    }
  }
  function render(input: DispositionPreviewInput, state: Snapshot, expiresAt = new Date(now().getTime()+10*60_000).toISOString()): DocumentDispositionPreview {
    const visible = {target:state.target,linkedIds:state.linkedIds,counts:state.counts,retention:state.retention,approvals:state.approvals,blockers:state.blockers,replacement:state.replacement,currentDisposition:state.currentDisposition};
    return { ...visible, allowedChoices:state.blockers.length ? [] : state.currentDisposition?.choice==='keep_data'?['remove_data','supersede']:['keep_data','remove_data','supersede'], previewToken:token(input,state,expiresAt),expiresAt };
  }
  return {
    async preview(input: DispositionPreviewInput): Promise<DocumentDispositionPreview> {
      assertInput(input);
      return transaction(async q => { await scoped(q,input,false); return render(input,await readDispositionSnapshot(q,input,deps.enabled())); });
    },
    async apply(input: DispositionApplyInput): Promise<{ disposition: DocumentDispositionRecord; preview: DocumentDispositionPreview }> {
      assertInput(input);
      if (!deps.enabled()) throw new DispositionError(503,'DISPOSITIONS_NOT_ACTIVATED','Document disposition enforcement is awaiting verified activation. Nothing was changed.');
      if (!['keep_data','remove_data','supersede'].includes(input.choice) || typeof input.reason !== 'string' || input.reason.trim().length < DOCUMENT_DISPOSITION_REASON_MIN || input.reason.trim().length > DOCUMENT_DISPOSITION_REASON_MAX
          || (input.choice === 'supersede') !== Boolean(input.replacementId)) throw new DispositionError(400,'INVALID_DECISION','Choose the extracted-data consequence and provide a reason of 10–4000 characters. Superseding requires the named replacement.');
      const decoded = decode(input);
      return transaction(async q => {
        await scoped(q,input,true);
        await q.query("SET LOCAL lock_timeout = '5s'");
        await q.query("SET LOCAL statement_timeout = '30s'");
        await q.query(`SELECT pg_advisory_xact_lock(hashtext('document_data_dispositions'),hashtext($1))`,[`${input.organizationId}:${input.programId}`]);
        // A missing impact store refuses; it is never silently treated as zero.
        await q.query(`LOCK TABLE ${IMPACT_TABLES.join(', ')} IN SHARE MODE`);
        await q.query(`LOCK TABLE public.document_data_dispositions IN SHARE ROW EXCLUSIVE MODE`);
        const state = await readDispositionSnapshot(q,input,deps.enabled());
        if (decoded.hash !== hashSnapshot(state)) throw new DispositionError(409,'STALE_PREVIEW','Source data, references, holds or approvals changed after the preview. Review a fresh preview.');
        if (state.blockers.length) throw new DispositionError(409,'DISPOSITION_BLOCKED',state.blockers.join(' '));
        if (state.currentDisposition && input.choice==='keep_data') throw new DispositionError(409,'INVALID_TRANSITION','Retained data can only be withdrawn or superseded. The original file remains unavailable.');
        const {disposition,updated}=await persistDisposition(q,input,state,{previewHash:decoded.hash,createdAt:now().toISOString(),deps});
        return { disposition,preview:render(input,updated) };
      },true);
    },
  };
}
