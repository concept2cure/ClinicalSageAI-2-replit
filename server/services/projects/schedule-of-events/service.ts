/**
 * Schedule-of-Events service — persistence + AnA operations.
 *
 * AnA schedule operations on the platform's existing project milestone/task tables:
 *
 *   - Plan header        → project_schedule_of_events (basis, framework,
 *                          confidence, baseline/target, AnA narrative).
 *   - Visual milestones  → REUSE project_workflow_stages, tagged with
 *                          metadata.source = 'ana_schedule_of_events'. No second
 *                          milestone store.
 *   - Goals              → project_schedule_goals (tracked + re-baselined).
 *   - Revisions          → project_schedule_revisions (append-only audit).
 *   - Proactive tasks    → REUSE project_tasks, tagged the same way.
 *   - Alerts             → REUSE the notification service.
 *
 * Human operations require a caller-owned executor and current actor admission.
 * Only the audited estate listing uses the shared pool; project jobs explicitly
 * enter a least-privilege organization scope before supplying their executor.
 *
 * @module server/services/projects/schedule-of-events/service
 */

import { pool } from '../../../db';
import type { RequestSqlClient } from '../../../db/requestDb';
import { getTenantScope } from '../../../db/tenantStore';
import { GOVERNED_WRITE_ROLES } from '../../../middleware/orgMembership';
import { ProgramReadAccessError, readCurrentProgramActor } from '../../c2c/current-program-access';
import { canAccessReportProject } from '../../report-os/project-access';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../../shared/canonical-json';
import type { ObjectivesRecord } from '../../c2c/charter-objectives';
import { loadStrictProjectTaskGraph, type StrictProjectTaskGraph } from '../../tasking/task-planning';
import { readDossier } from '../../c2c/dossier-read';
import type { ProjectTeamGoal, ProjectTeamMonitor } from '../../../../shared/ana/turn-timeline';
import { createNotification } from '../../notifications/notification-service';
import { generateSchedule, type GeneratedSchedule, type GeneratorGoal } from './generator';
import {
  assessScheduleHealth,
  type ScheduleHealth,
  type ScheduleStatus,
} from './health';
import {
  isCompletedMilestone,
  generatedScheduleRevisionDetail,
  milestoneScheduleStatus,
  planMilestonePreservation,
  scheduleMetadata as asObject,
  type StoredScheduleMilestone,
} from './preservation';

const SCHEDULE_SOURCE = 'ana_schedule_of_events';
const POSTGRES_INTEGER_MAX = 2_147_483_647;
type ScheduleQuery = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const activeScheduleConnections = new WeakSet<RequestSqlClient>();

/** Trusted identity and connection are supplied separately from browser/model parameters. */
export interface ScheduleExecutionContext {
  actorUserId: number;
  executor: RequestSqlClient;
}

export interface ProjectObjectiveReference {
  charterId: number; sectionKey: 'objectives'; version: number; contentHash: string;
}
export interface ProjectMonitorBinding {
  organizationId: number; projectId: number; programId: string | null;
  snapshotRevisionId: number; inputHeadHash: string; objective: ProjectObjectiveReference;
}
export interface ProjectObjectiveMonitor {
  schemaVersion: 1; organizationId: number; projectId: number; programId: string | null;
  snapshotRevisionId: number | null; inputHeadHash: string; measuredAt: string;
  state: 'current' | 'stale' | 'unavailable'; goal: ProjectTeamGoal | null;
  basisCurrent: boolean;
  objective: ProjectObjectiveReference | null; graph: StrictProjectTaskGraph | null;
  work: { total: number; completed: number; percentage: number | null };
  gates: ProjectTeamMonitor['gates']; blockers: string[];
  humanDecisions: { state: 'available' | 'unavailable'; pending: number | null; runReferences: string[] };
  basis: Record<string,{ state: 'available' | 'unavailable'; digest: string }>;
  observation?: ProjectGateObservation;
}

export interface ProjectGateObservation {
  kind:'canonical_service_observation';basisHash:string;asOf:string;
  actor:{organizationId:number;userId:number}|null;
  consistency:'bracketed_heads_not_atomic';authorizesRelease:false;
  checks:Record<'source'|'document'|'filing',{state:ProjectTeamMonitor['gates']['source'];unresolved:number|null;codes:string[]}>;
}

interface MonitorRead<T> { state: 'available' | 'unavailable'; value: T | null; digest: string }

/** Fresh, actor-admitted projection. It is never a signature, a release verdict or a clinical certification. */
export async function readProjectObjectiveMonitor(orgId: number, projectId: number, context: ScheduleExecutionContext): Promise<ProjectObjectiveMonitor> {
  const captured = humanExecution(orgId,projectId,context);
  return scheduleTransaction(captured.executor, async () => {
    await admitHumanSchedule(orgId,projectId,captured);
    const monitor = await observeProjectGates(captured.executor,await buildProjectMonitor(captured.executor,orgId,projectId),captured.actorUserId);
    await admitHumanSchedule(orgId,projectId,captured);
    return monitor;
  });
}

/** Records a deterministic observation only; does not amend a goal, task, document, approval or filing. */
export async function reconcileProjectObjectiveMonitor(orgId: number, projectId: number, context: ScheduleExecutionContext): Promise<ProjectObjectiveMonitor> {
  const captured = humanExecution(orgId,projectId,context);
  return scheduleTransaction(captured.executor,async () => {
    await admitHumanSchedule(orgId,projectId,captured);
    await captured.executor.query('SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR UPDATE',[orgId,projectId]);
    const monitor = await persistProjectMonitor(captured.executor,orgId,projectId,captured.actorUserId);
    await admitHumanSchedule(orgId,projectId,captured);
    return monitor;
  });
}

/** An already-admitted phase must still match its durable objective/source/task heads when it executes or is accepted. */
export async function assertProjectMonitorCurrent(binding: ProjectMonitorBinding, context: ScheduleExecutionContext): Promise<void> {
  requireValidMonitorBinding(binding);
  const current = await readProjectObjectiveMonitor(binding.organizationId,binding.projectId,context);
  requireProjectMonitorBinding(binding,current);
}

/** Coordination already owns this transaction. Never BEGIN or COMMIT its connection. */
export async function assertProjectMonitorCurrentOnExecutor(binding: ProjectMonitorBinding, context: ScheduleExecutionContext): Promise<void> {
  requireValidMonitorBinding(binding);
  const captured=humanExecution(binding.organizationId,binding.projectId,context);
  await admitHumanSchedule(binding.organizationId,binding.projectId,captured);
  const current=await observeProjectGates(captured.executor,await buildProjectMonitor(captured.executor,binding.organizationId,binding.projectId),captured.actorUserId);
  await admitHumanSchedule(binding.organizationId,binding.projectId,captured);
  requireProjectMonitorBinding(binding,current);
}

function requireProjectMonitorBinding(binding:ProjectMonitorBinding,current:ProjectObjectiveMonitor):void {
  requireValidMonitorBinding(binding);
  if (current.state !== 'current' || current.snapshotRevisionId !== binding.snapshotRevisionId || current.inputHeadHash !== binding.inputHeadHash ||
    current.programId !== binding.programId || stableStringify(current.objective) !== stableStringify(binding.objective)) {
    throw new ProgramReadAccessError(409,'PROJECT_MONITOR_STALE','The project objective or its source and work records changed. Reconcile before continuing.');
  }
}
function requireValidMonitorBinding(binding:ProjectMonitorBinding):void {
  if (!binding || !Number.isSafeInteger(binding.snapshotRevisionId) || binding.snapshotRevisionId <= 0 || !/^[a-f0-9]{64}$/.test(binding.inputHeadHash)) {
    throw new ProgramReadAccessError(409,'PROJECT_MONITOR_STALE','A current recorded project objective snapshot is required.');
  }
}

export function projectMonitorBinding(monitor: ProjectObjectiveMonitor): ProjectMonitorBinding | null {
  if (monitor.state !== 'current' || !monitor.objective || !monitor.snapshotRevisionId) return null;
  return { organizationId: monitor.organizationId,projectId: monitor.projectId,programId: monitor.programId,
    snapshotRevisionId: monitor.snapshotRevisionId,inputHeadHash: monitor.inputHeadHash,objective: monitor.objective };
}

export function projectMonitorForTeam(monitor: ProjectObjectiveMonitor): ProjectTeamMonitor {
  return { state: monitor.state,snapshotRevisionId: monitor.snapshotRevisionId,work: monitor.work,gates: monitor.gates,blockers: [...monitor.blockers] };
}

async function monitorRead<T>(sql: RequestSqlClient, read: () => Promise<T>): Promise<MonitorRead<T>> {
  await sql.query('SAVEPOINT project_monitor_source');
  try {
    const value = await read(); await sql.query('RELEASE SAVEPOINT project_monitor_source');
    return { state: 'available',value,digest: monitorHash(value) };
  } catch {
    await sql.query('ROLLBACK TO SAVEPOINT project_monitor_source'); await sql.query('RELEASE SAVEPOINT project_monitor_source');
    return { state: 'unavailable',value: null,digest: monitorHash({ state: 'unavailable' }) };
  }
}

