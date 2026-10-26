/** Recipient-owned access to retained Submission Operations digests.
 * There is no production digest generator; a readable row is retained history,
 * and an empty list does not establish that no regulatory work is due. */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { c2cDigests, projects, type C2cDigest } from '../../../shared/schema';
import type { RequestConnectable, RequestSqlClient } from '../../db/requestDb';
import { writeChainedAuditRow } from '../auditService';
import type { AuditRowOutcome } from '../audit/audit-write-outcome';
import { programInOrganization } from '../c2c/program-access';
import { canAccessReportProject } from '../report-os/project-access';
import {
  getCurrentAccessibleProgramScope, ProgramReadAccessError, readCurrentProgramActor,
  requireCurrentProgramAccess, requireProgramScopeStillCurrent, type CurrentProgramAccess,
} from '../c2c/current-program-access';

export const DIGEST_GENERATION_AVAILABILITY = Object.freeze({
  status:'unavailable' as const, code:'DIGEST_GENERATION_UNAVAILABLE' as const,
  message:'Automated digest generation is not available. These are retained recipient records; an empty list does not establish that no work is due.',
});

export interface DigestActor { organizationId:number; userId:number }
const selectionSchema = z.object({
  projectId:z.preprocess(value=>typeof value==='string' && /^[1-9]\d*$/.test(value) ? Number(value) : value,
    z.number().int().positive().max(2_147_483_647).optional()),
  digestType:z.string().trim().min(1).max(100).optional(),
  digestId:z.string().trim().min(1).max(200).optional(),
});
export type DigestSelection = z.infer<typeof selectionSchema>;
export type RetainedDigest = Omit<C2cDigest,'updatedAt'>;
// The deployed creator does not establish updated_at. Do not select a schema
// declaration as if it were an available column or invent its historical value.
const digestColumns={
  id:c2cDigests.id,digestId:c2cDigests.digestId,orgId:c2cDigests.orgId,projectId:c2cDigests.projectId,
  packageDbId:c2cDigests.packageDbId,digestType:c2cDigests.digestType,recipientUserId:c2cDigests.recipientUserId,
  recipientRole:c2cDigests.recipientRole,title:c2cDigests.title,sections:c2cDigests.sections,
  waitingOnMe:c2cDigests.waitingOnMe,waitingOnMyFunction:c2cDigests.waitingOnMyFunction,
  newRequestedChanges:c2cDigests.newRequestedChanges,openCriticalFindings:c2cDigests.openCriticalFindings,
  overdueItems:c2cDigests.overdueItems,reopenedItems:c2cDigests.reopenedItems,blockingReadiness:c2cDigests.blockingReadiness,
  degradingSections:c2cDigests.degradingSections,status:c2cDigests.status,readAt:c2cDigests.readAt,
  generatedAt:c2cDigests.generatedAt,createdAt:c2cDigests.createdAt,
};

export class DigestAccessError extends Error {
  constructor(readonly status:400|403|404|409|503, readonly code:string, message:string,
    readonly recovery?: { method:'GET'; url:string; digestId:string }) {
    super(message); this.name='DigestAccessError';
  }
}

function requireActor(actor:DigestActor):void {
  if (!actor || ![actor.organizationId, actor.userId].every(id => Number.isSafeInteger(id) && id>0 && id<=2_147_483_647)) {
    throw new DigestAccessError(403,'DIGEST_ACTOR_REQUIRED','A current organization member is required to read this digest.');
  }
}
function fail(error:unknown):never {
  if (error instanceof DigestAccessError) throw error;
  if (error instanceof ProgramReadAccessError) {
    if (error.status===403 || error.status===404) throw notFound();
    throw new DigestAccessError(error.status,error.code,error.message);
  }
  if (error instanceof z.ZodError) throw new DigestAccessError(400,'DIGEST_SELECTION_INVALID','Digest filters must name valid recorded identities.');
  throw new DigestAccessError(503,'DIGEST_ACCESS_UNAVAILABLE','The retained digest records could not be verified. No read result was confirmed.');
}
function notFound():DigestAccessError {
  return new DigestAccessError(404,'DIGEST_NOT_FOUND','Digest not found.');
}
function requestDatabase(q:RequestSqlClient) {
  // The request adapter needs only this pinned query surface, with no pool fallback.
  return drizzle(q as PoolClient);
}

