/** Read-only candidate selection and bounded diagnostics; the processor owns writes. */
import { capturedDataEligibleSql, capturedBinaryAvailableSql, uploadedBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { DATA_ROOM_PROCESSING_REASON_CODES } from '../../../shared/data-room-processing-status.js';
import {
  positiveId, object, parseProcessingStage, processingDisposition, ProcessingRefusal, statusReason, persistedTextAvailableSql,
  type ProcessingQueryable, type ProcessingDatabase, type SourceProcessingStatus,
} from './data-room-processing-state.js';
import type { SourceProcessingResult } from './data-room-processing.js';
import { listProgramAnchorCandidates } from '../c2c/program-project-anchor.js';

export interface PendingSweepOptions {
  apply?:boolean; limit?:number; sourceId?:number; retryFailed?:boolean;
  db?:ProcessingDatabase; exec?:ProcessingQueryable;
}
export interface PendingSweepReport {
  examined:number; processed:number; unreadable:Array<{sourceId:number;reason:string}>; dryRun:boolean;
  completed:number; failed:number; blocked:number; skipped:number;
  items:Array<{sourceId:number;status:SourceProcessingStatus|'candidate';reasonCode?:string}>;
  diagnosticCounts:{blocked:number;busy:number;retry_not_due:number;retry_exhausted:number;extraction_failed:number;stale_source:number};
  limit:number; diagnosticLimit:number; diagnosticsCapped:boolean;
}
export function validateSweepOptions(org:number,opts:PendingSweepOptions):void {
  if(!positiveId(org)||!object(opts)) throw new Error('INVALID_SCOPE');
  if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>500)) throw new Error('INVALID_LIMIT');
  if(opts.sourceId!==undefined&&!positiveId(opts.sourceId)) throw new Error('INVALID_SOURCE');
  validateSweepSeams(opts);
}
function validateSweepSeams(opts:PendingSweepOptions):void {
  if((opts.apply!==undefined&&typeof opts.apply!=='boolean')||(opts.retryFailed!==undefined&&typeof opts.retryFailed!=='boolean')) throw new Error('INVALID_OPTIONS');
  if(opts.db&&(!object(opts.db)||typeof opts.db.query!=='function'||typeof opts.db.connect!=='function')) throw new Error('INVALID_DATABASE');
  if(opts.exec&&(!object(opts.exec)||typeof opts.exec.query!=='function'||opts.apply===true)) throw new Error('DRY_RUN_EXECUTOR_ONLY');
}
const S=`s.metadata->'dataRoomProcessing'`;
const text=(field:string)=>`${S}->>'${field}'`;
const value=(field:string)=>`${S}->'${field}'`;
const healthy=`${persistedTextAvailableSql('s')} AND s.extraction_status IN ('extracted','reconciled','verified')`;
/** Invalid timestamps never enter a PostgreSQL cast, even from future/hostile metadata. */
function time(field:string):string {
  const t=text(field);
  return `(CASE WHEN ${t} ~ '^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d[.]\\d{3}Z$'
    AND pg_input_is_valid(${t},'timestamp with time zone') THEN
      CASE WHEN to_char((${t})::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=${t}
        THEN (${t})::timestamptz END END)`;
}
function expectedIdentitySql():string {
  return `jsonb_build_object('organizationId',s.organization_id,'sourceId',s.id,'sha256',s.checksum,
    'fileUploadId',s.provenance->>'fileUploadId','storageRef',s.stored_artifact_ref,'programId',s.client_program_id,
    'workspaceId',s.client_workspace_id,'uploadSha256',f.checksum_sha256,'uploadStoragePath',f.storage_path,'sizeBytes',f.file_size,
    'fileName',COALESCE(f.original_name,s.title,''),'mimeType',COALESCE(f.mime_type,'application/octet-stream'),
    'sourceTitle',s.title,'uploadFileName',f.original_name,
    'sourceMimeType',CASE WHEN jsonb_typeof(s.metadata->'mimeType')='string' THEN s.metadata->>'mimeType' END,
    'lineage',COALESCE((SELECT jsonb_object_agg(k,v) FROM jsonb_each(CASE WHEN jsonb_typeof(s.provenance)='object' THEN s.provenance ELSE '{}'::jsonb END) e(k,v)
      WHERE k IN ('origin','derivedFromFileId','derivedFromSha256','parentSourceIds')),'{}'::jsonb))`;
}
function validStageSql():string {
  const reason=DATA_ROOM_PROCESSING_REASON_CODES.map(c=>`'${c}'`).join(',');
  return `jsonb_typeof(${S})='object' AND ${value('version')}='1'::jsonb AND ${text('stage')}='derived_capture'
    AND ${text('processorRevision')}='data-room-processing:v1' AND ${value('identity')}=${expectedIdentitySql()}
    AND jsonb_typeof(${value('attemptId')})='string' AND ${text('attemptId')} ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    AND jsonb_typeof(${value('attempts')})='number' AND ${text('attempts')} ~ '^[1-9][0-9]*$' AND ${value('attempts')}<='9007199254740991'::jsonb
    AND ${time('claimedAt')} IS NOT NULL AND jsonb_typeof(${value('retryable')})='boolean'
    AND (${value('reasonCode')}='null'::jsonb OR ${text('reasonCode')} IN (${reason}))
    AND CASE ${text('state')}
      WHEN 'running' THEN ${time('leaseExpiresAt')}>${time('claimedAt')} AND ${time('leaseExpiresAt')}<=${time('claimedAt')}+interval '15 minutes'
        AND ${value('completedAt')}='null'::jsonb AND ${value('nextRetryAt')}='null'::jsonb AND ${value('retryable')}='false'::jsonb AND ${value('reasonCode')}='null'::jsonb
      WHEN 'completed' THEN ${value('leaseExpiresAt')}='null'::jsonb AND ${time('completedAt')}>=${time('claimedAt')}
        AND ${value('nextRetryAt')}='null'::jsonb AND ${value('retryable')}='false'::jsonb AND ${value('reasonCode')}='null'::jsonb
      WHEN 'blocked' THEN ${value('leaseExpiresAt')}='null'::jsonb AND ${value('completedAt')}='null'::jsonb
        AND ${value('nextRetryAt')}='null'::jsonb AND ${value('retryable')}='false'::jsonb AND ${value('reasonCode')}<>'null'::jsonb
      WHEN 'failed' THEN ${value('leaseExpiresAt')}='null'::jsonb AND ${value('completedAt')}='null'::jsonb AND ${value('reasonCode')}<>'null'::jsonb
        AND CASE WHEN ${value('retryable')}='true'::jsonb THEN ${time('nextRetryAt')} IS NOT NULL ELSE ${value('nextRetryAt')}='null'::jsonb END
      ELSE FALSE END`;
}
function originalAdmissionSql():string {
  return `f.id IS NOT NULL AND s.checksum ~ '^[a-f0-9]{64}$' AND f.checksum_sha256=s.checksum
    AND s.stored_artifact_ref=f.storage_path AND f.storage_path LIKE 'uploads/org-'||s.organization_id::text||'/%'
    AND f.storage_path !~ '(^|/)[.]{1,2}(/|$)|//|/$' AND f.file_size BETWEEN 0 AND 9007199254740991
    AND ${capturedDataEligibleSql('s')} AND ${capturedBinaryAvailableSql('s')} AND ${uploadedBinaryAvailableSql('f')}
    AND (s.client_program_id IS NULL OR EXISTS(SELECT 1 FROM regulatory_programs p WHERE p.id=s.client_program_id AND p.organization_id=s.organization_id AND p.deleted_at IS NULL))
    AND (s.client_workspace_id IS NULL OR CASE WHEN s.client_program_id IS NOT NULL THEN
      EXISTS(SELECT 1 FROM jsonb_to_recordset($3::jsonb) processing_anchor(program_id uuid,workspace_id integer)
        WHERE processing_anchor.program_id=s.client_program_id AND processing_anchor.workspace_id=s.client_workspace_id)
      ELSE EXISTS(SELECT 1 FROM projects p WHERE p.id=s.client_workspace_id AND p.organization_id=s.organization_id) END)
    AND (s.client_program_id IS NOT NULL OR s.client_workspace_id IS NOT NULL)`;
}
function runnableSql(retry:boolean):string {
  const budget=retry?'TRUE':`${value('attempts')}<'3'::jsonb`;
  return `(${originalAdmissionSql()}) AND (
    ((s.metadata IS NULL OR jsonb_typeof(s.metadata)='object') AND ${S} IS NULL
      AND (s.extraction_status='pending' OR (s.extraction_status='extracted' AND NOT(${healthy}))${retry?" OR s.extraction_status='failed'":''}))
    OR ((${validStageSql()}) AND CASE ${text('state')}
      WHEN 'running' THEN ${time('leaseExpiresAt')}<=clock_timestamp() AND ${budget}
      WHEN 'failed' THEN ${retry?'TRUE':`${value('retryable')}='true'::jsonb AND ${time('nextRetryAt')}<=clock_timestamp() AND ${budget}`}
      WHEN 'blocked' THEN ${retry?'TRUE':'FALSE'}
      WHEN 'completed' THEN NOT(${healthy}) AND ${budget} ELSE FALSE END))`;
}
function reportFor(limit:number):PendingSweepReport {
  return {examined:0,processed:0,unreadable:[],dryRun:true,completed:0,failed:0,blocked:0,skipped:0,items:[],
    diagnosticCounts:{blocked:0,busy:0,retry_not_due:0,retry_exhausted:0,extraction_failed:0,stale_source:0},
    limit,diagnosticLimit:Math.min(limit,50),diagnosticsCapped:false};
}
function record(report:PendingSweepReport,id:number,status:SourceProcessingStatus|'candidate',reasonCode?:string,diagnostic=false) {
  report.items.push({sourceId:id,status,...(reasonCode?{reasonCode}:{})});
  if(status==='completed'||status==='already_complete') {if(!report.dryRun&&!diagnostic){report.completed++;report.processed++;}return;}
  if(status==='candidate') return;
  if(status==='blocked') report.blocked++;
  else if(status==='extraction_failed'||status==='retryable_failure') report.failed++;
  else report.skipped++;
  report.unreadable.push({sourceId:id,reason:reasonCode??status});
  if(diagnostic&&status in report.diagnosticCounts) report.diagnosticCounts[status as keyof PendingSweepReport['diagnosticCounts']]++;
}
function diagnostic(row:any):{status:SourceProcessingStatus;reasonCode?:string} {
  if(row.deleted_at||row.is_current===false) return {status:'stale_source',reasonCode:'SOURCE_SUPERSEDED'};
  if(!row.original_admitted) return {status:'blocked',reasonCode:'ORIGINAL_IDENTITY_INVALID'};
  try {
    const s=parseProcessingStage(row.metadata);
    const status=processingDisposition(row,row.expected_identity,new Date(row.observed_at),false)??'blocked';
    return {status,reasonCode:statusReason(status,s)??'STAGE_METADATA_INVALID'};
  } catch(err) {return {status:'blocked',reasonCode:err instanceof ProcessingRefusal?err.reasonCode:'STAGE_METADATA_INVALID'};}
}
/** Candidate preselection only. The processor rechecks and holds the actual
 * canonical relationship before claiming or committing derived data. */