async function projectMonitorIdentity(sql: RequestSqlClient, orgId: number, projectId: number): Promise<string | null> {
  const parent = await sql.query(`SELECT to_jsonb(p)->>'regulatory_program_id' AS program_id FROM projects p WHERE p.organization_id=$1 AND p.id=$2`,[orgId,projectId]);
  const programId = parent.rows[0]?.program_id;
  if (programId == null) return null;
  if (typeof programId !== 'string' || !/^[a-f0-9-]{36}$/i.test(programId)) throw new Error('The monitor program identity is invalid.');
  const linked = await sql.query(`SELECT p.id FROM projects p JOIN regulatory_programs r ON r.id=p.regulatory_program_id AND r.organization_id=p.organization_id
    WHERE p.organization_id=$1 AND p.regulatory_program_id=$2::uuid AND r.deleted_at IS NULL ORDER BY p.id LIMIT 2`,[orgId,programId]);
  if (linked.rows.length !== 1 || linked.rows[0].id !== projectId) throw new ProgramReadAccessError(409,'PROJECT_ANCHOR_UNRESOLVED','The project requires one exact program anchor.');
  return programId.toLowerCase();
}

async function buildProjectMonitor(sql: RequestSqlClient, organizationId: number, projectId: number): Promise<ProjectObjectiveMonitor> {
  const programId = await projectMonitorIdentity(sql,organizationId,projectId);
  const objective = await monitorRead(sql,async () => {
    const {readProjectObjectivesOnExecutor}=await import('../../c2c/charter-objectives');
    return readProjectObjectivesOnExecutor(sql,{orgId: organizationId,projectId});
  });
  const graph = await monitorRead(sql,() => loadStrictProjectTaskGraph(sql,{organizationId,projectId}));
  const schedule = await monitorRead(sql,() => projectScheduleHeads(sql,organizationId,projectId));
  const source = await monitorRead(sql,() => projectSourceHeads(sql,organizationId,programId));
  const documents = await monitorRead(sql,() => projectDocumentHeads(sql,organizationId,projectId,programId));
  const filing = await monitorRead(sql,() => projectFilingHeads(sql,organizationId,projectId,programId));
  const decisions = await monitorRead(sql,() => projectDecisionHeads(sql,organizationId,projectId,programId));
  const basis = { objective,graph,schedule,source,documents,filing,decisions };
  const capturedBasis = monitorBasis(basis);
  const inputHeadHash = monitorHash({ organizationId,projectId,programId,basis: capturedBasis });
  const goal = monitorGoal(objective.value);
  const blockers = monitorBlockers({programId,goal,graph: graph.value,source: source.state,documents: documents.state,filing: filing.state});
  const latest = await sql.query(`SELECT id,detail FROM project_schedule_revisions WHERE organization_id=$1 AND project_id=$2
    AND revision_type='objective_monitor' ORDER BY id DESC LIMIT 1`,[organizationId,projectId]);
  const prior = asObject(latest.rows[0]?.detail);
  const snapshotRevisionId = latest.rows.length ? Number(latest.rows[0].id) : null;
  if (snapshotRevisionId !== null && (!Number.isSafeInteger(snapshotRevisionId) || snapshotRevisionId <= 0)) throw new Error('The project monitor revision identity is invalid.');
  const unavailable = Object.values(basis).some(item => item.state === 'unavailable');
  return { schemaVersion: 1,organizationId,projectId,programId,snapshotRevisionId,inputHeadHash,measuredAt: new Date().toISOString(),
    state: monitorState(unavailable,prior.inputHeadHash === inputHeadHash,goal),goal,basisCurrent: prior.inputHeadHash === inputHeadHash,
    objective: monitorReference(goal),graph: graph.value,work: monitorWork(graph.value),
    gates: monitorGateStates(source.state,documents,filing.state),blockers,basis: capturedBasis,
    humanDecisions: {state:decisions.state,pending:decisions.value?.length ?? null,runReferences:decisions.value ?? []} };
}

function monitorBasis(basis: Record<string,MonitorRead<unknown>>): ProjectObjectiveMonitor['basis'] {
  return Object.fromEntries(Object.entries(basis).map(([key,value]) => [key,{state:value.state,digest:value.digest}]));
}
function monitorState(unavailable: boolean, basisCurrent: boolean, goal: ProjectTeamGoal|null): ProjectObjectiveMonitor['state'] {
  if (unavailable) return 'unavailable';
  return basisCurrent && goal !== null ? 'current' : 'stale';
}
function monitorReference(goal: ProjectTeamGoal|null): ProjectObjectiveReference|null {
  return goal?.source ? {charterId:goal.source.charterId,sectionKey:'objectives',version:goal.version,contentHash:goal.source.contentHash} : null;
}
function monitorWork(graph: StrictProjectTaskGraph|null): ProjectObjectiveMonitor['work'] {
  return {total:graph?.total ?? 0,completed:graph?.completed ?? 0,percentage:graph?.percentage ?? null};
}
function monitorGateStates(source: string, documents: MonitorRead<{pending:boolean}>, filing: string): ProjectTeamMonitor['gates'] {
  return {source:source === 'available' ? 'not_assessed' : 'unavailable',
    document:documents.state === 'available' ? documents.value?.pending ? 'blocked' : 'not_assessed' : 'unavailable',
    filing:filing === 'available' ? 'not_assessed' : 'unavailable'};
}

type MonitorGateCheck=ProjectGateObservation['checks']['source'];
const unassessedCheck=(code:string):MonitorGateCheck=>({state:'not_assessed',unresolved:null,codes:[code]});
function observerIdentity(organizationId:number,userId:number|undefined):ProjectGateObservation['actor'] {
  const scope=getTenantScope();
  return typeof userId==='number' && Number.isSafeInteger(userId) && userId>0 && scope?.tenantId===String(organizationId) && scope.accountId===userId && scope.role!=='app_super_admin'
    ? {organizationId,userId} : null;
}
async function observedGate(read:()=>Promise<void>,code:string):Promise<MonitorGateCheck> {
  try { await read(); return {state:'satisfied',unresolved:0,codes:[]}; }
  catch(error) {
    const status=Number((error as {status?:unknown})?.status);
    return {state:[400,403,404,409,422].includes(status)?'blocked':'unavailable',unresolved:null,codes:[code]};
  }
}

/** A read-only observation of existing gates, never a release capability or an atomic filing snapshot. */
async function observeProjectGates(sql:RequestSqlClient,monitor:ProjectObjectiveMonitor,actorUserId?:number):Promise<ProjectObjectiveMonitor> {
  const actor=observerIdentity(monitor.organizationId,actorUserId);
  const checks:ProjectGateObservation['checks']={source:actorRequiredCheck(monitor.gates.source),
    document:actorRequiredCheck(monitor.gates.document),filing:actorRequiredCheck(monitor.gates.filing)};
  if (actor && monitor.programId && monitor.state!=='unavailable') {
    const clinical=await monitorRead(sql,()=>observeProjectClinicalGates(sql,monitor,actor.userId));
    if (clinical.value) Object.assign(checks,clinical.value);
    else { checks.source={state:'unavailable',unresolved:null,codes:['CSR_GATE_READ_UNAVAILABLE']};checks.document={...checks.source}; }
    checks.filing=await observeProjectFilingGate(sql,monitor);
    const after=await buildProjectMonitor(sql,monitor.organizationId,monitor.projectId);
    if (after.inputHeadHash!==monitor.inputHeadHash) throw new ProgramReadAccessError(409,'PROJECT_MONITOR_STALE','The project records changed during readiness assessment. Reconcile before continuing.');
  }
  const observation:ProjectGateObservation={kind:'canonical_service_observation',basisHash:monitor.inputHeadHash,asOf:new Date().toISOString(),actor,
    consistency:'bracketed_heads_not_atomic',authorizesRelease:false,checks};
  const blockers=monitor.blockers.filter(code=>!['SCIENTIFIC_SOURCE_VERIFICATION_NOT_ASSESSED','DOCUMENT_RELEASE_NOT_ASSESSED','LIVE_DISPATCH_ASSESSMENT_REQUIRED'].includes(code));
  blockers.push('CURRENT_EXECUTION_GATES_REQUIRED',...Object.values(checks).flatMap(check=>check.codes));
  return {...monitor,gates:{source:checks.source.state,document:checks.document.state,filing:checks.filing.state},observation,blockers:[...new Set(blockers)].sort()};
}
function actorRequiredCheck(state:MonitorGateCheck['state']):MonitorGateCheck {
  return {state:state==='not_assessed'?'not_assessed':state,unresolved:null,codes:['CURRENT_ACTOR_REQUIRED']};
}

