/** Recipient membership selects a notice; canonical source/program/object policies select its destination. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { NotificationRecordTarget } from '../../../shared/types/notification-navigation';
import { NOTICE_UUID, noticeSafeSectionCode } from '../../../shared/types/notification-navigation';
import { notificationResourceForRecipient } from './notification-service';
import { notificationRecordReference, type RecordReference } from './notification-reference';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from '../authoring/authoring-program-access';
import { resolveAuthoringDocumentScope, resolveAuthoringSectionScope, decideAuthoringPermission } from '../authoring/authoring-permissions';
import { loadTaskHomePrograms } from '../tasking/task-home-programs';
import { canAccessReportScope } from '../report-os/project-access';
import { threadOwnerMatches } from '../chat-thread-helpers';

export class NotificationTargetRefusal extends Error {
  constructor(readonly status: 404 | 422 | 503) {
    super(status === 404 ? 'The linked record is unavailable or you no longer have access.'
      : status === 422 ? 'This notification does not name a record and project relationship this version can open.'
        : 'The linked record could not be checked. Try again.');
  }
}
interface TargetContext { client: RequestSqlClient; organizationId: number; userId: number; email: string | null; role: string }
async function rowFor(ctx: TargetContext, text: string, values: unknown[]): Promise<Record<string, unknown>> {
  const result = await ctx.client.query(text,values);
  if (result.rows.length !== 1) throw new NotificationTargetRefusal(404);
  return result.rows[0];
}
async function ownedProgram(ctx: TargetContext, value: unknown): Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== 'string' || !NOTICE_UUID.test(value)) throw new NotificationTargetRefusal(422);
  try {
    await authorizeAuthoringProgram(ctx.client, { tenantId:ctx.organizationId,
      actor:{id:String(ctx.userId),email:ctx.email},programId:value,forWrite:false });
    return value.toLowerCase();
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) throw new NotificationTargetRefusal(error.status === 409 ? 422 : error.status === 503 ? 503 : 404);
    throw error;
  }
}
async function projectProgram(ctx: TargetContext, value: unknown): Promise<string> {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NotificationTargetRefusal(422);
  const programs = await loadTaskHomePrograms(ctx.client,ctx.organizationId,[id]);
  const program = programs.get(id);
  if (!program) throw new NotificationTargetRefusal(422);
  const programId = await ownedProgram(ctx,program.id);
  if (!programId) throw new NotificationTargetRefusal(422);
  return programId;
}
async function authoringTarget(ctx: TargetContext, ref: RecordReference): Promise<NotificationRecordTarget> {
  const scope = await resolveAuthoringDocumentScope(ctx.client,ctx.organizationId,ref.id);
  const principal = { id:String(ctx.userId),email:ctx.email,roles:[ctx.role.toUpperCase()] };
  if (!(await decideAuthoringPermission({pool:ctx.client,principal,scope,action:'view'})).allowed) throw new NotificationTargetRefusal(404);
  const doc = await rowFor(ctx,'SELECT client_program_id::text AS program_id FROM authoring_documents WHERE id=$1::uuid AND tenant_id=$2',[ref.id,ctx.organizationId]);
  const programId = await ownedProgram(ctx,doc.program_id);
  const params: Record<string,string> = {documentId:ref.id};
  if (ref.sectionId) {
    const sectionScope = await resolveAuthoringSectionScope(ctx.client,ctx.organizationId,ref.sectionId);
    if (sectionScope?.docId !== ref.id || !(await decideAuthoringPermission({pool:ctx.client,principal,scope:sectionScope,action:'view'})).allowed) throw new NotificationTargetRefusal(404);
    const section = await rowFor(ctx,'SELECT code FROM authoring_sections WHERE id=$1::uuid AND doc_id=$2::uuid AND tenant_id=$3',[ref.sectionId,ref.id,ctx.organizationId]);
    if (typeof section.code !== 'string' || !section.code.trim() || !noticeSafeSectionCode(section.code)) throw new NotificationTargetRefusal(422);
    params.sectionCode = section.code;
  }
  return {surface:'document-authoring',label:ref.sectionId ? 'Open linked section' : 'Open authored document',params,programId};
}
async function submissionTarget(ctx: TargetContext, ref: RecordReference): Promise<NotificationRecordTarget> {
  let id = ref.id;
  const params: Record<string,string> = {};
  if (ref.kind === 'ectd_sequence') {
    const sequence = await rowFor(ctx,'SELECT submission_id FROM ectd_sequences WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[ref.id,ctx.organizationId]);
    id = String(sequence.submission_id);
    if (ref.submissionId && ref.submissionId !== id) throw new NotificationTargetRefusal(404);
    params.sequenceId = ref.id;
  }
  const submission = await rowFor(ctx,'SELECT program_id::text AS program_id FROM submissions WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[id,ctx.organizationId]);
  params.submissionId = id;
  if (ref.workspace) params.ws = ref.workspace;
  return {surface:'submission-center',label:ref.kind === 'ectd_sequence' ? 'Open submission sequence' : 'Open submission',params,programId:await ownedProgram(ctx,submission.program_id)};
}
async function reportTarget(ctx: TargetContext, ref: RecordReference): Promise<NotificationRecordTarget> {
  const run = await rowFor(ctx,'SELECT scope_type,scope_id,dependency_summary FROM report_runs WHERE id=$1 AND organization_id=$2',[ref.id,ctx.organizationId]);
  const scopeType = String(run.scope_type); const scopeId = String(run.scope_id);
  if (!await canAccessReportScope(ctx.organizationId,{userId:ctx.userId,role:ctx.role},
    {scopeType,scopeId,organizationId:ctx.organizationId,recorded:true,dependencySummary:run.dependency_summary},ctx.client)) throw new NotificationTargetRefusal(404);
  let programId: string | null = null;
  if (scopeType === 'project') {
    const program = (await loadTaskHomePrograms(ctx.client,ctx.organizationId,[Number(scopeId)])).get(Number(scopeId));
    if (program) programId = await ownedProgram(ctx,program.id);
  } else if (scopeType === 'document' || scopeType === 'submission') {
    const statement = scopeType === 'document'
      ? 'SELECT project_id FROM concept2cure_artifacts WHERE artifact_id=$1 AND organization_id=$2'
      : 'SELECT project_id FROM c2c_submissions WHERE id::text=$1 AND organization_id=$2';
    const parent = await rowFor(ctx, statement, [scopeId, ctx.organizationId]);
    programId = await projectProgram(ctx, parent.project_id);
  }
  return {surface:'insights',label:'Open saved report',params:{reportRunId:ref.id},programId};
}
async function qualityTarget(ctx: TargetContext, ref: RecordReference): Promise<NotificationRecordTarget> {
  const row = await rowFor(ctx,'SELECT authoring_document_id::text AS authoring_document_id FROM qms_documents WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[ref.id,ctx.organizationId]);
  const authored = row.authoring_document_id;
  let programId: string | null = null;
  if (authored !== null) {
    if (typeof authored !== 'string' || !NOTICE_UUID.test(authored)) throw new NotificationTargetRefusal(422);
    programId = (await authoringTarget(ctx,{kind:'authoring_document',id:authored})).programId;
  }
  return {surface:'quality',label:'Open controlled document',params:{qmsDocumentId:ref.id},programId};
}
/**
 * An AnA conversation (a detached turn's notice, AnA detach §5.5): opened only
 * when it is in the recipient's organisation and is the recipient's own, by
 * the rule every thread read uses (chat-thread-helpers.ts threadOwnerMatches).
 * A colleague's conversation, or one in another organisation, is unavailable.
 */
