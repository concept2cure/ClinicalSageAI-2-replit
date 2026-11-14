/** Reporting reads the existing project sharing policy. No report grants access
 * to a project or document the caller cannot use through its canonical workspace. */
import { getPool } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';
import { applyProjectSharingState, canUseProject, canEditProject, getProjectSharingState, hasOrganizationProjectManagementRole } from '../project-sharing-access';

export interface ReportProjectActor { userId: number; role: string | null | undefined }

function positiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid project access identity');
  return value;
}

function allowedByProjectPolicy(row: Record<string, unknown>, actor: ReportProjectActor, forWrite = false): boolean {
  const settings = row.settings && typeof row.settings === 'object' ? row.settings as Record<string, unknown> : {};
  const ownerId = typeof row.owner_id === 'number' ? row.owner_id : null;
  const createdById = typeof row.created_by_id === 'number' ? row.created_by_id : null;
  const fallback = getProjectSharingState({ settings, ownerId, createdById });
  if (!Array.isArray(row.members)) throw new Error('Project sharing membership could not be read');
  const sharing = getProjectSharingState({
    settings: { projectSharing: { visibility: row.visibility ?? fallback.visibility, members: row.members } },
    ownerId, createdById,
  });
  const input = { actor: { userId: actor.userId, orgRole: actor.role },
    project: { ownerId, createdById, settings: applyProjectSharingState(settings, sharing) } };
  return forWrite ? canEditProject(input) : canUseProject(input) || row.review_assigned === true;
}

/* The projects deleted in Projects, and every work project under one. Deleting sets
   regulatory_programs.deleted_at and leaves the anchor projects row as it was (routes/c2c/projects.ts closeOut); a
   legacy row carries status 'deleted' itself. UNION, so a parent cycle cannot run on. Its own statement, with bind
   parameters only: the admitted-projects statement below is not built from parts and is as it always was. */
const CLOSED_PROJECTS_SQL = `
    WITH RECURSIVE closed(id) AS (
      SELECT cp.id FROM projects cp
        LEFT JOIN regulatory_programs rp ON rp.id = cp.regulatory_program_id AND rp.organization_id = cp.organization_id
       WHERE cp.organization_id = $1 AND (cp.status = 'deleted' OR rp.deleted_at IS NOT NULL)
      UNION
      SELECT child.id FROM projects child JOIN closed ON child.parent_project_id = closed.id WHERE child.organization_id = $1)
    SELECT id FROM closed`;

async function accessibleProjectIds(organizationId: number, actor: ReportProjectActor, client: RequestSqlClient, projectId?: number, forWrite = false): Promise<number[]> {
  positiveId(organizationId);
  positiveId(actor.userId);
  if (projectId !== undefined) positiveId(projectId);
  const { rows } = await client.query(`
    SELECT p.id, p.owner_id, p.created_by_id, p.settings, v.visibility,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', m.user_id, 'role', m.role, 'status', m.status))
        FROM project_members m WHERE m.project_id = p.id AND m.organization_id = p.organization_id AND m.status = 'active'), '[]'::jsonb) AS members,
      EXISTS(SELECT 1 FROM concept2cure_review_assignments ra JOIN concept2cure_artifacts a ON a.id = ra.artifact_id
        WHERE ra.reviewer_id = $2 AND ra.organization_id = $1 AND a.organization_id = $1
          AND a.project_id = p.id AND ra.status = 'pending') AS review_assigned
    FROM projects p LEFT JOIN project_visibility_settings v ON v.project_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = $1 AND ($3::int IS NULL OR p.id = $3)
    ORDER BY p.id`, [organizationId, actor.userId, projectId ?? null]);
  return rows.filter(row => allowedByProjectPolicy(row, actor, forWrite)).map(row => positiveId(row.id));
}

/**
 * The projects the sharing policy admits a person to. Read failures throw; [] means an actual evaluated
 * denial/empty set.
 *
 * Two meanings share this list:
 *   - the default: the projects whose saved reports the person may read. A deleted project stays in it, because a
 *     signed report run is a record and deleting a project does not check for one (projects.ts
 *     PROJECT_HOLD_READS). Run history and packs are admitted through it.
 *   - `{ openable: true }`: the projects the person can open now. A project deleted in Projects, and a work
 *     project under one, is left out; an archived project can still be opened and stays. The "at risk" read asked
 *     for the default and listed a deleted project's finding under "the projects you can open" (seen in the
 *     running app, 2026-11-12).
 */