async function observeProjectClinicalGates(sql:RequestSqlClient,monitor:ProjectObjectiveMonitor,userId:number):Promise<Pick<ProjectGateObservation['checks'],'source'|'document'>> {
  const [{getCurrentAuthoringReadScope,requireAuthoringReadScopeStillCurrent},{requiresCsrScientificReview,assertCsrScientificRelease},
    {assertWorkflowImportRelease}]=await Promise.all([import('../../authoring/authoring-read-scope'),import('../../authoring/csr-scientific-review'),import('../../authoring/workflow-import-governance')]);
  const input={organizationId:monitor.organizationId,userId,programId:monitor.programId};
  const access=await getCurrentAuthoringReadScope(sql,input);
  const documents=await sql.query(`SELECT d.* FROM authoring_documents d WHERE d.tenant_id=$1 AND d.client_program_id=$2::uuid
    AND d.id=ANY($3::uuid[]) ORDER BY d.id LIMIT 101`,[monitor.organizationId,monitor.programId,access.documentIds]);
  if (documents.rows.length>100) return {source:unassessedCheck('CSR_TARGET_LIMIT'),document:unassessedCheck('DOCUMENT_TARGET_LIMIT')};
  const candidates:Record<string,unknown>[]=[];
  for (const document of documents.rows) {
    if (typeof document.id!=='string') throw new Error('The project document identity could not be read.');
    if (await requiresCsrScientificReview(sql,{tenantId:monitor.organizationId,document,snapshot:{id:document.id}})) candidates.push(document);
  }
  await requireAuthoringReadScopeStillCurrent(sql,input,access);
  if (candidates.length!==1) return {source:unassessedCheck(candidates.length?'CSR_TARGET_AMBIGUOUS':'CSR_TARGET_REQUIRED'),
    document:unassessedCheck('DOCUMENT_TARGET_NOT_ASSESSED')};
  const document=candidates[0]; const id=String(document.id);
  const sections=await sql.query(`SELECT id::text,code,title,content FROM authoring_sections WHERE tenant_id=$1 AND doc_id=$2 ORDER BY order_index,created_at,id LIMIT 1001`,[monitor.organizationId,id]);
  const framed=monitorClinicalDocument(document,sections.rows);
  const governance={organizationId:monitor.organizationId,doc:framed.doc,sections:framed.sections,actor:{id:String(userId),email:access.actor.email}};
  const source=await observedGate(()=>assertCsrScientificRelease(sql,governance),'CSR_SCIENTIFIC_REVIEW_BLOCKED');
  let release=await observedGate(()=>assertWorkflowImportRelease(sql,governance),'DOCUMENT_RELEASE_CONTROLS_BLOCKED');
  if (release.state==='satisfied' && !['APPROVED','FROZEN'].includes(String(document.status).toUpperCase())) release={state:'blocked',unresolved:1,codes:['DOCUMENT_NOT_RELEASED']};
  await requireAuthoringReadScopeStillCurrent(sql,input,access);
  return {source,document:release};
}

function monitorClinicalDocument(document:Record<string,unknown>,sections:Record<string,unknown>[]) {
  if (typeof document.id!=='string' || sections.length>1000) throw new Error('The clinical document could not be framed.');
  return {doc:{...document,id:document.id},sections:sections.map(section=>{
    if (typeof section.id!=='string' || typeof section.code!=='string' || section.content!=null && typeof section.content!=='string') throw new Error('The clinical section could not be framed.');
    return {id:section.id,code:section.code,title:section.title,content:typeof section.content==='string'?section.content:null};
  })};
}

async function observeProjectFilingGate(sql:RequestSqlClient,monitor:ProjectObjectiveMonitor):Promise<MonitorGateCheck> {
  try {
    const targets=await projectFilingHeads(sql,monitor.organizationId,monitor.projectId,monitor.programId);
    if (targets.sequences.length!==1) return unassessedCheck(targets.sequences.length?'FILING_TARGET_AMBIGUOUS':'FILING_TARGET_REQUIRED');
    const id=targets.sequences[0].id;
    if (typeof id!=='number' || !Number.isSafeInteger(id) || id<=0) throw new Error('The filing identity could not be read.');
    const {assessSequenceDispatchReadiness}=await import('../../ectd/assess-dispatch-readiness');
    const actual=await assessSequenceDispatchReadiness({organizationId:monitor.organizationId,sequenceId:id});
    if (actual.sequenceId!==id || typeof actual.gate?.cleared!=='boolean' || !Array.isArray(actual.gate.blockers)) throw new Error('The canonical dispatch observation could not be verified.');
    return {state:actual.gate.cleared?'satisfied':'blocked',unresolved:actual.gate.blockers.length,
      codes:actual.gate.cleared?[]:['CANONICAL_DISPATCH_GATE_BLOCKED']};
  } catch { return {state:'unavailable',unresolved:null,codes:['CANONICAL_DISPATCH_GATE_UNAVAILABLE']}; }
}

function monitorGoal(record: ObjectivesRecord | null): ProjectTeamGoal | null {
  const current = record?.current;
  if (!current || !record?.charterId || !/^[a-f0-9]{64}$/.test(current.contentHash) || !current.content.objective.trim() || current.content.objective.length > 4000) return null;
  return { alias: `g-${current.contentHash.slice(0,12)}`,label: 'Project objective',version: current.version,summary: current.content.objective.slice(0,600),
    truncated: current.content.objective.length > 600,source: {charterId: record.charterId,sectionKey: 'objectives',version: current.version,
      contentHash: current.contentHash,status: current.status,locked: current.locked} };
}

function monitorBlockers(input: {programId: string|null; goal: ProjectTeamGoal|null; graph: StrictProjectTaskGraph|null;
  source: string; documents: string; filing: string}): string[] {
  const blockers = ['SCIENTIFIC_SOURCE_VERIFICATION_NOT_ASSESSED','DOCUMENT_RELEASE_NOT_ASSESSED','LIVE_DISPATCH_ASSESSMENT_REQUIRED'];
  if (!input.programId) blockers.push('PROJECT_PROGRAM_UNANCHORED');
  if (!input.goal) blockers.push('PROJECT_OBJECTIVE_REQUIRED');
  if (!input.graph) blockers.push('PROJECT_WORK_UNAVAILABLE');
  else blockers.push(...input.graph.problems);
  if ([input.source,input.documents,input.filing].includes('unavailable')) blockers.push('PROJECT_GATE_SOURCE_UNAVAILABLE');
  return [...new Set(blockers)].sort();
}

async function projectSourceHeads(sql: RequestSqlClient, organizationId: number, programId: string | null) {
  if (!programId) return { state: 'unanchored' };
  const source = await sql.query(`SELECT d.id::text AS id,d.version,d.content_hash,d.deleted_at,to_jsonb(d)->>'updated_at' AS updated_at
    FROM vault.documents d WHERE d.organization_id=$1 AND d.program_id=$2 ORDER BY d.id LIMIT 1001`,[organizationId,programId]);
  if (source.rows.length > 1000) throw new Error('Project source head limit reached.');
  return source.rows;
}

/** Excludes monitor-written timestamps/metadata so recording an observation cannot invalidate its own basis. */
async function projectScheduleHeads(sql:RequestSqlClient,organizationId:number,projectId:number) {
  const milestones=await sql.query(`SELECT id,status,start_date,due_date,metadata FROM project_workflow_stages
    WHERE organization_id=$1 AND project_id=$2 ORDER BY id LIMIT 1001`,[organizationId,projectId]);
  const goals=await sql.query(`SELECT id,title,status,target_date,metric,current_context FROM project_schedule_goals
    WHERE organization_id=$1 AND project_id=$2 ORDER BY id LIMIT 1001`,[organizationId,projectId]);
  if (milestones.rows.length>1000 || goals.rows.length>1000) throw new Error('The project schedule exceeds this bounded projection.');
  return {milestones:milestones.rows,goals:goals.rows};
}

async function projectDocumentHeads(sql: RequestSqlClient, organizationId: number, projectId: number, programId: string | null) {
  if (!programId) return { state: 'unanchored',pending: false };
  const dossier = await readDossier(sql,organizationId,programId);
  const canonical = await sql.query(`SELECT canonical_id,version,stage,content_hash,review_signature,approval_signature,packaging_validated
    FROM canonical_documents WHERE organization_id=$1 AND (project_id=$2 OR project_id=$3) ORDER BY canonical_id LIMIT 1001`,[organizationId,programId,String(projectId)]);
  const authoring = await sql.query(`SELECT d.id::text AS id,to_jsonb(d)->>'updated_at' AS updated_at,to_jsonb(d)->>'version' AS version,
    to_jsonb(d)->>'status' AS status FROM authoring_documents d WHERE d.tenant_id=$1 AND d.client_program_id=$2::uuid ORDER BY d.id LIMIT 1001`,[organizationId,programId]);
  const sections=await sql.query(`SELECT s.id::text,s.doc_id::text,s.code,encode(sha256(convert_to(COALESCE(s.content,''),'UTF8')),'hex') AS content_sha256,
    to_jsonb(s)->>'updated_at' AS updated_at FROM authoring_sections s JOIN authoring_documents d ON d.id=s.doc_id AND d.tenant_id=s.tenant_id
    WHERE d.tenant_id=$1 AND d.client_program_id=$2::uuid ORDER BY s.id LIMIT 1001`,[organizationId,programId]);
  const reviews=await sql.query(`SELECT r.id::text,r.doc_id::text,r.review_status,r.reviewed_snapshot_hash,r.review_binding_basis,
    to_jsonb(r)->>'reviewed_at' AS reviewed_at FROM authoring_reviews r JOIN authoring_documents d ON d.id=r.doc_id AND d.tenant_id=r.tenant_id
    WHERE d.tenant_id=$1 AND d.client_program_id=$2::uuid ORDER BY r.id LIMIT 1001`,[organizationId,programId]);
  if ([canonical,authoring,sections,reviews].some(result=>result.rows.length>1000)) throw new Error('Project document head limit reached.');
  const pending = dossier.rows.some(row => row.complete < row.counted) || canonical.rows.some(row => ['authoring','draft','review'].includes(String(row.stage)));
  return { dossier: { home: dossier.home,rows: dossier.rows },canonical: canonical.rows,authoring: authoring.rows,sections:sections.rows,reviews:reviews.rows,pending };
}