async function projectProgram(q:RequestSqlClient, actor:DigestActor, projectId:number):Promise<string> {
  // An unanchored private project must not reveal even its repair status to
  // an unassigned caller. Apply its canonical numeric policy before identity.
  const currentActor=await readCurrentProgramActor(q,actor);
  if (!await canAccessReportProject(actor.organizationId,currentActor,projectId,q)) throw notFound();
  const result=await q.query('SELECT regulatory_program_id::text AS program_id FROM projects WHERE id=$1 AND organization_id=$2',[projectId,actor.organizationId]);
  if (result.rows.length!==1) throw notFound();
  const programId=z.string().uuid().nullable().parse(result.rows[0].program_id);
  if (!programId) throw new DigestAccessError(409,'DIGEST_PROJECT_UNANCHORED','This retained digest needs a verified project relationship before its contents can be supplied.');
  return programId;
}

async function admitProject(q:RequestSqlClient, actor:DigestActor, projectId:number, forShare=false):Promise<CurrentProgramAccess> {
  const programId=await projectProgram(q,actor,projectId);
  const access=await requireCurrentProgramAccess(q,{...actor,programId,forShare});
  if (access.projectId!==projectId) throw new DigestAccessError(409,'DIGEST_PROJECT_UNRESOLVED','This retained digest has an unresolved project relationship.');
  return access;
}

/** Filter recipient and accessible canonical project in SQL, before pagination. */
export async function listRecipientDigests(q:RequestSqlClient, actor:DigestActor, raw:unknown={}):Promise<RetainedDigest[]> {
  try {
    requireActor(actor);
    actor=Object.freeze({...actor});
    const selection=selectionSchema.parse(raw);
    await readCurrentProgramActor(q,actor);
    const programId=selection.projectId===undefined ? undefined
      : (await admitProject(q,actor,selection.projectId)).programId;
    const scopeInput={...actor,programId};
    const scope=await getCurrentAccessibleProgramScope(q,scopeInput);
    const rows=await requestDatabase(q).select(digestColumns).from(c2cDigests)
      .innerJoin(projects,and(eq(projects.id,c2cDigests.projectId),eq(projects.organizationId,c2cDigests.orgId)))
      .where(and(eq(c2cDigests.orgId,actor.organizationId),eq(c2cDigests.recipientUserId,actor.userId),
        inArray(projects.regulatoryProgramId,scope.programIds),
        selection.projectId===undefined ? undefined : eq(c2cDigests.projectId,selection.projectId),
        selection.digestType===undefined ? undefined : eq(c2cDigests.digestType,selection.digestType),
        selection.digestId===undefined ? undefined : eq(c2cDigests.digestId,selection.digestId)))
      .orderBy(desc(c2cDigests.generatedAt),desc(c2cDigests.id)).limit(20);
    try { await requireProgramScopeStillCurrent(q,scopeInput,scope); }
    catch { throw new DigestAccessError(503,'DIGEST_ACCESS_CHANGED','Digest access changed during the read. Refresh before using these records.'); }
    return rows;
  } catch(error) { return fail(error); }
}

/** Hold the same permission dependencies as canonical governed project writers.
 * The receipt changes no project content, so a current reader may mark their own. */
async function reserveReceiptParent(q:RequestSqlClient, actor:DigestActor, access:CurrentProgramAccess):Promise<void> {
  if (!await programInOrganization(q,access.programId,actor.organizationId,{forUpdate:true})) throw notFound();
  const project=await q.query(`SELECT id FROM projects WHERE id=$1 AND organization_id=$2
    AND regulatory_program_id=$3 FOR UPDATE`,[access.projectId,actor.organizationId,access.programId]);
  if (project.rows.length!==1) throw notFound();
  await q.query('SELECT id FROM project_visibility_settings WHERE project_id=$1 AND organization_id=$2 FOR SHARE',[access.projectId,actor.organizationId]);
  await q.query('SELECT id FROM project_members WHERE project_id=$1 AND organization_id=$2 AND user_id=$3 FOR SHARE',[access.projectId,actor.organizationId,actor.userId]);
  await q.query(`SELECT ra.id FROM concept2cure_review_assignments ra
    JOIN concept2cure_artifacts a ON a.id=ra.artifact_id AND a.organization_id=ra.organization_id
    WHERE a.project_id=$1 AND ra.organization_id=$2 AND ra.reviewer_id=$3 FOR SHARE OF ra,a`,[access.projectId,actor.organizationId,actor.userId]);
  // A policy change may have committed while the reservations waited.
  await admitProject(q,actor,access.projectId,true);
}