export async function getAccessibleReportProjectIds(organizationId: number, actor: ReportProjectActor, client: RequestSqlClient = getPool(), options: { openable?: boolean } = {}): Promise<number[]> {
  const admitted = await accessibleProjectIds(organizationId, actor, client);
  if (options.openable !== true) return admitted;
  const { rows } = await client.query(CLOSED_PROJECTS_SQL, [organizationId]);
  const closed = new Set(rows.map((row) => positiveId(Number(row.id))));
  return admitted.filter((id) => !closed.has(id));
}

export async function canAccessReportProject(organizationId: number, actor: ReportProjectActor, projectId: number, client: RequestSqlClient = getPool(), options: { forWrite?: boolean } = {}): Promise<boolean> {
  if (options.forWrite === true) {
    positiveId(organizationId); positiveId(actor.userId); positiveId(projectId);
    // A writer retains the edit membership it actually evaluated until commit.
    // Owner/creator state is retained by the caller's parent-project lock; a
    // read-only review assignment never participates in this edit decision.
    await client.query(`SELECT user_id FROM project_members
      WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 FOR SHARE`, [organizationId, projectId, actor.userId]);
  }
  return (await accessibleProjectIds(organizationId, actor, client, projectId, options.forWrite === true)).includes(projectId);
}

export interface ReportAccessScope {
  scopeType: string; scopeId: string; organizationId?: number;
  reportTypeId?: string;
  /** A bundle item is a pointer, never its own authority for saved source receipts. */
  runId?: number; runUuid?: string | null;
  /** Saved output is bound to the source projects actually computed then. */
  recorded?: boolean; dependencySummary?: unknown; accessProjectIds?: readonly number[];
}

function recordedProjectEvidence(scope: ReportAccessScope): { present: boolean; value: unknown } {
  const dependencies = scope.dependencySummary && typeof scope.dependencySummary === 'object' ? scope.dependencySummary as Record<string, unknown> : {};
  const summary = dependencies.summary && typeof dependencies.summary === 'object' ? dependencies.summary as Record<string, unknown> : {};
  if (Object.prototype.hasOwnProperty.call(scope, 'accessProjectIds')) return { present: true, value: scope.accessProjectIds };
  return { present: Object.prototype.hasOwnProperty.call(summary, 'accessProjectIds'), value: summary.accessProjectIds };
}
export function recordedReportProjectIds(scope: ReportAccessScope): readonly number[] | null {
  const ids = recordedProjectEvidence(scope).value;
  return Array.isArray(ids) && ids.every(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ? ids : null;
}

async function canAccessProgramScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, allowed: Set<number>, client: RequestSqlClient): Promise<boolean> {
  if (scope.recorded || scope.dependencySummary !== undefined) {
    const recordedIds = recordedReportProjectIds(scope);
    if (recordedIds) return recordedIds.every(id => allowed.has(id));
    if (!hasOrganizationProjectManagementRole(actor.role)) return false;
  }
  const { rows } = await client.query(`SELECT gp.project_id FROM report_program_groups g
    LEFT JOIN report_program_group_projects gp ON gp.program_group_id = g.id AND gp.organization_id = g.organization_id
    WHERE g.id::text = $1 AND g.organization_id = $2`, [scope.scopeId, organizationId]);
  return rows.length > 0 && rows.every(row => row.project_id == null || allowed.has(positiveId(row.project_id)));
}

/** The saved scope's parent projects, including archived records retained for
 * audit. Scope existence and project permission are different checks. */
export interface ReportAccessOptions { accessibleIds?: readonly number[]; qualityContext?: ReportQualityAccessContext }
function reportAccessOptions(value: readonly number[] | ReportAccessOptions | undefined): ReportAccessOptions {
  return Array.isArray(value) ? { accessibleIds: value } : (value as ReportAccessOptions | undefined) ?? {};
}

export async function canAccessReportScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, client: RequestSqlClient = getPool(), access?: readonly number[] | ReportAccessOptions): Promise<boolean> {
  const { accessibleIds, qualityContext } = reportAccessOptions(access);
  if (scope.organizationId !== undefined && scope.organizationId !== organizationId) return false;
  const retained = await retainedReportScope(organizationId, scope, client);
  if (!retained || !await canAccessSavedProjectScope(organizationId, actor, retained, client, accessibleIds)) return false;
  const withReceipts = scope.runId === undefined ? retained : await retainedQualityReceipts(scope.runId, organizationId, retained, client);
  return withReceipts !== null && canAccessQualityEvidence(organizationId, actor, withReceipts, client, qualityContext);
}