async function projectFilingHeads(sql: RequestSqlClient, organizationId: number, projectId: number, programId: string | null) {
  const rows = await sql.query(`SELECT s.id,to_jsonb(s)->>'validation_status' AS validation_status,to_jsonb(s)->>'status' AS status,
    to_jsonb(s)->>'updated_at' AS updated_at FROM ectd_sequences s JOIN submissions p ON p.id=s.submission_id
    WHERE s.organization_id=$1 AND p.organization_id=$1
    AND (to_jsonb(p)->>'program_id'=$2 OR to_jsonb(p)->>'project_id'=$3) ORDER BY s.id LIMIT 1001`,[organizationId,programId,String(projectId)]);
  if (rows.rows.length > 1000) throw new Error('Project filing head limit reached.');
  const leaves = await sql.query(`SELECT l.id,to_jsonb(l)->>'sha256' AS sha256,to_jsonb(l)->>'md5' AS md5,
    to_jsonb(l)->>'document_content_sha256' AS document_content_sha256,to_jsonb(l)->>'checksum' AS checksum,
    to_jsonb(l)->>'document_table' AS document_table,to_jsonb(l)->>'document_id' AS document_id,to_jsonb(l)->>'document_uuid' AS document_uuid,
    to_jsonb(l)->>'lifecycle_op' AS lifecycle_op,to_jsonb(l)->>'section_code' AS section_code,to_jsonb(l)->>'title' AS title,
    to_jsonb(l)->>'updated_at' AS updated_at,to_jsonb(l)->>'deleted_at' AS deleted_at
    FROM submission_leaves l JOIN ectd_sequences s ON s.id=l.sequence_id AND s.organization_id=l.organization_id
    JOIN submissions p ON p.id=s.submission_id AND p.organization_id=s.organization_id WHERE l.organization_id=$1
    AND (to_jsonb(p)->>'program_id'=$2 OR to_jsonb(p)->>'project_id'=$3) ORDER BY l.id LIMIT 1001`,[organizationId,programId,String(projectId)]);
  if (leaves.rows.length > 1000) throw new Error('Project filing leaf head limit reached.');
  return { sequences: rows.rows,leaves: leaves.rows };
}

async function projectDecisionHeads(sql: RequestSqlClient, organizationId: number, projectId: number, programId: string|null): Promise<string[]> {
  const refs = [String(projectId),...(programId ? [programId] : [])];
  const rows = await sql.query(`SELECT id FROM ana_runs WHERE organization_id=$1 AND project_id=ANY($2::text[])
    AND status='awaiting_approval' ORDER BY id LIMIT 101`,[organizationId,refs]);
  if (rows.rows.length > 100 || rows.rows.some(row => typeof row.id !== 'string')) throw new Error('The pending project decisions could not be completely read.');
  return rows.rows.map(row => String(row.id));
}

async function persistProjectMonitor(sql: RequestSqlClient, organizationId: number, projectId: number,actorUserId?:number): Promise<ProjectObjectiveMonitor> {
  await sql.query(`SELECT pg_advisory_xact_lock(hashtext('project-objective-monitor:' || $1::text || ':' || $2::text))`,[organizationId,projectId]);
  const monitor = await observeProjectGates(sql,await buildProjectMonitor(sql,organizationId,projectId),actorUserId);
  if (monitor.basisCurrent && monitor.snapshotRevisionId) return monitor;
  let plan = await loadPlan(organizationId,projectId,sql);
  if (!plan) {
    await sql.query(`INSERT INTO project_schedule_of_events(organization_id,project_id,status,basis_summary,generated_by_ana,metadata)
      VALUES ($1,$2,'active','Project objective monitoring; no milestone schedule has been generated.',false,'{"monitorOnly":true}')`,[organizationId,projectId]);
    plan = await loadPlan(organizationId,projectId,sql);
  }
  if (!plan) throw new Error('The project monitor schedule header could not be retained.');
  const confirmed = await buildProjectMonitor(sql,organizationId,projectId);
  if (confirmed.inputHeadHash !== monitor.inputHeadHash) throw new ProgramReadAccessError(409,'PROJECT_MONITOR_STALE','The project changed while its objective snapshot was being recorded.');
  if (monitor.state !== 'unavailable' && monitor.goal) monitor.state = 'current';
  const inserted = await sql.query(`INSERT INTO project_schedule_revisions(organization_id,project_id,schedule_id,revision_type,summary,detail,triggered_by,created_by_ana)
    VALUES($1,$2,$3,'objective_monitor','Deterministic project objective and gate observation.',$4::json,'project_monitor',false) RETURNING id`,
    [organizationId,projectId,plan.id,JSON.stringify(monitor)]);
  monitor.snapshotRevisionId = Number(inserted.rows[0]?.id);
  if (!Number.isSafeInteger(monitor.snapshotRevisionId) || monitor.snapshotRevisionId <= 0) throw new Error('The project monitor revision was not confirmed.');
  monitor.basisCurrent = true;
  await sql.query(`UPDATE project_schedule_of_events SET last_reviewed_by_ana_at=now(),metadata=(COALESCE(metadata,'{}'::json)::jsonb || $3::jsonb)::json
    WHERE organization_id=$1 AND project_id=$2`,[organizationId,projectId,JSON.stringify({ objectiveMonitorDirty:false,objectiveMonitor: {revisionId: monitor.snapshotRevisionId,inputHeadHash: monitor.inputHeadHash} })]);
  return monitor;
}

/** Trusted source writers can make the existing bounded sweep eligible after a recorded change. */
export async function markProjectObjectiveMonitorDirty(sql: RequestSqlClient, organizationId: number, projectId: number): Promise<void> {
  requireScheduleIds(organizationId,projectId);
  const scope = getTenantScope();
  if (scope?.tenantId !== String(organizationId) || scope.role === 'app_super_admin') throw new ProgramReadAccessError(403,'SCHEDULE_SCOPE_INVALID','A matching project writer scope is required.');
  await markMonitorDirtyOnExecutor(sql,organizationId,projectId);
}
async function markMonitorDirtyOnExecutor(sql:ScheduleQuery,organizationId:number,projectId:number):Promise<void> {
  await sql.query(`UPDATE project_schedule_of_events SET last_reviewed_by_ana_at=NULL,
    metadata=(COALESCE(metadata,'{}'::json)::jsonb || '{"objectiveMonitorDirty":true}'::jsonb)::json
    WHERE organization_id=$1 AND project_id=$2`,[organizationId,projectId]);
}

function monitorHash(value: unknown): string { return createHash('sha256').update(stableStringify(value)).digest('hex'); }

function requireScheduleIds(orgId: number, projectId: number): void {
  if (![orgId, projectId].every(id => Number.isSafeInteger(id) && id > 0 && id <= POSTGRES_INTEGER_MAX)) {
    throw new ProgramReadAccessError(403, 'SCHEDULE_SCOPE_INVALID', 'A valid organization and project are required.');
  }
}

function suppliedExecutor(executor: RequestSqlClient | undefined): RequestSqlClient {
  if (!executor || typeof executor.query !== 'function') {
    throw new ProgramReadAccessError(503, 'REQUEST_DB_CONTEXT_REQUIRED', 'The caller database context is required. Nothing was read or changed.');
  }
  return executor;
}

function humanExecution(orgId: number, projectId: number, context: ScheduleExecutionContext) {
  requireScheduleIds(orgId, projectId);
  const actorUserId = context?.actorUserId;
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0 || actorUserId > POSTGRES_INTEGER_MAX) {
    throw new ProgramReadAccessError(403, 'PROJECT_ACTOR_REQUIRED', 'A current organization actor is required.');
  }
  // Capture primitives before awaiting: mutating a context object cannot change
  // which actor or connection owns an operation already in progress.
  return { actorUserId, executor: suppliedExecutor(context?.executor) };
}

async function admitHumanSchedule(
  orgId: number, projectId: number, context: ScheduleExecutionContext, forWrite = false,
): Promise<void> {
  try {
    const actor = await readCurrentProgramActor(context.executor, {
      organizationId: orgId, userId: context.actorUserId, forShare: forWrite,
    });
    if (forWrite && !GOVERNED_WRITE_ROLES.has(actor.role)) {
      throw new ProgramReadAccessError(403, 'PROJECT_WRITE_ACCESS_DENIED', 'Current permissions do not permit a schedule change.');
    }
    const { rows } = await context.executor.query(
      forWrite
        ? 'SELECT id, status FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE'
        : 'SELECT id, status FROM projects WHERE organization_id = $1 AND id = $2',
      [orgId, projectId],
    );
    if (rows.length !== 1) throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    // The canonical numeric project lifecycle also includes planning, on-hold
    // and completed. These are not archive/delete and retain schedule edits.
    const status = rows[0].status;
    if (forWrite && (typeof status !== 'string' || !status.trim() || ['archived', 'deleted'].includes(status))) {
      throw new ProgramReadAccessError(409, 'PROJECT_NOT_ACTIVE', 'The project is archived or deleted. Its retained schedule can still be read.');
    }
    if (!await canAccessReportProject(orgId, actor, projectId, context.executor, { forWrite })) {
      throw new ProgramReadAccessError(403, forWrite ? 'PROJECT_WRITE_ACCESS_DENIED' : 'PROJECT_PERMISSION_DENIED',
        'Current project permissions do not permit this operation.');
    }
  } catch (error) {
    if (error instanceof ProgramReadAccessError) throw error;
    throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified.');
  }
}