export interface DigestReadReceipt {
  digest:RetainedDigest;
  outcome:'marked_read'|'already_read';
  auditTrail?:AuditRowOutcome;
}

async function writeReadReceipt(q:RequestSqlClient, actor:DigestActor, digestId:string,
  address:string|null):Promise<DigestReadReceipt> {
  await readCurrentProgramActor(q,{...actor,forShare:true});
  // Identity only: never load the sections of another recipient or private parent.
  const identity=await q.query('SELECT project_id FROM c2c_digests WHERE digest_id=$1 AND org_id=$2 AND recipient_user_id=$3',
    [digestId,actor.organizationId,actor.userId]);
  if (identity.rows.length!==1) throw notFound();
  const projectId=z.number().int().positive().parse(identity.rows[0].project_id);
  const access=await admitProject(q,actor,projectId,true);
  await reserveReceiptParent(q,actor,access);
  const scoped=and(eq(c2cDigests.digestId,digestId),eq(c2cDigests.orgId,actor.organizationId),
    eq(c2cDigests.recipientUserId,actor.userId),eq(c2cDigests.projectId,projectId));
  const [existing]=await requestDatabase(q).select(digestColumns).from(c2cDigests).where(scoped).for('update');
  if (!existing) throw notFound();
  if (existing.status==='read') return {digest:existing,outcome:'already_read'};
  if (!['generated','sent'].includes(existing.status)) throw new DigestAccessError(409,'DIGEST_STATUS_UNAVAILABLE','This retained digest has an unresolved read status.');
  const [digest]=await requestDatabase(q).update(c2cDigests).set({status:'read',readAt:new Date()}).where(scoped).returning(digestColumns);
  if (!digest) throw notFound();
  await admitProject(q,actor,projectId,true);
  await writeChainedAuditRow(q,{
    organizationId:actor.organizationId,userId:actor.userId,action:'submission_digest_read',
    resourceType:'c2c_digests',resourceId:digest.digestId,ipAddress:address ?? undefined,
    details:{digestId:digest.digestId,projectId,programId:access.programId,recipientUserId:actor.userId,
      previousStatus:existing.status,status:'read',readAt:digest.readAt?.toISOString()},
  });
  return {digest,outcome:'marked_read',auditTrail:{persisted:true,chained:true}};
}

/** Confirm marker + audit together; an unknown COMMIT evicts the physical client. */
export async function markRecipientDigestRead(persistence:RequestConnectable, actor:DigestActor,
  rawDigestId:unknown, address:string|null=null):Promise<DigestReadReceipt> {
  requireActor(actor);
  actor=Object.freeze({...actor});
  let digestId:string;
  try { digestId=selectionSchema.shape.digestId.unwrap().parse(rawDigestId); }
  catch(error) { return fail(error); }
  let client:Awaited<ReturnType<RequestConnectable['connect']>>;
  try { client=await persistence.connect(); }
  catch(error) { return fail(error); }
  let commitAttempted=false;
  let discard:Error|undefined;
  try {
    await client.query('BEGIN');
    const receipt=await writeReadReceipt(client,actor,digestId,address);
    commitAttempted=true;
    await client.query('COMMIT');
    return receipt;
  } catch(error) {
    if (commitAttempted) {
      discard=error instanceof Error ? error : new Error('Digest read commit unconfirmed');
      throw new DigestAccessError(503,'DIGEST_READ_COMMIT_UNCONFIRMED',
        'The read receipt commit could not be confirmed. Read back this exact digest before retrying; it may already be marked read.',
        {method:'GET',url:`/api/submission-ops/digests?digestId=${encodeURIComponent(digestId)}`,digestId});
    }
    try { await client.query('ROLLBACK'); }
    catch(rollbackError) { discard=rollbackError instanceof Error ? rollbackError : new Error('Digest read rollback unconfirmed'); }
    return fail(error);
  } finally { client.release(discard); }
}