async function conversationTarget(ctx: TargetContext, ref: RecordReference): Promise<NotificationRecordTarget> {
  const thread = await rowFor(ctx,'SELECT user_id, program_id::text AS program_id FROM chat_threads WHERE id=$1 AND organization_id=$2',[ref.id,ctx.organizationId]);
  if (!threadOwnerMatches(thread.user_id,ctx.userId)) throw new NotificationTargetRefusal(404);
  return {surface:'conversation-thread',label:'Open conversation',params:{threadId:ref.id},programId:await ownedProgram(ctx,thread.program_id ?? null)};
}
async function resolveRecord(ctx: TargetContext, ref: RecordReference): Promise<NotificationRecordTarget> {
  switch (ref.kind) {
    case 'authoring_document': return authoringTarget(ctx,ref);
    case 'submission': case 'ectd_sequence': return submissionTarget(ctx,ref);
    case 'report_run': return reportTarget(ctx,ref);
    case 'regulatory_program': return {surface:'project-home',label:'Open project',params:{},programId:await ownedProgram(ctx,ref.id)};
    case 'project': return {surface:'project-home',label:'Open project',params:{},programId:await projectProgram(ctx,ref.id)};
    case 'unified_task': {
      const task = await rowFor(ctx,'SELECT project_id FROM unified_tasks WHERE task_id=$1 AND organization_id=$2 AND deleted_at IS NULL',[ref.id,ctx.organizationId]);
      return {surface:'tasks',label:'Open task',params:{taskId:ref.id},programId:task.project_id == null ? null : await projectProgram(ctx,task.project_id)};
    }
    case 'gateway_transmittal': {
      const row = await rowFor(ctx,'SELECT program_id::text AS program_id FROM submission_transmittals WHERE id=$1 AND organization_id=$2',[ref.id,ctx.organizationId]);
      return {surface:'gateway-transmittals',label:'Open transmittal',params:{transmittalId:ref.id},programId:await ownedProgram(ctx,row.program_id)};
    }
    case 'protocol_document': {
      const row = await rowFor(ctx,'SELECT program_id::text AS program_id FROM protocol_documents WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[ref.id,ctx.organizationId]);
      const programId = await ownedProgram(ctx,row.program_id);
      return {surface:'protocol-dev',label:'Open protocol',params:{protocol:ref.id,...(programId ? {} : {protocolScope:'unfiled'})},programId};
    }
    case 'qms_document': return qualityTarget(ctx,ref);
    case 'chat_thread': return conversationTarget(ctx,ref);
  }
}

/** No notice text/metadata is returned, and no client-provided program affects ownership. */
export async function resolveNotificationRecordTarget(input: {
  client: RequestSqlClient; organizationId: number; userId: number; email: string | null; notificationId: number;
}): Promise<NotificationRecordTarget> {
  const resource = await notificationResourceForRecipient(input,input.client);
  if (!resource) throw new NotificationTargetRefusal(404);
  const ref = notificationRecordReference(resource);
  if (!ref) throw new NotificationTargetRefusal(422);
  return resolveRecord({...input,role:resource.current_org_role},ref);
}