/** A stripped bundle manifest cannot replace the canonical run's source manifest. */
async function retainedReportScope(organizationId: number, scope: ReportAccessScope, client: RequestSqlClient): Promise<ReportAccessScope | null> {
  if (scope.runId === undefined) return scope;
  if (!Number.isSafeInteger(scope.runId) || scope.runId <= 0) return null;
  const { rows } = await client.query(`SELECT id,run_uuid AS "runUuid",organization_id AS "organizationId",
    scope_type AS "scopeType",scope_id AS "scopeId",report_type_id AS "reportTypeId",
    CASE WHEN COALESCE(dependency_summary::jsonb #> '{summary}', '{}'::jsonb) ? 'accessProjectIds'
      THEN jsonb_build_object('summary', jsonb_build_object('accessProjectIds', dependency_summary::jsonb #> '{summary,accessProjectIds}'))
      ELSE '{}'::jsonb END AS "dependencySummary"
    FROM report_runs WHERE id=$1 AND organization_id=$2`, [scope.runId, organizationId]);
  const row = rows[0];
  if (rows.length !== 1 || row.organizationId !== organizationId || row.scopeType !== scope.scopeType || row.scopeId !== scope.scopeId) return null;
  if (scope.runUuid !== undefined && scope.runUuid !== row.runUuid) return null;
  if (scope.reportTypeId !== undefined && scope.reportTypeId !== row.reportTypeId) return null;
  if (typeof row.reportTypeId !== 'string' || (typeof row.runUuid !== 'string' && row.runUuid !== null)) return null;
  return { organizationId, scopeType: scope.scopeType, scopeId: scope.scopeId, reportTypeId: row.reportTypeId,
    runUuid: row.runUuid, dependencySummary: row.dependencySummary, recorded: true };
}

/** Project admission precedes receipt reads; unrelated retained report bodies are never loaded here. */
async function retainedQualityReceipts(runId: number, organizationId: number, scope: ReportAccessScope, client: RequestSqlClient): Promise<ReportAccessScope | null> {
  const { rows } = await client.query(`SELECT dependency_summary::jsonb #> '{summary,domain,qualityEvidence}' AS evidence,
      COALESCE((dependency_summary::jsonb #> '{summary,domain}') ? 'qualityEvidence', false) AS present
    FROM report_runs WHERE id=$1 AND organization_id=$2 AND scope_type=$3 AND scope_id=$4
      AND report_type_id=$5 AND run_uuid IS NOT DISTINCT FROM $6::uuid`,
  [runId, organizationId, scope.scopeType, scope.scopeId, scope.reportTypeId, scope.runUuid]);
  if (rows.length !== 1) return null;
  if (rows[0].present !== true) return scope;
  const dependencies = recordObject(scope.dependencySummary), summary = recordObject(dependencies?.summary);
  return { ...scope, dependencySummary: { summary: { ...summary, domain: { qualityEvidence: rows[0].evidence } } } };
}

async function canAccessSavedProjectScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, client: RequestSqlClient, accessibleIds?: readonly number[]): Promise<boolean> {
  if (scope.organizationId !== undefined && scope.organizationId !== organizationId) return false;
  const sourceIds = recordedReportProjectIds(scope);
  if (recordedProjectEvidence(scope).present && sourceIds === null) return false;
  if (scope.scopeType === 'account' && !sourceIds?.length) return scope.scopeId === String(organizationId);
  const allowed = new Set(accessibleIds ?? await getAccessibleReportProjectIds(organizationId, actor, client));
  if (sourceIds && !sourceIds.every(id => allowed.has(id))) return false;
  return canAccessAdmittedReportScope(organizationId, actor, scope, allowed, client);
}

const recordObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const PROGRAM_ID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
type QualityReceipt = { sourceScope: 'project' | 'organization'; programId: string | null; native: { kind: string; id: string; authoringDocumentId?: string } };