async function scheduleTransaction<T>(executor: RequestSqlClient, operation: () => Promise<T>): Promise<T> {
  if (activeScheduleConnections.has(executor)) {
    throw new ProgramReadAccessError(409, 'SCHEDULE_OPERATION_IN_PROGRESS', 'Another schedule operation is already using this connection.');
  }
  activeScheduleConnections.add(executor);
  let began = false;
  let commitStarted = false;
  try {
    await executor.query('BEGIN');
    began = true;
    const result = await operation();
    commitStarted = true;
    await executor.query('COMMIT');
    return result;
  } catch (error) {
    let discard = !began || commitStarted;
    // A rejected COMMIT may have committed. Never retry it or represent a later
    // ROLLBACK as proof that the writes did not happen.
    if (began && !commitStarted) {
      try { await executor.query('ROLLBACK'); } catch { discard = true; }
    }
    if (discard) {
      await executor.discard?.(error instanceof Error ? error : new Error('Schedule transaction could not be confirmed')).catch(() => undefined);
    }
    throw error;
  } finally { activeScheduleConnections.delete(executor); }
}

async function withScheduleRead<T>(executor: RequestSqlClient, operation: () => Promise<T>): Promise<T> {
  if (activeScheduleConnections.has(executor)) {
    throw new ProgramReadAccessError(409, 'SCHEDULE_OPERATION_IN_PROGRESS', 'Another schedule operation is already using this connection.');
  }
  activeScheduleConnections.add(executor);
  try { return await operation(); }
  finally { activeScheduleConnections.delete(executor); }
}

async function withHumanScheduleWrite<T>(
  orgId: number, projectId: number, context: ScheduleExecutionContext,
  operation: (sql: ScheduleQuery, actorUserId: number) => Promise<T>,
): Promise<T> {
  const captured = humanExecution(orgId, projectId, context);
  return scheduleTransaction(captured.executor, async () => {
    await admitHumanSchedule(orgId, projectId, captured, true);
    const result = await operation(captured.executor, captured.actorUserId);
    await markMonitorDirtyOnExecutor(captured.executor,orgId,projectId);
    await admitHumanSchedule(orgId, projectId, captured, true);
    return result;
  });
}

async function scheduleAlertCandidates(sql: ScheduleQuery, organizationId: number, projectId: number, actorUserId?: number): Promise<number[]> {
  if (actorUserId !== undefined) return [actorUserId];
  const { rows } = await sql.query('SELECT owner_id, created_by_id FROM projects WHERE organization_id=$1 AND id=$2', [organizationId, projectId]);
  return [...new Set([rows[0]?.owner_id, rows[0]?.created_by_id]
    .filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))];
}

async function currentScheduleAlertRecipient(
  sql: ScheduleQuery, organizationId: number, projectId: number, userId: number, required: boolean,
): Promise<boolean> {
  let actor;
  try { actor = await readCurrentProgramActor(sql, {organizationId, userId, forShare: true}); }
  catch (error) {
    if (!required && error instanceof ProgramReadAccessError && error.status === 403) return false;
    throw error;
  }
  const permitted = await canAccessReportProject(organizationId, actor, projectId, sql);
  if (!permitted && required) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'The schedule alert recipient no longer has project access.');
  return permitted;
}

/** Targeted generic alerts carry no private prose or project identity. Historical
 * alerts and recipients' later permission changes remain separate work. */
async function notifyScheduleChange(sql: ScheduleQuery, organizationId: number, projectId: number, notice: {
  category: string; severity: 'info' | 'warning' | 'critical'; actorUserId?: number;
}): Promise<number> {
  const candidates = await scheduleAlertCandidates(sql, organizationId, projectId, notice.actorUserId);
  let delivered = 0;
  for (const userId of candidates) {
    if (!await currentScheduleAlertRecipient(sql, organizationId, projectId, userId, notice.actorUserId !== undefined)) continue;
    await createNotification({ organizationId, recipientUserId: userId, category: notice.category, severity: notice.severity,
      title: notice.severity === 'info' ? 'A project schedule changed' : 'A project schedule needs attention',
      body: 'Open a project you can access to review its current schedule.' }, sql);
    delivered++;
  }
  return delivered;
}

// ─────────────────────────────────────────────────────────────────────────────
// View shapes (what the API / AnA tools return)
// ─────────────────────────────────────────────────────────────────────────────

export interface SchedulePlanView {
  id: number;
  status: string;
  projectType: string | null;
  regulatoryFramework: string | null;
  basisSummary: string | null;
  anaSummary: string | null;
  confidence: string | null;
  version: number;
  baselineDate: string | null;
  targetDate: string | null;
  generatedByAna: boolean;
  lastReviewedByAnaAt: string | null;
  lastAmendedAt: string | null;
  updatedAt: string | null;
}

export interface ScheduleMilestoneView {
  id: number;
  key: string;
  title: string;
  description: string | null;
  category: string;
  status: ScheduleStatus;
  baselineDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  progress: number;
  isCritical: boolean;
  regulatoryBasis: string | null;
  ownerRole: string | null;
  dependsOn: string[];
  sortOrder: number;
  anaRationale: string | null;
  slipDays: number | null;
}

export interface ScheduleGoalView {
  id: number;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: string;
  priority: string;
  metric: string | null;
  currentContext: string | null;
  anaRationale: string | null;
  lastResetByAnaAt: string | null;
}

export interface ScheduleRevisionView {
  id: number;
  revisionType: string;
  summary: string;
  detail: unknown;
  triggeredBy: string | null;
  createdByAna: boolean;
  createdAt: string;
}

