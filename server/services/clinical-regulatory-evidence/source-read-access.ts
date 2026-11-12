/** Source-row visibility never authorizes a citing document. */
import type { RequestSqlClient } from '../../db/requestDb';
import { getCurrentAccessibleProgramScope, requireCurrentProgramAccess, requireProgramScopeStillCurrent, withinOneProgramAdmission, ProgramReadAccessError, type CurrentAccessibleProgramScope } from '../c2c/current-program-access';
import { createNativeRecordAdmission, NATIVE_RECORD_ORIGIN } from './record-source';
import { AnaProjectScopeError } from '../ana/project-scope-admission';

export class SourceReadAccessError extends Error {
  constructor(readonly status: 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export const visibleSourceOrgSql = (alias: string, parameter: number) =>
  `(${alias}.organization_id=$${parameter} OR (${alias}.organization_id IS NULL AND ${alias}.visibility_class='global_public'))`;
const object = (value: unknown): Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const unresolved = () => new SourceReadAccessError(409,'SOURCE_PARENT_UNRESOLVED','This source needs a verified recorded parent before it can be supplied.');

async function creatorUnbound(q: RequestSqlClient, row: Record<string,unknown>, organizationId: number, userId: number): Promise<boolean> {
  const provenance = object(row.provenance); const fileId = provenance.fileUploadId;
  if (typeof fileId!=='string' || !fileId || row.source_type!=='client_document' || provenance.origin!=='chat_upload') return false;
  const upload = await q.query(`SELECT f.id FROM file_uploads f WHERE f.organization_id=$1 AND f.id=$2 AND f.user_id=$3
    AND NOT EXISTS (SELECT 1 FROM cre_evidence_sources b WHERE b.organization_id=$1
      AND (b.provenance->>'fileUploadId'=f.id OR (f.checksum_sha256 IS NOT NULL AND b.checksum=f.checksum_sha256))
      AND (b.client_program_id IS NOT NULL OR b.client_workspace_id IS NOT NULL))
    AND NOT EXISTS (SELECT 1 FROM concept2cure_artifacts a WHERE a.organization_id=$1 AND a.metadata->>'fileId'=f.id)`,
  [organizationId,fileId,userId]);
  return upload.rows.length===1;
}
async function resolvedLegacyProgram(q: RequestSqlClient, row: Record<string,unknown>, organizationId: number, userId: number): Promise<string> {
  const provenance = object(row.provenance); const metadata = object(row.metadata);
  // The live numeric chat writer records exact artifact and file identities.
  // The artifact parent grants access; coincident numeric workspace/project IDs do not.
  if (provenance.origin!=='chat_upload' || typeof provenance.fileUploadId!=='string' || typeof metadata.artifactId!=='string') throw unresolved();
  const binding = await q.query(`SELECT a.project_id,p.regulatory_program_id::text AS program_id
    FROM concept2cure_artifacts a JOIN projects p ON p.id=a.project_id AND p.organization_id=a.organization_id
    WHERE a.organization_id=$1 AND a.artifact_id=$2 AND a.metadata->>'fileId'=$3 AND p.status<>'deleted'`,
  [organizationId,metadata.artifactId,provenance.fileUploadId]);
  if (binding.rows.length!==1 || typeof binding.rows[0].program_id!=='string' ||
      Number(binding.rows[0].project_id)!==Number(row.client_workspace_id)) throw unresolved();
  const parent = await requireCurrentProgramAccess(q,{organizationId,userId,programId:binding.rows[0].program_id});
  if (parent.projectId!==Number(binding.rows[0].project_id)) throw unresolved();
  return parent.programId;
}
/** Canonical recorded CRE parent admission reused by exact upload/selected-source reads. */
async function admitRecordedSourceParent(q: RequestSqlClient,
  input:{organizationId:number;userId:number},row:Record<string,unknown>):Promise<string | null> {
  let programId:string | null=null;
  if (row.client_program_id!=null) {
    programId=String(row.client_program_id).toLowerCase();
    const parent=await requireCurrentProgramAccess(q,{...input,programId});
    if (row.client_workspace_id!=null && Number(row.client_workspace_id)!==parent.clientWorkspaceId) throw unresolved();
  } else if (row.client_workspace_id!=null) {
    programId=await resolvedLegacyProgram(q,row,input.organizationId,input.userId);
  } else if (!await creatorUnbound(q,row,input.organizationId,input.userId)) throw unresolved();
  const provenance=object(row.provenance);
  if (provenance.origin==='authoring_image_upload') {
    if (!programId) throw unresolved();
    const {admitAuthoringImageDocument}=await import('../authoring/authoring-image-import');
    try {await admitAuthoringImageDocument(q,{...input,documentId:provenance.authoringDocumentId,action:'view',expectedProgramId:programId});}
    catch(error) {
      if (error instanceof AnaProjectScopeError && error.status!==503) {
        if (error.status===400 || error.status===409) throw unresolved();
        throw new SourceReadAccessError(error.status,'SOURCE_ACCESS_DENIED','Source not available with current access.');
      }
      throw error;
    }
  }
  return programId;
}

/** Canonical parent plus native object/freshness admission for exact-source readers. */
export async function admitRecordedCreSourceScope(q: RequestSqlClient,
  input: { organizationId: number; userId: number }, row: Record<string, unknown>): Promise<string | null> {
  // Some exact-source callers deliberately carry identity only. Load the
  // native receipt from its canonical row, never from a caller-made payload.
  if (object(row.provenance).origin === 'native_record_snapshot') {
    const retained = await q.query(`SELECT s.id,s.organization_id,s.visibility_class,s.source_type,s.client_program_id,s.client_workspace_id,
      s.is_current,s.checksum,s.provenance,s.metadata
      FROM cre_evidence_sources s WHERE s.id=$1 AND s.organization_id=$2 AND s.deleted_at IS NULL`, [row.id,input.organizationId]);
    if (retained.rows.length !== 1) throw new SourceReadAccessError(404,'SOURCE_NOT_FOUND','Source not found.');
    row = retained.rows[0];
  }
  const programId = await admitRecordedSourceParent(q, input, row);
  await createNativeRecordAdmission(q, input)(row);
  return programId;
}

function evaluatedSourceOmission(error:unknown):boolean {
  // A current native object admitted by its canonical reader may have
  // changed after capture. That is a stale catalogue, never proof of absence.
  // Denied/missing objects still disappear without disclosing their identity.
  if (error instanceof SourceReadAccessError) return error.status!==503 && error.code!=='NATIVE_SOURCE_CHANGED';
  return error instanceof ProgramReadAccessError && ['PROJECT_PERMISSION_DENIED','PROJECT_NOT_FOUND','PROJECT_ANCHOR_UNRESOLVED'].includes(error.code);
}
async function admitReadableIdentity(q:RequestSqlClient, row:Record<string,unknown>, context: {
  organizationId:number; programs:CurrentAccessibleProgramScope; selected:number[] | undefined; admitNative:ReturnType<typeof createNativeRecordAdmission>;
}):Promise<void> {
  const { organizationId, programs, selected, admitNative } = context;
  if (row.organization_id==null && row.visibility_class==='global_public') return;
  if (!selected && row.client_program_id!=null && !programs.programIds.includes(String(row.client_program_id).toLowerCase())) {
    throw new SourceReadAccessError(403,'SOURCE_ACCESS_DENIED','Source not available with current access.');
  }
  try {await admitRecordedSourceParent(q,{organizationId,userId:programs.actor.userId},row); await admitNative(row);}
  catch(error) {
    if (error instanceof ProgramReadAccessError && error.code==='PROJECT_PERMISSION_DENIED') {
      throw new SourceReadAccessError(403,'SOURCE_ACCESS_DENIED','Source not available with current access.');
    }
    throw error;
  }
}
/** A native source whose current Quality record could not be verified (S12, the coordinating session's ruling of
 *  2026-11-09): reported by id and reason, never admitted, never read to prose. */
export interface UnverifiedSource { id: number; code: string }

/* A native source's admission failed for a reason that is not "denied or missing" (which stays an omission): the
   record could not be verified, or it changed since capture. */
function unverifiableNative(row: Record<string, unknown>, error: unknown): string | null {
  const native = (row.provenance as { origin?: unknown } | null)?.origin === NATIVE_RECORD_ORIGIN;
  if (!native || !(error instanceof SourceReadAccessError)) return null;
  return error.status === 503 || error.code === 'NATIVE_SOURCE_CHANGED' ? error.code : null;
}

/* One evaluated identity. In report mode (a caller-owned transaction; S12) a native identity is admitted under a
   savepoint, so one that cannot be verified is rolled back and reported instead of aborting the caller's whole read. */
async function admitEvaluated(q: RequestSqlClient, row: Record<string, unknown>, admit: () => Promise<void>,
  report: boolean): Promise<UnverifiedSource | null> {
  const guarded = report && (row.provenance as { origin?: unknown } | null)?.origin === NATIVE_RECORD_ORIGIN;
  if (!guarded) { await admit(); return null; }
  await q.query('SAVEPOINT native_source_admission');
  try {
    await admit();
    await q.query('RELEASE SAVEPOINT native_source_admission');
    return null;
  } catch (error) {
    await q.query('ROLLBACK TO SAVEPOINT native_source_admission');
    const code = unverifiableNative(row, error);
    if (code) return { id: Number(row.id), code };
    throw error;
  }
}

export async function getCurrentReadableSourceScope(q: RequestSqlClient, input: {
  organizationId: number; userId: number | undefined; sourceIds?: number[]; programId?: string;
  /** 'report': a native source that cannot be verified is reported in `unverified` instead of failing the read. Only
   *  for an evaluated list (no `sourceIds`), on a caller-owned transaction. Never admits it. */
  unverified?: 'report';
}): Promise<{ scope: 'verified-accessible-sources'; sourceIds: number[]; unverified: UnverifiedSource[] }> {
  try {
    const programs = await getCurrentAccessibleProgramScope(q,input);
    const selected = input.sourceIds;
    const rows = await q.query(`SELECT s.id,s.organization_id,s.visibility_class,s.source_type,s.client_program_id,s.client_workspace_id,s.is_current,s.checksum,
      jsonb_build_object('origin',s.provenance->>'origin','fileUploadId',s.provenance->>'fileUploadId',
        'authoringDocumentId',s.provenance->>'authoringDocumentId','recordSnapshot',s.provenance->'recordSnapshot') AS provenance,
      jsonb_build_object('artifactId',s.metadata->>'artifactId') AS metadata
      FROM cre_evidence_sources s WHERE (s.organization_id=$1 OR (s.organization_id IS NULL AND s.visibility_class='global_public'))
      AND s.deleted_at IS NULL
      AND ($2::int[] IS NULL OR s.id=ANY($2::int[]))
      AND ($3::uuid IS NULL OR s.client_program_id=$3::uuid) ORDER BY s.id`,[input.organizationId,selected ?? null,input.programId ?? null]);
    if (selected && rows.rows.length!==new Set(selected).size) throw new SourceReadAccessError(404,'SOURCE_NOT_FOUND','Source not found.');
    const admitNative = createNativeRecordAdmission(q,{organizationId:input.organizationId,userId:programs.actor.userId});
    const readable: number[] = [];
    const unverified: UnverifiedSource[] = [];
    const report = input.unverified === 'report' && !selected;
    // Each source's project is admitted once for the whole list; the scope is verified again below, outside it.
    await withinOneProgramAdmission(async () => {
      for (const row of rows.rows) {
        try {
          const failed = await admitEvaluated(q, row,
            () => admitReadableIdentity(q,row,{organizationId:input.organizationId,programs,selected,admitNative}), report);
          if (failed) unverified.push(failed); else readable.push(Number(row.id));
        } catch (error) {
          // Evaluated lists omit inaccessible/unresolved identities. Failed verification does not become empty success.
          if (selected || !evaluatedSourceOmission(error)) throw error;
        }
      }
    });
    await requireProgramScopeStillCurrent(q,input,programs);
    return {scope:'verified-accessible-sources',sourceIds:readable,unverified};
  } catch (error) {
    if (error instanceof SourceReadAccessError || error instanceof ProgramReadAccessError) throw error;
    throw new SourceReadAccessError(503,'SOURCE_ACCESS_UNAVAILABLE','Current source access could not be verified.');
  }
}

export async function requireSourceReadScopeStillCurrent(q: RequestSqlClient,
  input: Parameters<typeof getCurrentReadableSourceScope>[1], prior: Awaited<ReturnType<typeof getCurrentReadableSourceScope>>): Promise<void> {
  try { await getCurrentReadableSourceScope(q,{...input,sourceIds:prior.sourceIds}); } catch(error) {
    if (error instanceof SourceReadAccessError && [403,404,409].includes(error.status)) {
      throw new SourceReadAccessError(503,'SOURCE_READ_ACCESS_CHANGED','Current source access changed during the read.');
    }
    throw error;
  }
}