/** Internal read provenance. Serialized fields cannot manufacture its executor/actor binding. */
export interface ReportQualityAccessContext { readonly kind: 'report-quality-access' }
interface QualityAccessState {
  client: RequestSqlClient; organizationId: number; userId: number; role?: string;
}
interface QualityReportAccessState extends QualityAccessState {
  current: Map<string | null, Promise<Set<string>>>; checked: Map<string, Promise<boolean>>;
}
const qualityAccessContexts = new WeakMap<ReportQualityAccessContext, QualityAccessState>();
export function createReportQualityAccessContext(client: RequestSqlClient, identity: { organizationId: number; userId: number }): ReportQualityAccessContext {
  const context = Object.freeze({ kind: 'report-quality-access' as const });
  qualityAccessContexts.set(context, { client, ...identity });
  return context;
}

function qualityAccessState(context: ReportQualityAccessContext | undefined, client: RequestSqlClient, identity: { organizationId: number; userId: number }): QualityAccessState {
  const state = qualityAccessContexts.get(context ?? createReportQualityAccessContext(client, identity));
  if (!state || state.client !== client || state.organizationId !== identity.organizationId || state.userId !== identity.userId) {
    throw new Error('A current executor-bound report source context is required.');
  }
  return state;
}

/** null is a non-Quality report; false is a missing or malformed Quality manifest. */
function qualityRecords(scope: ReportAccessScope): unknown[] | null | false {
  const summary = recordObject(recordObject(scope.dependencySummary)?.summary);
  const domain = recordObject(summary?.domain);
  if (!domain || !Object.prototype.hasOwnProperty.call(domain, 'qualityEvidence')) {
    return scope.reportTypeId === 'compliance.audit_assurance_pack' ? false : null;
  }
  const manifest = recordObject(domain.qualityEvidence);
  return manifest?.schemaVersion === 1 && Array.isArray(manifest.records) && manifest.records.length <= 5000 ? manifest.records : false;
}

function nativeIdentity(value: unknown): QualityReceipt['native'] | null {
  const native = recordObject(value);
  if (!native || typeof native.kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(native.kind)
    || typeof native.id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(native.id)) return null;
  if (native.authoringDocumentId !== undefined && (typeof native.authoringDocumentId !== 'string' || !PROGRAM_ID.test(native.authoringDocumentId))) return null;
  return { kind: native.kind, id: native.id, ...(typeof native.authoringDocumentId === 'string' ? { authoringDocumentId: native.authoringDocumentId } : {}) };
}

function qualitySnapshotText(snapshot: Record<string, unknown>, native: QualityReceipt['native']): Record<string, unknown> | null {
  if (typeof snapshot.text !== 'string' || snapshot.text.length > 2_000_000) return null;
  let text: Record<string, unknown> | null;
  try { text = recordObject(JSON.parse(snapshot.text)); } catch { return null; }
  if (!text || text.evidenceKind !== 'qms' || text.sourceScope !== snapshot.sourceScope
    || JSON.stringify(nativeIdentity(text.native)) !== JSON.stringify(native)) return null;
  return text;
}

function qualityReceipt(value: unknown): QualityReceipt | null {
  const snapshot = recordObject(value), native = nativeIdentity(snapshot?.native);
  if (!snapshot || !native) return null;
  const text = qualitySnapshotText(snapshot, native);
  if (!text) return null;
  if (snapshot.sourceScope === 'organization') return text.programId === undefined ? { sourceScope: 'organization', programId: null, native } : null;
  return snapshot.sourceScope === 'project' && typeof text.programId === 'string' && PROGRAM_ID.test(text.programId)
    ? { sourceScope: 'project', programId: text.programId.toLowerCase(), native } : null;
}

type QualityModule = typeof import('../qms/project-evidence');
function nativeBinding(native: QualityReceipt['native'], sourceScope: 'project' | 'organization'): string {
  return JSON.stringify({ sourceScope, native });
}

/** A native register is collected once per program/actor for this report. Retained authored copies keep exact-object admission. */
async function authorizeQualityReceipt(client: RequestSqlClient, identity: { organizationId: number; userId: number }, receipt: QualityReceipt,
  current: Map<string | null, Promise<Set<string>>>, quality: QualityModule): Promise<boolean> {
  if (['qms_documents', 'qms_document_versions'].includes(receipt.native.kind)) {
    try { await quality.authorizeQualityEvidenceSnapshot(client, { ...identity, programId: receipt.programId }, receipt.native); return true; }
    catch (error) { if (error instanceof quality.QualityEvidenceNotReadable) return false; throw error; }
  }
  let admitted = current.get(receipt.programId);
  if (!admitted) {
    admitted = quality.readQualityProjectEvidence(client, { ...identity, programId: receipt.programId })
      .then(rows => new Set(rows.map(row => nativeBinding(row.native, row.sourceScope))));
    current.set(receipt.programId, admitted);
  }
  return (await admitted).has(nativeBinding(receipt.native, receipt.sourceScope));
}

