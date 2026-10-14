/** Short, fenced transactions over the existing capture row. */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  DATA_ROOM_PROCESSING_SCHEMA_VERSION, DATA_ROOM_PROCESSING_STAGE, DATA_ROOM_PROCESSOR_REVISION,
  type DataRoomProcessingReasonCode,
} from '../../../shared/data-room-processing-status.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock.js';
import { capturedDataEligibleSql, capturedBinaryAvailableSql, uploadedBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import {
  HASH, object, parseProcessingStage, processingDisposition, sameIdentity, statusReason,
  PROCESSING_LEASE_MS, ProcessingRefusal,
  type ProcessingDatabase, type ProcessingClient, type ProcessingIdentity, type ProcessingClaim,
  type ProcessingStage, type SourceProcessingStatus,
} from './data-room-processing-state.js';

export interface ProcessingDecision { status: SourceProcessingStatus; reasonCode?: DataRoomProcessingReasonCode; }
export interface ProcessingScope { programId?: string | null; expectedWorkspaceId?: number | null; suppliedSha256?: string; }
interface Admission { row: any; identity: ProcessingIdentity; now: Date; }
export interface ProcessingAuthorization {
  client: ProcessingClient; claim: ProcessingClaim; stage: ProcessingStage; row: any;
}
const authorized = new WeakSet<object>();
export function isProcessingAuthorization(a: ProcessingAuthorization | undefined, q: unknown, org: number, source: number): a is ProcessingAuthorization {
  return !!a && authorized.has(a) && a.client === q && a.claim.identity.organizationId === org && a.claim.identity.sourceId === source;
}
export async function processingTransaction<T>(db: ProcessingDatabase, fn: (q: ProcessingClient) => Promise<T>): Promise<T> {
  const q = await db.connect();
  let poisoned:Error|undefined;
  try {
    await q.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await q.query("SET LOCAL lock_timeout = '5s'");
    await q.query("SET LOCAL statement_timeout = '30s'");
    const result = await fn(q);
    await q.query('COMMIT');
    return result;
  } catch (err) {
    await q.query('ROLLBACK').catch(rollbackError => {poisoned=rollbackError instanceof Error?rollbackError:new Error('ROLLBACK_FAILED');});
    throw err;
  } finally { q.release(poisoned); }
}
function size(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
/** Relevant recorded edges only, never a new edge inferred from equal bytes. */
function lineage(provenance: unknown): Record<string, unknown> {
  const p = object(provenance) ? provenance : {};
  return Object.fromEntries(['origin','derivedFromFileId','derivedFromSha256','parentSourceIds'].filter(k => Object.hasOwn(p,k)).map(k => [k,p[k]]));
}
function boundOriginalPath(row:any,upload:any):boolean {
  const prefix = `uploads/org-${row.organization_id}/`;
  if(typeof row.stored_artifact_ref!=='string'||typeof upload.storage_path!=='string') return false;
  return [row.stored_artifact_ref===upload.storage_path,upload.storage_path.startsWith(prefix),
    path.posix.normalize(upload.storage_path)===upload.storage_path,!/(^|\/)\.{1,2}(\/|$)/.test(upload.storage_path),!upload.storage_path.endsWith('/')].every(Boolean);
}
function identityFrom(row: any, upload: any): ProcessingIdentity {
  const fileUploadId = row.provenance?.fileUploadId;
  const sizeBytes = size(upload.file_size);
  const valid=[HASH.test(row.checksum??''),HASH.test(upload.checksum_sha256??''),row.checksum===upload.checksum_sha256,
    typeof fileUploadId==='string'&&fileUploadId.length>0,boundOriginalPath(row,upload),sizeBytes!==null].every(Boolean);
  if(!valid) throw new ProcessingRefusal('blocked','ORIGINAL_IDENTITY_INVALID');
  return {
    organizationId:Number(row.organization_id), sourceId:Number(row.id), sha256:row.checksum, fileUploadId,
    storageRef:row.stored_artifact_ref, programId:row.client_program_id ?? null, workspaceId:row.client_workspace_id ?? null,
    uploadSha256:upload.checksum_sha256, uploadStoragePath:upload.storage_path, sizeBytes:sizeBytes!,
    fileName:upload.original_name ?? row.title ?? '', mimeType:upload.mime_type ?? 'application/octet-stream', lineage:lineage(row.provenance),
    sourceTitle:row.title??null,uploadFileName:upload.original_name??null,
    sourceMimeType:typeof row.metadata?.mimeType==='string'?row.metadata.mimeType:null,
  };
}
function refuseSource(final:boolean,code:DataRoomProcessingReasonCode):never {
  throw new ProcessingRefusal(final?'stale_source':'blocked',code);
}
/** Reservations precede admission, including organization-wide withdrawal from another project. */
async function reserveScope(q:ProcessingClient,org:number,id:number,final:boolean):Promise<{programId:string|null;workspaceId:number|null}> {
  const found = await q.query('SELECT client_program_id,client_workspace_id FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2 AND source_type=\'client_document\'', [id,org]);
  if (!found.rows[0]) return refuseSource(final,'SOURCE_NOT_FOUND');
  const programId = found.rows[0].client_program_id;
  if (programId) await lockDocumentDispositionProgram(q,org,programId);
  await q.query('LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE');
  if(programId) {
    const p=await q.query('SELECT id FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR SHARE',[programId,org]);
    if(!p.rows[0]) return refuseSource(final,'PROJECT_UNAVAILABLE');
  }
  const workspaceId=found.rows[0].client_workspace_id;
  if(workspaceId!==null && workspaceId!==undefined) {
    const p=await q.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2 FOR SHARE',[workspaceId,org]);
    if(!p.rows[0]) return refuseSource(final,'PROJECT_UNAVAILABLE');
  }
  if(!programId&&!workspaceId) return refuseSource(final,'PROJECT_UNAVAILABLE');
  return {programId:programId??null,workspaceId:workspaceId??null};
}
function requestedScopeMatches(row:any,scope:ProcessingScope):boolean {
  return (scope.programId===undefined||(scope.programId?.toLowerCase()??null)===(row.client_program_id??null))
    && (scope.expectedWorkspaceId===undefined||scope.expectedWorkspaceId===(row.client_workspace_id??null));
}
async function admittedSource(q:ProcessingClient,org:number,id:number,scope:ProcessingScope,final:boolean):Promise<any> {
  const {programId,workspaceId}=await reserveScope(q,org,id,final);
  const r = await q.query(`SELECT s.*, ${capturedDataEligibleSql('s')} AS processing_data_eligible,
      ${capturedBinaryAvailableSql('s')} AS processing_binary_eligible
    FROM cre_evidence_sources s WHERE s.id=$1 AND s.organization_id=$2 AND s.source_type='client_document' FOR UPDATE OF s`,[id,org]);
  const row = r.rows[0];
  if (!row || row.deleted_at != null) return refuseSource(final,'SOURCE_NOT_FOUND');
  if (row.is_current === false) throw new ProcessingRefusal('stale_source','SOURCE_SUPERSEDED');
  if((row.client_program_id??null)!==programId||(row.client_workspace_id??null)!==workspaceId) return refuseSource(final,'SOURCE_SCOPE_CHANGED');
  if(!requestedScopeMatches(row,scope)) return refuseSource(final,'SOURCE_SCOPE_CHANGED');
  if (!row.processing_data_eligible || !row.processing_binary_eligible) return refuseSource(final,'SOURCE_WITHDRAWN');
  return row;
}
async function admittedUpload(q:ProcessingClient,org:number,row:any,final:boolean):Promise<any> {
  if (typeof row.provenance?.fileUploadId !== 'string' || !row.provenance.fileUploadId) return refuseSource(final,'ORIGINAL_IDENTITY_INVALID');
  const u = await q.query(`SELECT f.*,${uploadedBinaryAvailableSql('f')} AS processing_binary_eligible
    FROM file_uploads f WHERE f.id=$1 AND f.organization_id=$2 FOR SHARE OF f`,[row.provenance.fileUploadId,org]);
  if (!u.rows[0]) return refuseSource(final,'ORIGINAL_UPLOAD_UNAVAILABLE');
  if (!u.rows[0].processing_binary_eligible) return refuseSource(final,'SOURCE_WITHDRAWN');
  return u.rows[0];
}
async function admit(q: ProcessingClient, org: number, id: number, scope: ProcessingScope, final: boolean): Promise<Admission> {
  const row=await admittedSource(q,org,id,scope,final);
  const upload=await admittedUpload(q,org,row,final);
  let identity: ProcessingIdentity;
  try { identity = identityFrom(row,upload); }
  catch (err) { if (final) return refuseSource(final,'SOURCE_IDENTITY_CHANGED'); throw err; }
  if (scope.suppliedSha256 && scope.suppliedSha256 !== identity.sha256) return refuseSource(final,'SOURCE_BYTES_MISMATCH');
  const clock = await q.query('SELECT clock_timestamp() AS now');
  return {row,identity,now:new Date(clock.rows[0].now)};
}
export async function claimSource(db: ProcessingDatabase, org: number, id: number, scope: ProcessingScope, retryFailed = false): Promise<{claim:ProcessingClaim;row:any} | ProcessingDecision> {
  return processingTransaction(db,async q => {
    const admitted = await admit(q,org,id,scope,false);
    const prior = parseProcessingStage(admitted.row.metadata);
    const disposition = processingDisposition(admitted.row,admitted.identity,admitted.now,retryFailed);
    if (disposition) return {status:disposition,reasonCode:statusReason(disposition,prior)};
    const attempts=(prior?.attempts ?? 0)+1;
    if (!Number.isSafeInteger(attempts)) throw new ProcessingRefusal('retry_exhausted','RETRY_EXHAUSTED');
    const stage:ProcessingStage={version:DATA_ROOM_PROCESSING_SCHEMA_VERSION,stage:DATA_ROOM_PROCESSING_STAGE,
      processorRevision:DATA_ROOM_PROCESSOR_REVISION,identity:admitted.identity,state:'running',attemptId:randomUUID(),attempts,
      claimedAt:admitted.now.toISOString(),leaseExpiresAt:new Date(admitted.now.getTime()+PROCESSING_LEASE_MS).toISOString(),
      nextRetryAt:null,completedAt:null,retryable:false,reasonCode:null};
    const changed=await q.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{dataRoomProcessing}',$3::jsonb),
      extraction_status='pending',updated_at=clock_timestamp()
      WHERE id=$1 AND organization_id=$2 AND source_type='client_document' AND deleted_at IS NULL AND is_current IS NOT FALSE
        AND metadata->'dataRoomProcessing' IS NOT DISTINCT FROM $4::jsonb AND checksum=$5
        AND client_program_id IS NOT DISTINCT FROM $6::uuid AND client_workspace_id IS NOT DISTINCT FROM $7::int
        AND stored_artifact_ref IS NOT DISTINCT FROM $8 AND provenance->>'fileUploadId'=$9`,
    [id,org,JSON.stringify(stage),prior ? JSON.stringify(prior) : null,admitted.identity.sha256,admitted.identity.programId,
      admitted.identity.workspaceId,admitted.identity.storageRef,admitted.identity.fileUploadId]);
    if (changed.rowCount !== 1) throw new ProcessingRefusal('stale_source','ATTEMPT_STALE');
    return {claim:{identity:admitted.identity,stage},row:admitted.row};
  });
}
export async function finishClaim(
  db:ProcessingDatabase, claim:ProcessingClaim, outcome:{state:'completed'|'failed'|'blocked';reasonCode:DataRoomProcessingReasonCode|null;retryable:boolean},
  write?: (auth:ProcessingAuthorization) => Promise<boolean>,
):Promise<void> {
  await processingTransaction(db,async q => {
    const {identity}=claim;
    const admitted=await admit(q,identity.organizationId,identity.sourceId,{},true);
    if (!sameIdentity(identity,admitted.identity)) throw new ProcessingRefusal('stale_source','SOURCE_IDENTITY_CHANGED');
    const current=parseProcessingStage(admitted.row.metadata);
    if (!current || current.state!=='running' || current.attemptId!==claim.stage.attemptId) throw new ProcessingRefusal('stale_source','ATTEMPT_STALE');
    if (!sameIdentity(current.identity,identity)) throw new ProcessingRefusal('stale_source','SOURCE_IDENTITY_CHANGED');
    if (Date.parse(current.leaseExpiresAt!)<=admitted.now.getTime()) throw new ProcessingRefusal('stale_source','LEASE_EXPIRED');
    const stage:ProcessingStage={...current,state:outcome.state,retryable:outcome.retryable,reasonCode:outcome.reasonCode,
      leaseExpiresAt:null,completedAt:outcome.state==='completed'?admitted.now.toISOString():null,
      nextRetryAt:outcome.retryable?new Date(admitted.now.getTime()+(current.attempts===1?60_000:300_000)).toISOString():null};
    const auth:ProcessingAuthorization={client:q,claim,stage,row:admitted.row};
    authorized.add(auth);
    try {
      if (write) {
        if (!await write(auth)) throw new ProcessingRefusal('stale_source','ATTEMPT_STALE');
      } else {
        const r=await q.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing}',$3::jsonb),updated_at=clock_timestamp()
          WHERE id=$1 AND organization_id=$2 AND is_current IS NOT FALSE AND deleted_at IS NULL
          AND metadata->'dataRoomProcessing'->>'attemptId'=$4
          AND metadata->'dataRoomProcessing'->>'leaseExpiresAt'=$5 AND $5::timestamptz>clock_timestamp()`,
        [identity.sourceId,identity.organizationId,JSON.stringify(stage),claim.stage.attemptId,current.leaseExpiresAt]);
        if (r.rowCount!==1) throw new ProcessingRefusal('stale_source','LEASE_EXPIRED');
      }
    } finally {authorized.delete(auth);}
  });
}
