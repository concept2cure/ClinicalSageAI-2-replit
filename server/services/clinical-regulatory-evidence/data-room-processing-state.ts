/** Private derived-stage contract. No queue or new record store. */
import {
  DATA_ROOM_PROCESSING_SCHEMA_VERSION, DATA_ROOM_PROCESSING_STAGE, DATA_ROOM_PROCESSOR_REVISION,
  DATA_ROOM_PROCESSING_REASON_CODES, type DataRoomProcessingReasonCode,
} from '../../../shared/data-room-processing-status.js';
import { stableStringify } from '../../../shared/canonical-json.js';

export const CAPTURE_EXTRACTION_REVISION = 'capture-extraction:v1' as const;
export const PROCESSING_LEASE_MS = 15 * 60_000;
export const PROCESSING_MAX_AUTOMATIC_ATTEMPTS = 3;
export type SourceProcessingStatus = 'completed' | 'already_complete' | 'extraction_failed' |
  'retryable_failure' | 'blocked' | 'stale_source' | 'busy' | 'retry_not_due' | 'retry_exhausted';
export interface ProcessingQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}
export interface ProcessingClient extends ProcessingQueryable { release(error?: Error): void; }
export interface ProcessingDatabase extends ProcessingQueryable { connect(): Promise<ProcessingClient>; }
export interface ProcessingIdentity {
  organizationId: number; sourceId: number; sha256: string; fileUploadId: string;
  storageRef: string; programId: string | null; workspaceId: number | null;
  uploadSha256: string; uploadStoragePath: string; sizeBytes: number;
  fileName: string; mimeType: string; lineage: Record<string, unknown>;
  sourceTitle: string | null; uploadFileName: string | null; sourceMimeType: string | null;
}
export interface ProcessingStage {
  version: 1; stage: 'derived_capture'; processorRevision: 'data-room-processing:v1';
  identity: ProcessingIdentity; state: 'running' | 'completed' | 'failed' | 'blocked';
  attemptId: string; attempts: number; claimedAt: string; leaseExpiresAt: string | null;
  nextRetryAt: string | null; completedAt: string | null; retryable: boolean;
  reasonCode: DataRoomProcessingReasonCode | null;
}
export interface ProcessingClaim { identity: ProcessingIdentity; stage: ProcessingStage; }
export class ProcessingRefusal extends Error {
  constructor(public status: SourceProcessingStatus, public reasonCode: DataRoomProcessingReasonCode) {
    super(reasonCode); this.name = 'ProcessingRefusal';
  }
}
export const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 2_147_483_647;
export const readableText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** One SQL predicate matching ECMAScript trim for catalog reads and recovery. */
export function persistedTextAvailableSql(alias?:string):string {
  if(alias!==undefined&&!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  const column=alias?`${alias}.extracted_text`:'extracted_text';
  return String.raw`COALESCE(length(btrim(${column}, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0, false)`;
}
export function validTimestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)) return false;
  const t = Date.parse(v); return Number.isFinite(t) && new Date(t).toISOString() === v;
}
const nullableTime = (v: unknown) => v === null || validTimestamp(v);
export function validIdentity(v: unknown): v is ProcessingIdentity {
  if(!object(v)) return false;
  return [positiveId(v.organizationId),positiveId(v.sourceId),validOriginalIdentity(v),validIdentityScope(v),validIdentityBehavior(v)].every(Boolean);
}
function validOriginalIdentity(v:Record<string,any>):boolean {
  return [typeof v.sha256==='string'&&HASH.test(v.sha256),typeof v.uploadSha256==='string'&&HASH.test(v.uploadSha256),
    typeof v.fileUploadId==='string'&&v.fileUploadId.length>0,typeof v.storageRef==='string',typeof v.uploadStoragePath==='string',
    Number.isSafeInteger(v.sizeBytes)&&v.sizeBytes>=0].every(Boolean);
}
function validIdentityScope(v:Record<string,any>):boolean {
  return (v.programId===null||(typeof v.programId==='string'&&UUID.test(v.programId)))&&(v.workspaceId===null||positiveId(v.workspaceId));
}
function validIdentityBehavior(v:Record<string,any>):boolean {
  return [typeof v.fileName==='string',typeof v.mimeType==='string',object(v.lineage),
    [v.sourceTitle,v.uploadFileName,v.sourceMimeType].every(x=>x===null||typeof x==='string')].every(Boolean);
}
function stageEnvelope(s:Record<string,any>):boolean {
  return [s.version===DATA_ROOM_PROCESSING_SCHEMA_VERSION,s.stage===DATA_ROOM_PROCESSING_STAGE,s.processorRevision===DATA_ROOM_PROCESSOR_REVISION,
    validIdentity(s.identity),typeof s.attemptId==='string'&&UUID.test(s.attemptId),Number.isSafeInteger(s.attempts)&&s.attempts>0,
    validTimestamp(s.claimedAt),[s.leaseExpiresAt,s.nextRetryAt,s.completedAt].every(nullableTime),typeof s.retryable==='boolean',
    s.reasonCode===null||DATA_ROOM_PROCESSING_REASON_CODES.includes(s.reasonCode)].every(Boolean);
}
function runningStage(s:Record<string,any>):boolean {
  return [validTimestamp(s.leaseExpiresAt),s.completedAt===null,s.nextRetryAt===null,!s.retryable,s.reasonCode===null,
    Date.parse(s.leaseExpiresAt)>Date.parse(s.claimedAt),Date.parse(s.leaseExpiresAt)-Date.parse(s.claimedAt)<=PROCESSING_LEASE_MS].every(Boolean);
}
function completedStage(s:Record<string,any>):boolean {
  return [s.leaseExpiresAt===null,validTimestamp(s.completedAt),Date.parse(s.completedAt)>=Date.parse(s.claimedAt),
    !s.retryable,s.reasonCode===null,s.nextRetryAt===null].every(Boolean);
}
function terminalStage(s:Record<string,any>):boolean {
  if(s.leaseExpiresAt!==null||s.completedAt!==null||s.reasonCode===null) return false;
  if(s.state==='blocked') return !s.retryable&&s.nextRetryAt===null;
  if(s.state==='failed') return s.retryable?validTimestamp(s.nextRetryAt):s.nextRetryAt===null;
  return false;
}
function coherentStage(s:Record<string,any>):boolean {
  if(s.state==='running') return runningStage(s);
  if(s.state==='completed') return completedStage(s);
  return terminalStage(s);
}
/** Absent legacy stage is distinct from any malformed/future stage. */
export function parseProcessingStage(metadata: unknown): ProcessingStage | null {
  if (metadata == null) return null;
  if (!object(metadata)) throw new ProcessingRefusal('blocked', 'STAGE_METADATA_INVALID');
  if (!Object.hasOwn(metadata, 'dataRoomProcessing')) return null;
  const s = metadata.dataRoomProcessing;
  const valid = object(s)&&stageEnvelope(s)&&coherentStage(s);
  if (!valid) throw new ProcessingRefusal('blocked', 'STAGE_METADATA_INVALID');
  return s as ProcessingStage;
}
export const sameIdentity = (a: ProcessingIdentity, b: ProcessingIdentity) => stableStringify(a) === stableStringify(b);
export function processingDisposition(row: any, identity: ProcessingIdentity, now: Date, retryFailed = false): SourceProcessingStatus | null {
  const s = parseProcessingStage(row.metadata);
  if (s && !sameIdentity(s.identity, identity)) throw new ProcessingRefusal('blocked','SOURCE_IDENTITY_CHANGED');
  if (s?.state === 'running' && Date.parse(s.leaseExpiresAt!) > now.getTime()) return 'busy';
  if (readableCompletion(row,s)) return 'already_complete';
  if (retryFailed) return null; // A live running lease was already refused above.
  return retryDisposition(s,row.extraction_status,now);
}
function readableCompletion(row:any,s:ProcessingStage|null):boolean {
  return readableText(row.extracted_text)&&['extracted','reconciled','verified'].includes(row.extraction_status)&&(!s||s.state==='completed');
}
function retryDisposition(s:ProcessingStage|null,extractionStatus:string,now:Date):SourceProcessingStatus|null {
  if (s?.state === 'blocked') return 'blocked';
  if (s?.state === 'failed' && !s.retryable) return 'extraction_failed';
  if ((s?.attempts ?? 0) >= PROCESSING_MAX_AUTOMATIC_ATTEMPTS) return 'retry_exhausted';
  if (s?.nextRetryAt && Date.parse(s.nextRetryAt) > now.getTime()) return 'retry_not_due';
  if (!s && extractionStatus === 'failed') return 'extraction_failed';
  return null;
}
export function statusReason(status: SourceProcessingStatus, stage?: ProcessingStage | null): DataRoomProcessingReasonCode | undefined {
  if (status === 'blocked') return stage?.reasonCode ?? 'ORIGINAL_IDENTITY_INVALID';
  const reasons:Partial<Record<SourceProcessingStatus,DataRoomProcessingReasonCode>>={busy:'ATTEMPT_BUSY',retry_not_due:'RETRY_NOT_DUE',retry_exhausted:'RETRY_EXHAUSTED',extraction_failed:'EXTRACTION_FAILED'};
  return reasons[status];
}