/** Organization ownership is separate from the project workspace admitting that context. */
async function checkedQualityReceipt(receipt: QualityReceipt, programs: readonly (string | null)[], state: QualityReportAccessState, quality: QualityModule): Promise<boolean> {
  for (const programId of programs) {
    const contextualReceipt = { ...receipt, programId };
    const key = JSON.stringify(contextualReceipt);
    let admitted = state.checked.get(key);
    if (!admitted) {
      admitted = authorizeQualityReceipt(state.client, { organizationId: state.organizationId, userId: state.userId }, contextualReceipt, state.current, quality);
      state.checked.set(key, admitted);
    }
    if (await admitted) return true;
  }
  return false;
}

/** Historical facts remain historical; each exact retained parent must still be readable now. */
async function canAccessQualityEvidence(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, client: RequestSqlClient, qualityContext?: ReportQualityAccessContext): Promise<boolean> {
  const records = qualityRecords(scope);
  if (records === null) return true;
  if (records === false) return false;
  if (!['project', 'account'].includes(scope.scopeType)) return false;
  const { getCurrentAccessibleProgramScope, verifiedProgramAnchors, requireProgramScopeStillCurrent, ProgramReadAccessError } = await import('../c2c/current-program-access');
  const quality = await import('../qms/project-evidence');
  const identity = { organizationId, userId: actor.userId };
  const current = await getCurrentAccessibleProgramScope(client, identity);
  const state = qualityAccessState(qualityContext, client, identity);
  if (state.role !== undefined && state.role !== current.actor.role) {
    throw new ProgramReadAccessError(503, 'REPORT_SOURCE_ACCESS_CHANGED', 'Current source access changed during this read. Nothing was supplied.');
  }
  state.role = current.actor.role;
  const anchors = verifiedProgramAnchors(client, identity, current);
  const permitted = new Set(anchors.filter(anchor => scope.scopeType === 'account' || String(anchor.projectId) === scope.scopeId).map(anchor => anchor.programId));
  const organizationContexts = scope.scopeType === 'account' ? [null, ...permitted] : [...permitted];
  // Native records, workspace placement and object grants can change between
  // saved reports. Share lookups within this report, never admission decisions
  // across a history/export batch, even when actor and project anchors match.
  const reportState: QualityReportAccessState = { ...state, current: new Map(), checked: new Map() };
  for (const value of records) {
    const receipt = qualityReceipt(value);
    if (!receipt || (receipt.programId !== null && !permitted.has(receipt.programId))) return false;
    const programs = receipt.sourceScope === 'organization' ? organizationContexts : [receipt.programId];
    if (!await checkedQualityReceipt(receipt, programs, reportState, quality)) return false;
  }
  await requireProgramScopeStillCurrent(client, identity, current);
  return true;
}

/** Scope-specific parents are checked only after saved source admission. The
 * same caller-owned executor and evaluated project set reach every branch. */
async function canAccessAdmittedReportScope(organizationId: number, actor: ReportProjectActor, scope: ReportAccessScope, allowed: Set<number>, client: RequestSqlClient): Promise<boolean> {
  if (scope.scopeType === 'account') return scope.scopeId === String(organizationId);
  if (scope.scopeType === 'project') return allowed.has(Number(scope.scopeId));
  if (scope.scopeType === 'document' || scope.scopeType === 'submission') {
    const document = scope.scopeType === 'document';
    const statement = document
      ? `SELECT s.project_id FROM concept2cure_artifacts s JOIN projects p ON p.id = s.project_id WHERE s.artifact_id = $1 AND s.organization_id = $2 AND p.organization_id = $2`
      : `SELECT s.project_id FROM c2c_submissions s JOIN projects p ON p.id = s.project_id WHERE s.id::text = $1 AND s.organization_id = $2 AND p.organization_id = $2`;
    const { rows } = await client.query(statement, [scope.scopeId, organizationId]);
    return rows.length === 1 && allowed.has(positiveId(rows[0].project_id));
  }
  if (scope.scopeType === 'program') {
    return canAccessProgramScope(organizationId, actor, scope, allowed, client);
  }
  return false;
}