export interface ScheduleOfEventsView {
  plan: SchedulePlanView | null;
  milestones: ScheduleMilestoneView[];
  goals: ScheduleGoalView[];
  revisions: ScheduleRevisionView[];
  health: ScheduleHealth;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function toIso(d: unknown): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toDate(d: unknown): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Map the richer schedule status onto the platform-standard stage status column. */
function toColumnStatus(s: ScheduleStatus): string {
  switch (s) {
    case 'completed':
      return 'completed';
    case 'in_progress':
    case 'at_risk':
      return 'in-progress';
    case 'slipped':
    case 'blocked':
      return 'blocked';
    default:
      return 'pending';
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────

async function loadPlan(orgId: number, projectId: number, sql: ScheduleQuery): Promise<SchedulePlanView | null> {
  const { rows } = await sql.query(
    `SELECT * FROM project_schedule_of_events
      WHERE organization_id = $1 AND project_id = $2
      LIMIT 1`,
    [orgId, projectId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    projectType: r.project_type,
    regulatoryFramework: r.regulatory_framework,
    basisSummary: r.basis_summary,
    anaSummary: r.ana_summary,
    confidence: r.confidence,
    version: r.version,
    baselineDate: toIso(r.baseline_date),
    targetDate: toIso(r.target_date),
    generatedByAna: r.generated_by_ana,
    lastReviewedByAnaAt: toIso(r.last_reviewed_by_ana_at),
    lastAmendedAt: toIso(r.last_amended_at),
    updatedAt: toIso(r.updated_at),
  };
}

type MilestoneRow = StoredScheduleMilestone;

function milestoneFromRow(r: MilestoneRow, now: Date): ScheduleMilestoneView {
  const md = asObject(r.metadata);
  const status = milestoneScheduleStatus(r);
  const target = toDate(r.due_date);
  let slipDays: number | null = null;
  if (status !== 'completed' && target && target.getTime() < now.getTime()) {
    slipDays = Math.round((now.getTime() - target.getTime()) / DAY_MS);
  }
  return {
    id: r.id,
    key: String(md.key ?? `m${r.id}`),
    title: r.name,
    description: r.description,
    category: String(md.category ?? 'regulatory'),
    status,
    baselineDate: md.baselineDate ? toIso(md.baselineDate) : toIso(r.start_date),
    targetDate: toIso(r.due_date),
    completedAt: md.completedAt ? toIso(md.completedAt) : null,
    progress: typeof md.progress === 'number' ? md.progress : 0,
    isCritical: !!md.isCritical,
    regulatoryBasis: md.regulatoryBasis ?? null,
    ownerRole: md.ownerRole ?? null,
    dependsOn: Array.isArray(md.dependsOn) ? md.dependsOn.map(String) : [],
    sortOrder: r.order ?? 0,
    anaRationale: md.anaRationale ?? null,
    slipDays,
  };
}

async function loadMilestoneRows(orgId: number, projectId: number, sql: ScheduleQuery, lock = false): Promise<MilestoneRow[]> {
  const statement = lock
    ? `SELECT *
         FROM project_workflow_stages
        WHERE organization_id = $1 AND project_id = $2
          AND metadata->>'source' = $3
        ORDER BY "order" ASC, id ASC FOR UPDATE`
    : `SELECT *
         FROM project_workflow_stages
        WHERE organization_id = $1 AND project_id = $2
          AND metadata->>'source' = $3
        ORDER BY "order" ASC, id ASC`;
  const { rows } = await sql.query(
    statement,
    [orgId, projectId, SCHEDULE_SOURCE],
  );
  return rows;
}

async function loadGoals(orgId: number, projectId: number, sql: ScheduleQuery): Promise<ScheduleGoalView[]> {
  const { rows } = await sql.query(
    `SELECT * FROM project_schedule_goals
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               created_at ASC`,
    [orgId, projectId],
  );
  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    targetDate: toIso(r.target_date),
    status: r.status,
    priority: r.priority,
    metric: r.metric,
    currentContext: r.current_context,
    anaRationale: r.ana_rationale,
    lastResetByAnaAt: toIso(r.last_reset_by_ana_at),
  }));
}

async function loadRevisions(
  orgId: number,
  projectId: number,
  limit = 25,
  sql: ScheduleQuery,
): Promise<ScheduleRevisionView[]> {
  const { rows } = await sql.query(
    `SELECT * FROM project_schedule_revisions
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [orgId, projectId, limit],
  );
  return rows.map((r: any) => ({
    id: r.id,
    revisionType: r.revision_type,
    summary: r.summary,
    detail: r.detail,
    triggeredBy: r.triggered_by,
    createdByAna: r.created_by_ana,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
  }));
}

function healthFromMilestones(milestones: ScheduleMilestoneView[], now: Date): ScheduleHealth {
  return assessScheduleHealth(
    milestones.map((m) => ({
      key: m.key,
      title: m.title,
      status: m.status,
      targetDate: m.targetDate ? new Date(m.targetDate) : null,
      isCritical: m.isCritical,
      progress: m.progress,
    })),
    { now },
  );
}

async function recordRevision(params: {
  orgId: number;
  projectId: number;
  scheduleId: number;
  revisionType: string;
  summary: string;
  detail?: unknown;
  triggeredBy?: string;
  createdByAna?: boolean;
}, sql: ScheduleQuery): Promise<void> {
  await sql.query(
    `INSERT INTO project_schedule_revisions
       (organization_id, project_id, schedule_id, revision_type, summary, detail, triggered_by, created_by_ana)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.orgId,
      params.projectId,
      params.scheduleId,
      params.revisionType,
      params.summary,
      JSON.stringify(params.detail ?? {}),
      params.triggeredBy ?? 'ana_proactive',
      params.createdByAna ?? true,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A schedule store that cannot be read is an error, not a project with no
 * schedule. A missing table (42P01) answered `plan: null` with no milestones,
 * which the surface and AnA read as "no schedule has been generated" — on a
 * database the drizzle schema should have provisioned (2026-10-15).
 */
export async function getScheduleOfEvents(
  orgId: number,
  projectId: number,
  context: ScheduleExecutionContext,
): Promise<ScheduleOfEventsView> {
  const captured = humanExecution(orgId, projectId, context);
  return withScheduleRead(captured.executor, async () => {
    await admitHumanSchedule(orgId, projectId, captured);
    const view = await loadScheduleView(orgId, projectId, captured.executor);
    await admitHumanSchedule(orgId, projectId, captured);
    return view;
  });
}

/** Generation reads its response on the writing client, before COMMIT. */
async function loadScheduleView(
  orgId: number,
  projectId: number,
  sql: ScheduleQuery,
): Promise<ScheduleOfEventsView> {
  const now = new Date();
  // The caller owns one pinned connection, so execute serially.
  const plan = await loadPlan(orgId, projectId, sql);
  const milestoneRows = await loadMilestoneRows(orgId, projectId, sql);
  const goals = await loadGoals(orgId, projectId, sql);
  const revisions = await loadRevisions(orgId, projectId, 25, sql);
  const milestones = milestoneRows.map((r) => milestoneFromRow(r, now));
  return { plan, milestones, goals, revisions, health: healthFromMilestones(milestones, now) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate (AnA builds / regenerates the schedule)
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateScheduleParams {
  orgId: number;
  projectId: number;
  projectType: string | null | undefined;
  baselineDate?: Date | null;
  targetDate?: Date | null;
  goals?: GeneratorGoal[];
  triggeredBy?: string;
  createdByAna?: boolean;
  /** Optional caller justification; never synthesized as a human approval. */
  reason?: string;
}

/** Preserve existing stage identities and insert only genuinely new work. */
async function writeGeneratedMilestones(
  sql: ScheduleQuery,
  params: GenerateScheduleParams,
  gen: GeneratedSchedule,
  preservation: ReturnType<typeof planMilestonePreservation>,
  scheduleId: number,
): Promise<void> {
  const { orgId, projectId } = params;
  for (const m of gen.milestones) {
    const previous = preservation.matches.get(m.key);
    if (previous) {
      if (!isCompletedMilestone(previous)) {
        await sql.query(
          `UPDATE project_workflow_stages SET due_date = $1, metadata = $2, updated_at = now()
            WHERE id = $3 AND organization_id = $4 AND project_id = $5`,
          [m.targetDate, JSON.stringify({ ...asObject(previous.metadata), anaRationale: m.anaRationale }),
            previous.id, orgId, projectId],
        );
      }
      continue;
    }
    const metadata = {
      source: SCHEDULE_SOURCE,
      scheduleId,
      key: m.key,
      category: m.category,
      isCritical: m.isCritical,
      regulatoryBasis: m.regulatoryBasis ?? null,
      ownerRole: m.ownerRole ?? null,
      dependsOn: m.dependsOn,
      anaRationale: m.anaRationale,
      baselineDate: m.baselineDate.toISOString(),
      scheduleStatus: 'not_started' as ScheduleStatus,
      progress: 0,
    };
    await sql.query(
      `INSERT INTO project_workflow_stages
         (organization_id, project_id, name, description, "order", status,
          start_date, due_date, auto_advance, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, false, $8, now(), now())`,
      [
        orgId,
        projectId,
        m.title,
        m.description ?? null,
        m.sortOrder,
        m.baselineDate,
        m.targetDate,
        JSON.stringify(metadata),
      ],
    );
  }
}

export async function generateProjectSchedule(
  params: GenerateScheduleParams,
  context: ScheduleExecutionContext,
): Promise<ScheduleOfEventsView> {
  params = { ...params };
  const { orgId, projectId } = params;
  const gen = generateSchedule({
    projectType: params.projectType,
    baselineDate: params.baselineDate ?? null,
    targetDate: params.targetDate ?? null,
    goals: params.goals,
  });

  // Every schedule mutation takes the same parent lock before reading state.
  return withHumanScheduleWrite(orgId, projectId, context, async client => {
    const { rows: previousPlans } = await client.query(
      `SELECT * FROM project_schedule_of_events
        WHERE organization_id = $1 AND project_id = $2 FOR UPDATE`,
      [orgId, projectId],
    );
    const previousPlan = previousPlans[0] ?? null;
    const previousRows = await loadMilestoneRows(orgId, projectId, client, true);
    const preservation = planMilestonePreservation(previousPlan, previousRows, gen);

    // 1. Upsert the plan header (one per project).
    const { rows: planRows } = await client.query(
      `INSERT INTO project_schedule_of_events
         (organization_id, project_id, status, project_type, regulatory_framework, goals,
          basis_summary, ana_summary, confidence, version, baseline_date, target_date,
          generated_by_ana, last_reviewed_by_ana_at, updated_at)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, now(), now())
       -- Arbiter MUST name the tenant column. Uniqueness is what ON CONFLICT
       -- resolves against, so an arbiter of (project_id) alone — against the old
       -- org-blind unique index — decided whose row this upsert landed on, and
       -- the DO UPDATE SET list below does not reset organization_id, so an
       -- overwritten row silently kept the victim's tenant id.
       -- See db/migrations/20260728_schedule_of_events_org_scoped_uniqueness.sql
       ON CONFLICT (organization_id, project_id) DO UPDATE SET
          status = 'active',
          project_type = EXCLUDED.project_type,
          regulatory_framework = EXCLUDED.regulatory_framework,
          goals = EXCLUDED.goals,
          basis_summary = EXCLUDED.basis_summary,
          ana_summary = EXCLUDED.ana_summary,
          confidence = EXCLUDED.confidence,
          version = project_schedule_of_events.version + 1,
          baseline_date = EXCLUDED.baseline_date,
          target_date = EXCLUDED.target_date,
          generated_by_ana = EXCLUDED.generated_by_ana,
          last_reviewed_by_ana_at = now(),
          updated_at = now()
       RETURNING id, version`,
      [
        orgId,
        projectId,
        gen.projectType,
        gen.framework,
        JSON.stringify(params.goals ?? []),
        gen.basisSummary,
        gen.basisSummary,
        gen.confidence,
        gen.baselineDate,
        gen.targetDate,
        params.createdByAna ?? true,
      ],
    );
    const scheduleId: number = planRows[0].id;

    // 2. Keep existing row identity and actuals. Task/evidence references must
    // survive regeneration; changed requirements were refused before any write.
    await writeGeneratedMilestones(client, params, gen, preservation, scheduleId);

    // 3. If goals were provided as part of generation, install them as the goal set.
    if (params.goals && params.goals.length > 0) {
      await replaceGoals({
        orgId,
        projectId,
        scheduleId,
        goals: params.goals,
        rationale: 'Goals set as part of schedule generation.',
        triggeredBy: params.triggeredBy,
        createdByAna: params.createdByAna,
        recordRevisionEntry: false,
      }, client);
    }

    // 4. Audit.
    await recordRevision({
      orgId,
      projectId,
      scheduleId,
      revisionType: 'generated',
      summary: `Generated ${gen.milestones.length}-milestone ${gen.framework} schedule for ${gen.projectType}.`,
      detail: generatedScheduleRevisionDetail(
        { plan: previousPlan, milestones: previousRows }, gen, planRows[0].version, preservation, params.reason,
      ),
      triggeredBy: params.triggeredBy ?? 'ana_user',
      createdByAna: params.createdByAna,
    }, client);

    // Reading afterward could report a different regeneration, or fail after
    // committing. Include response loading in the same atomic operation.
    const view = await loadScheduleView(orgId, projectId, client);
    return view;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Amend a single milestone
// ─────────────────────────────────────────────────────────────────────────────

export interface AmendMilestoneParams {
  orgId: number;
  projectId: number;
  milestoneKey: string;
  newTargetDate?: Date | null;
  status?: ScheduleStatus;
  progress?: number;
  note?: string;
  triggeredBy?: string;
  createdByAna?: boolean;
}

export async function amendMilestone(
  params: AmendMilestoneParams,
  context: ScheduleExecutionContext,
): Promise<{ ok: boolean; message: string }> {
  params = { ...params };
  return withHumanScheduleWrite(params.orgId, params.projectId, context, async sql => {
    const { orgId, projectId, milestoneKey } = params;
    const { rows } = await sql.query(
      `SELECT id, name, description, "order", status, start_date, due_date, metadata
         FROM project_workflow_stages
        WHERE organization_id = $1 AND project_id = $2
          AND metadata->>'source' = $3 AND metadata->>'key' = $4
        LIMIT 1`,
      [orgId, projectId, SCHEDULE_SOURCE, milestoneKey],
    );
    const row = rows[0];
    if (!row) return { ok: false, message: `No schedule milestone with key "${milestoneKey}".` };

    const md = asObject(row.metadata);
    const nextStatus: ScheduleStatus = params.status ?? (md.scheduleStatus as ScheduleStatus) ?? 'not_started';
    md.scheduleStatus = nextStatus;
    if (typeof params.progress === 'number') md.progress = Math.max(0, Math.min(100, params.progress));
    if (nextStatus === 'completed') md.completedAt = new Date().toISOString();
    if (params.note) md.lastAmendNote = params.note;

    const newDue = params.newTargetDate ?? toDate(row.due_date);
    await sql.query(
      `UPDATE project_workflow_stages
          SET due_date = $1, status = $2, metadata = $3, updated_at = now()
        WHERE id = $4 AND organization_id = $5`,
      [newDue, toColumnStatus(nextStatus), JSON.stringify(md), row.id, orgId],
    );

    const plan = await loadPlan(orgId, projectId, sql);
    if (plan) {
      await sql.query(
        `UPDATE project_schedule_of_events SET last_amended_at = now(), updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [plan.id, orgId],
      );
      await recordRevision({
        orgId,
        projectId,
        scheduleId: plan.id,
        revisionType: 'amended',
        summary: `Amended milestone "${row.name}"${params.newTargetDate ? ` → ${params.newTargetDate.toISOString().slice(0, 10)}` : ''}${params.status ? ` (status: ${params.status})` : ''}.`,
        detail: {
          milestoneKey,
          newTargetDate: params.newTargetDate?.toISOString() ?? null,
          status: params.status ?? null,
          note: params.note ?? null,
        },
        triggeredBy: params.triggeredBy ?? 'ana_user',
        createdByAna: params.createdByAna,
      }, sql);
    }
    return { ok: true, message: `Milestone "${row.name}" updated.` };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Goals — set / reset
// ─────────────────────────────────────────────────────────────────────────────

interface ReplaceGoalsParams {
  orgId: number;
  projectId: number;
  scheduleId: number | null;
  goals: GeneratorGoal[];
  rationale: string;
  triggeredBy?: string;
  createdByAna?: boolean;
  recordRevisionEntry?: boolean;
}

async function replaceGoals(params: ReplaceGoalsParams, sql: ScheduleQuery): Promise<void> {
  const { orgId, projectId } = params;
  // Retire the current active goals (kept for history as 'revised').
  await sql.query(
    `UPDATE project_schedule_goals
        SET status = 'revised', updated_at = now()
      WHERE organization_id = $1 AND project_id = $2
        AND status NOT IN ('achieved', 'dropped', 'revised')`,
    [orgId, projectId],
  );
  for (const g of params.goals) {
    await sql.query(
      `INSERT INTO project_schedule_goals
         (organization_id, project_id, schedule_id, title, description, target_date,
          status, priority, metric, current_context, last_reset_by_ana_at, ana_rationale, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, now(), $10, now())`,
      [
        orgId,
        projectId,
        params.scheduleId,
        g.title,
        g.description ?? null,
        g.targetDate ? new Date(g.targetDate) : null,
        g.priority ?? 'medium',
        g.metric ?? null,
        params.rationale,
        params.rationale,
      ],
    );
  }
  if (params.recordRevisionEntry !== false && params.scheduleId) {
    await recordRevision({
      orgId,
      projectId,
      scheduleId: params.scheduleId,
      revisionType: 'goal_reset',
      summary: `Reset project goals (${params.goals.length}). ${params.rationale}`,
      detail: { goals: params.goals, rationale: params.rationale },
      triggeredBy: params.triggeredBy ?? 'ana_user',
      createdByAna: params.createdByAna,
    }, sql);
  }
}

export interface ResetGoalsParams {
  orgId: number;
  projectId: number;
  goals: GeneratorGoal[];
  rationale: string;
  triggeredBy?: string;
  createdByAna?: boolean;
}

export async function resetProjectGoals(
  params: ResetGoalsParams,
  context: ScheduleExecutionContext,
): Promise<{ ok: boolean; message: string }> {
  params = { ...params };
  return withHumanScheduleWrite(params.orgId, params.projectId, context, async (sql, actorUserId) => {
    const plan = await loadPlan(params.orgId, params.projectId, sql);
    await replaceGoals({
      orgId: params.orgId,
      projectId: params.projectId,
      scheduleId: plan?.id ?? null,
      goals: params.goals,
      rationale: params.rationale,
      triggeredBy: params.triggeredBy,
      createdByAna: params.createdByAna,
      recordRevisionEntry: true,
    }, sql);
    if (plan) {
      await sql.query(
        `UPDATE project_schedule_of_events
            SET ana_summary = $1, updated_at = now()
          WHERE id = $2 AND organization_id = $3`,
        [`Goals re-baselined: ${params.rationale}`, plan.id, params.orgId],
      );
    }
    await notifyScheduleChange(sql, params.orgId, params.projectId, {category: 'schedule_goal_reset', severity: 'info', actorUserId});
    return { ok: true, message: `Reset ${params.goals.length} goal(s).` };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Proactive health review (the heart of "stay on top of it")
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthReviewResult {
  ok: boolean;
  scheduleId: number | null;
  health: ScheduleHealth;
  applied: boolean;
  tasksCreated: number;
  alertsCreated: number;
  message: string;
  objectiveMonitor?: ProjectObjectiveMonitor;
}

async function hasOpenScheduleTask(
  orgId: number,
  projectId: number,
  milestoneKey: string,
  kind: string,
  sql: ScheduleQuery,
): Promise<boolean> {
  const { rows } = await sql.query(
    `SELECT 1 FROM project_tasks
      WHERE organization_id = $1 AND project_id = $2
        AND metadata->>'source' = $3
        AND metadata->>'milestoneKey' = $4
        AND metadata->>'kind' = $5
        AND status <> 'done'
      LIMIT 1`,
    [orgId, projectId, SCHEDULE_SOURCE, milestoneKey, kind],
  );
  return rows.length > 0;
}

async function createScheduleTask(params: {
  orgId: number;
  projectId: number;
  milestoneKey: string;
  kind: 'recover_slip' | 'mitigate_risk';
  title: string;
  description: string;
  priority: string;
  dueDate: Date | null;
}, sql: ScheduleQuery): Promise<boolean> {
  if (await hasOpenScheduleTask(params.orgId, params.projectId, params.milestoneKey, params.kind, sql)) {
    return false;
  }
  await sql.query(
    `INSERT INTO project_tasks
       (organization_id, project_id, name, description, status, priority, module_type, due_date, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'todo', $5, 'Schedule', $6, $7, now(), now())`,
    [
      params.orgId,
      params.projectId,
      params.title,
      params.description,
      params.priority,
      params.dueDate,
      JSON.stringify({ source: SCHEDULE_SOURCE, milestoneKey: params.milestoneKey, kind: params.kind, createdByAna: true }),
    ],
  );
  return true;
}

/**
 * Assess schedule health and (when apply=true) act on it proactively:
 * update milestone statuses, open recovery/mitigation tasks, fire alerts,
 * flag at-risk goals, refresh AnA's narrative, and audit the review.
 */
interface ScheduleReviewParams {
  orgId: number;
  projectId: number;
  apply?: boolean;
  triggeredBy?: string;
}

export async function reviewScheduleHealth(params: ScheduleReviewParams, context: ScheduleExecutionContext): Promise<HealthReviewResult> {
  params = { ...params };
  const captured = humanExecution(params.orgId, params.projectId, context);
  if (params.apply !== false) {
    return withHumanScheduleWrite(params.orgId, params.projectId, captured,
      (sql, actorUserId) => reviewScheduleHealthOnExecutor(params, sql, actorUserId));
  }
  return withScheduleRead(captured.executor, async () => {
    await admitHumanSchedule(params.orgId, params.projectId, captured);
    const result = await reviewScheduleHealthOnExecutor(params, captured.executor, captured.actorUserId);
    await admitHumanSchedule(params.orgId, params.projectId, captured);
    return result;
  });
}

function requireProjectJobScope(orgId: number, projectId: number): void {
  requireScheduleIds(orgId, projectId);
  const scope = getTenantScope();
  if (scope?.source !== 'job' || scope.tenantId !== String(orgId) || scope.role === 'app_super_admin') {
    throw new ProgramReadAccessError(403, 'SCHEDULE_JOB_SCOPE_REQUIRED', 'An organization-scoped schedule job is required.');
  }
}

async function admitScheduleJob(orgId: number, projectId: number, sql: ScheduleQuery): Promise<void> {
  requireProjectJobScope(orgId, projectId);
  const { rows } = await sql.query(`SELECT p.id FROM projects p JOIN organizations o ON o.id=p.organization_id
    WHERE p.organization_id=$1 AND p.id=$2 AND p.status='active' AND o.status='active' FOR UPDATE OF p FOR SHARE OF o`, [orgId, projectId]);
  if (rows.length !== 1) throw new ProgramReadAccessError(409, 'PROJECT_NOT_ACTIVE', 'The project or organization is not active.');
}

/** Only the existing scheduler may call this, on its per-organization connection. */
export async function reviewScheduleHealthForSweep(params: ScheduleReviewParams, executor: RequestSqlClient): Promise<HealthReviewResult> {
  params = { ...params };
  requireProjectJobScope(params.orgId, params.projectId);
  const sql = suppliedExecutor(executor);
  return scheduleTransaction(sql, async () => {
    await admitScheduleJob(params.orgId, params.projectId, sql);
    const result = await reviewScheduleHealthOnExecutor(params, sql);
    const objectiveMonitor = await persistProjectMonitor(sql,params.orgId,params.projectId);
    await admitScheduleJob(params.orgId, params.projectId, sql);
    return { ...result,ok: result.ok || objectiveMonitor.snapshotRevisionId !== null,objectiveMonitor };
  });
}

async function reviewScheduleHealthOnExecutor(params: ScheduleReviewParams, sql: ScheduleQuery, actorUserId?: number): Promise<HealthReviewResult> {
  const { orgId, projectId } = params;
  const apply = params.apply ?? true;
  const now = new Date();

  const plan = await loadPlan(orgId, projectId, sql);
  const milestoneRows = await loadMilestoneRows(orgId, projectId, sql);
  const milestones = milestoneRows.map((r) => milestoneFromRow(r, now));
  const health = healthFromMilestones(milestones, now);

  if (!plan || milestones.length === 0) {
    return {
      ok: false,
      scheduleId: plan?.id ?? null,
      health,
      applied: false,
      tasksCreated: 0,
      alertsCreated: 0,
      message: 'No schedule of events to review.',
    };
  }

  let tasksCreated = 0;
  let alertsCreated = 0;

  if (apply) {
    const rowByKey = new Map(milestoneRows.map((r) => [String(asObject(r.metadata).key ?? `m${r.id}`), r]));

    for (const result of health.milestones) {
      const row = rowByKey.get(result.key);
      if (!row) continue;
      const md = asObject(row.metadata);
      const prevNotified: string | undefined = md.lastNotifiedStatus;

      if (result.changed) {
        md.scheduleStatus = result.nextStatus;
        if (result.slipDays != null) md.slipDays = result.slipDays;
        await sql.query(
          `UPDATE project_workflow_stages
              SET status = $1, metadata = $2, updated_at = now()
            WHERE id = $3 AND organization_id = $4`,
          [toColumnStatus(result.nextStatus), JSON.stringify({ ...md }), row.id, orgId],
        );
      }

      // Proactive task + alert on first transition into a problem state.
      const dueDate = toDate(row.due_date);
      if (result.nextStatus === 'slipped' && prevNotified !== 'slipped') {
        const created = await createScheduleTask({
          orgId,
          projectId,
          milestoneKey: result.key,
          kind: 'recover_slip',
          title: `Recover slipped milestone: ${result.title}`,
          description: result.reason + (result.isCritical ? ' This milestone is on the critical path.' : ''),
          priority: result.isCritical ? 'urgent' : 'high',
          dueDate,
        }, sql);
        if (created) tasksCreated++;
        alertsCreated += await notifyScheduleChange(sql, orgId, projectId, {category: 'schedule_milestone_slip', severity: result.isCritical ? 'critical' : 'warning', actorUserId});
        md.lastNotifiedStatus = 'slipped';
        await sql.query(
          `UPDATE project_workflow_stages SET metadata = $1 WHERE id = $2 AND organization_id = $3`,
          [JSON.stringify(md), row.id, orgId],
        );
      } else if (result.nextStatus === 'at_risk' && prevNotified !== 'at_risk' && prevNotified !== 'slipped') {
        const created = await createScheduleTask({
          orgId,
          projectId,
          milestoneKey: result.key,
          kind: 'mitigate_risk',
          title: `Mitigate at-risk milestone: ${result.title}`,
          description: result.reason,
          priority: result.isCritical ? 'high' : 'medium',
          dueDate,
        }, sql);
        if (created) tasksCreated++;
        alertsCreated += await notifyScheduleChange(sql, orgId, projectId, {category: 'schedule_milestone_at_risk', severity: 'warning', actorUserId});
        md.lastNotifiedStatus = 'at_risk';
        await sql.query(
          `UPDATE project_workflow_stages SET metadata = $1 WHERE id = $2 AND organization_id = $3`,
          [JSON.stringify(md), row.id, orgId],
        );
      }
    }

    // Flag goals whose target dates have passed without being achieved.
    const goals = await loadGoals(orgId, projectId, sql);
    for (const g of goals) {
      if (g.status === 'active' && g.targetDate && new Date(g.targetDate).getTime() < now.getTime()) {
        await sql.query(
          `UPDATE project_schedule_goals
              SET status = 'at_risk', current_context = $1, updated_at = now()
            WHERE id = $2 AND organization_id = $3`,
          [`Target date passed (${g.targetDate.slice(0, 10)}) without completion — AnA flagged this goal for re-baselining.`, g.id, orgId],
        );
      }
    }

    const narrative = buildAnaNarrative(health);
    await sql.query(
      `UPDATE project_schedule_of_events
          SET ana_summary = $1, last_reviewed_by_ana_at = now(), updated_at = now()
        WHERE id = $2 AND organization_id = $3`,
      [narrative, plan.id, orgId],
    );

    await recordRevision({
      orgId,
      projectId,
      scheduleId: plan.id,
      revisionType: 'health_review',
      summary: `Proactive review — ${health.summary}`,
      detail: { health, tasksCreated, alertsCreated },
      triggeredBy: params.triggeredBy ?? 'scheduler',
      createdByAna: true,
    }, sql);
  }

  return {
    ok: true,
    scheduleId: plan.id,
    health,
    applied: apply,
    tasksCreated,
    alertsCreated,
    message: apply
      ? `Reviewed schedule: ${health.summary} Opened ${tasksCreated} task(s), ${alertsCreated} alert(s).`
      : health.summary,
  };
}

function buildAnaNarrative(health: ScheduleHealth): string {
  /* "Your program is on track." was said of a schedule with no milestones, or
     none with a target date (2026-10-15). It is said of what was assessed. */
  const verdict =
    health.overallStatus === 'not_assessed'
      ? health.total === 0
        ? 'The schedule has no milestones, so it cannot be assessed.'
        : 'No open milestone has a target date, so the schedule cannot be assessed.'
      : health.overallStatus === 'on_track'
        ? health.undated > 0
          ? 'The milestones with target dates are on track.'
          : 'Your project is on track.'
        : health.overallStatus === 'at_risk'
          ? 'Your project needs attention.'
          : health.milestones.some((m) => m.nextStatus === 'slipped' && m.isCritical)
            ? 'Your project is off track — critical milestones have slipped.'
            : 'Your project is off track — milestones have slipped.';
  return `${verdict} ${health.summary} Last reviewed ${new Date(health.assessedAt).toISOString().slice(0, 16).replace('T', ' ')}Z by AnA.`;
}

/** Active schedule plans across all tenants — used by the proactive sweep. */
export async function listActiveSchedulePlans(): Promise<
  Array<{ scheduleId: number | null; orgId: number; projectId: number }>
> {
  const scope = getTenantScope();
  if (scope?.source !== 'job' || scope.tenantId !== '0' || scope.role !== 'app_super_admin') {
    throw new ProgramReadAccessError(403, 'SCHEDULE_SYSTEM_SCOPE_REQUIRED', 'The audited estate schedule listing scope is required.');
  }
  const { rows } = await pool.query(
    `SELECT s.id,p.organization_id,p.id AS project_id FROM projects p JOIN organizations o ON o.id=p.organization_id
      LEFT JOIN project_schedule_of_events s ON s.project_id=p.id AND s.organization_id=p.organization_id
      WHERE p.status='active' AND o.status='active' AND (s.id IS NULL OR s.status='active') ORDER BY p.organization_id,p.id`,
  );
  return rows.map((r: any) => {
    requireScheduleIds(r.organization_id, r.project_id);
    if (r.id !== null && (!Number.isSafeInteger(r.id) || r.id <= 0)) throw new Error('Invalid schedule listing identity');
    return { scheduleId: r.id, orgId: r.organization_id, projectId: r.project_id };
  });
}