async function programWorkspaceFrame(q: ProcessingQueryable, org: number): Promise<Array<{program_id: string; workspace_id: number}>> {
  const candidates = await listProgramAnchorCandidates(q, { orgId: org, eligibility: 'non-deleted' });
  const grouped = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const group = grouped.get(candidate.programId) ?? [];
    group.push(candidate); grouped.set(candidate.programId, group);
  }
  const frame: Array<{program_id: string; workspace_id: number}> = [];
  for (const [programId, group] of grouped) {
    const anchor = group.length === 1 ? group[0].anchor : null;
    if (anchor?.clientWorkspaceId != null) frame.push({ program_id: programId, workspace_id: anchor.clientWorkspaceId });
  }
  return frame;
}
export async function runProcessingSweep(org:number,opts:PendingSweepOptions,defaultDb:ProcessingDatabase,process:(row:any)=>Promise<SourceProcessingResult>):Promise<PendingSweepReport> {
  validateSweepOptions(org,opts);
  const q=opts.exec??opts.db??defaultDb;
  const sourceId = opts.sourceId;
  const report=reportFor(opts.limit??50); report.dryRun=opts.apply!==true;
  const run=runnableSql(opts.retryFailed===true);
  const ordinary=`s.deleted_at IS NULL AND s.is_current IS NOT FALSE`;
  const join=`FROM cre_evidence_sources s LEFT JOIN file_uploads f ON f.id=s.provenance->>'fileUploadId' AND f.organization_id=s.organization_id`;
  const base=`s.organization_id=$1 AND s.source_type='client_document'`;
  const select=`SELECT s.*,clock_timestamp() AS observed_at,${expectedIdentitySql()} AS expected_identity,(${originalAdmissionSql()}) IS TRUE AS original_admitted`;
  const sql=sourceId!==undefined?`${select},(${run}) IS TRUE AS runnable ${join} WHERE ${base} AND s.id=$2`
    :`${select},TRUE AS runnable ${join} WHERE ${base} AND ${ordinary} AND (${run}) ORDER BY s.created_at,s.id LIMIT $2`;
  const frame = JSON.stringify(await programWorkspaceFrame(q, org));
  const found=await q.query(sql,[org,sourceId??report.limit,frame]);
  if(sourceId!==undefined&&!found.rows[0]) record(report,sourceId,'blocked','SOURCE_NOT_FOUND',true);
  for(const row of found.rows) {
    if(!row.runnable||row.deleted_at||row.is_current===false) {const d=diagnostic(row);record(report,Number(row.id),d.status,d.reasonCode,true);continue;}
    report.examined++;
    if(report.dryRun) record(report,Number(row.id),'candidate');
    else {const done=await process(row);record(report,Number(row.id),done.status,done.reasonCode);}
  }
  if(sourceId===undefined) {
    const omitted=await q.query(`${select} ${join} WHERE ${base} AND ${ordinary} AND NOT COALESCE((${run}),FALSE)
      AND NOT ((${healthy}) AND (${S} IS NULL OR (${validStageSql()} AND ${text('state')}='completed')))
      AND NOT(s.id=ANY($4::integer[])) ORDER BY s.created_at,s.id LIMIT $2`,[org,report.diagnosticLimit+1,frame,found.rows.map(r=>Number(r.id))]);
    report.diagnosticsCapped=omitted.rows.length>report.diagnosticLimit;
    for(const row of omitted.rows.slice(0,report.diagnosticLimit)) {const d=diagnostic(row);record(report,Number(row.id),d.status,d.reasonCode,true);}
  }
  return report;
}
