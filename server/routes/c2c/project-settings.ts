/** Bounded, governed settings adapter over the canonical programme-profile writer. */
import type { Request, Response, Router } from 'express';
import type { PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { pool } from '../../db.js';
import { requestPgClient } from '../../db/requestDb';
import { getTenantScope } from '../../db/tenantStore';
import { resolveOrgId } from '../../types/auth-request';
import { governedReason } from '../governed-reason';
import { hashPayload } from '../../services/audit/chain';
import { writeChainedAuditRow } from '../../services/auditService';
import { canCreateProgram, canMutateProgram, programInOrganization } from '../../services/c2c/program-access';
import { ProgramReadAccessError, type CurrentProgramAccess, type ProgramAccessExecutor } from '../../services/c2c/current-program-access';
import { applyProgrammeProfilePatch, programmeProfilePatchSchema } from '../../services/c2c/programme-profile-write';
import {
  PROJECT_SETTINGS_FIELDS, isProjectSettingsData, isProjectSettingsEnvelope, isProjectSettingsPatch,
  type ProjectSettingsData, type ProjectSettingsEnvelope, type ProjectSettingsPatch, type ProjectSettingsWrite,
} from '../../../shared/project-settings';
import { projectSharingId } from '../../../shared/project-sharing';
import { requireProjectRouteAccess, sendProjectAccessFailure } from './project-route-access';

class SettingsRefusal extends Error {
  constructor(readonly status: 400 | 409 | 503, readonly code: string, message: string) { super(message); }
}
const bodySchema = z.object({ revision: z.string().regex(/^v1:[a-f0-9]{64}$/), reason: governedReason,
  patch: z.unknown().refine(isProjectSettingsPatch, 'Supply only valid settings fields.') }).strict();
const stale = () => new SettingsRefusal(409, 'PROJECT_SETTINGS_STALE', 'Project settings changed. Reload the saved settings before reviewing another change.');
const unavailable = () => new SettingsRefusal(503, 'PROJECT_SETTINGS_UNAVAILABLE', 'Project settings could not be verified. Reload before reviewing another change.');

function claimFrom(req: Request): number | undefined {
  // security-allow: workspace-claim only; the saved canonical parent and its organization ownership are verified below, never selected by this header.
  const raw = req.headers['x-client-id'];
  if (raw === undefined) return undefined;
  const id = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
  if (!projectSharingId(id)) throw new SettingsRefusal(400, 'INVALID_CLIENT_WORKSPACE', 'The client workspace request claim is invalid.');
  return id;
}

function sameScope(a: CurrentProgramAccess, b: CurrentProgramAccess): boolean {
  return a.programId === b.programId && a.projectId === b.projectId && a.clientWorkspaceId === b.clientWorkspaceId
    && a.actor.userId === b.actor.userId && a.actor.role === b.actor.role;
}

async function verifyWorkspace(q: ProgramAccessExecutor, organizationId: number, access: CurrentProgramAccess,
  claim: number | undefined, locked: boolean): Promise<void> {
  if (claim !== undefined && claim !== access.clientWorkspaceId) {
    throw new SettingsRefusal(409, 'PROJECT_WORKSPACE_MISMATCH', 'The saved project belongs to a different client workspace. Reload its settings.');
  }
  if (locked) {
    // Existing sharing writers reserve this same parent FOR UPDATE. Retain the
    // saved anchor, including nullable legacy workspace, without a new policy.
    const anchor = await q.query(`SELECT client_workspace_id FROM projects
      WHERE id=$1 AND organization_id=$2 AND regulatory_program_id=$3 FOR SHARE`,
    [access.projectId, organizationId, access.programId]);
    if (anchor.rows.length !== 1 || anchor.rows[0].client_workspace_id !== access.clientWorkspaceId) throw stale();
  }
  if (access.clientWorkspaceId === null) return;
  const workspace = await q.query(`SELECT id FROM client_workspaces WHERE id=$1 AND organization_id=$2${locked ? ' FOR SHARE' : ''}`,
    [access.clientWorkspaceId, organizationId]);
  if (workspace.rows.length !== 1) throw new SettingsRefusal(409, 'PROJECT_WORKSPACE_UNRESOLVED', 'The saved project client relationship needs verification before settings can be supplied.');
}

async function retainReadGrants(q: ProgramAccessExecutor, organizationId: number, access: CurrentProgramAccess): Promise<void> {
  // These are reservations of the canonical read inputs, not another access
  // evaluator. Re-run requireProjectRouteAccess after retaining them.
  await q.query(`SELECT user_id FROM project_members WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 FOR SHARE`,
    [organizationId, access.projectId, access.actor.userId]);
  await q.query(`SELECT project_id FROM project_visibility_settings WHERE organization_id=$1 AND project_id=$2 FOR SHARE`,
    [organizationId, access.projectId]);
  await q.query(`SELECT ra.id FROM concept2cure_review_assignments ra JOIN concept2cure_artifacts a ON a.id=ra.artifact_id
    WHERE ra.organization_id=$1 AND a.organization_id=$1 AND a.project_id=$2 AND ra.reviewer_id=$3 AND ra.status='pending'
    FOR SHARE OF ra,a`, [organizationId, access.projectId, access.actor.userId]);
}

async function readSaved(q: ProgramAccessExecutor, organizationId: number, access: CurrentProgramAccess): Promise<ProjectSettingsData> {
  const { rows } = await q.query(`SELECT description,priority,
    to_char(target_submission_date,'YYYY-MM-DD') AS target_submission_date,
    lead_user_id,status,xmin::text AS row_version,updated_at::text AS exact_updated_at
    FROM regulatory_programs WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [access.programId, organizationId]);
  const row = rows[0];
  if (rows.length !== 1 || typeof row.row_version !== 'string' || typeof row.exact_updated_at !== 'string'
    || typeof row.status !== 'string') throw unavailable();
  const role = access.actor.role.trim().toLowerCase();
  const data = {
    programId: access.programId, projectId: access.projectId, organizationId, actorUserId: access.actor.userId,
    clientWorkspaceId: access.clientWorkspaceId,
    canChange: row.status !== 'archived' && canCreateProgram({ orgRole: role }) && canMutateProgram({
      actor: { userId: access.actor.userId, orgRole: role }, program: { leadUserId: row.lead_user_id == null ? null : Number(row.lead_user_id) } }),
    revision: `v1:${hashPayload({ organizationId, programId: access.programId, projectId: access.projectId,
      clientWorkspaceId: access.clientWorkspaceId, xmin: row.row_version, updatedAt: row.exact_updated_at })}`,
    description: row.description, priority: row.priority, targetSubmissionDate: row.target_submission_date,
  };
  if (!isProjectSettingsData(data)) throw unavailable();
  return data;
}

function sendFailure(res: Response, error: unknown): Response {
  if (error instanceof SettingsRefusal) return res.status(error.status).json({ success: false, error: error.code, message: error.message });
  return sendProjectAccessFailure(res, error);
}

async function sendSettings(req: Request, res: Response): Promise<Response> {
  try {
    const organizationId = resolveOrgId(req);
    if (!organizationId) throw unavailable();
    const claim = claimFrom(req);
    const q = requestPgClient(req);
    const access = await requireProjectRouteAccess(req, res, { kind: 'projects', executor: q });
    await verifyWorkspace(q, organizationId, access, claim, false);
    const data = await readSaved(q, organizationId, access);
    const current = await requireProjectRouteAccess(req, res, { kind: 'projects', executor: q });
    if (!sameScope(access, current)) throw stale();
    await verifyWorkspace(q, organizationId, current, claim, false);
    return res.json({ success: true, data });
  } catch (error) { return sendFailure(res, error); }
}

function parseWrite(value: unknown): ProjectSettingsWrite {
  const body = bodySchema.safeParse(value);
  if (!body.success || !isProjectSettingsPatch(body.data.patch)) {
    throw new SettingsRefusal(400, 'INVALID_PROJECT_SETTINGS', 'Supply a current revision, a reason of 8–2000 characters and only valid description, priority or target date fields.');
  }
  const parsed = programmeProfilePatchSchema.safeParse(body.data.patch);
  if (!parsed.success) throw new SettingsRefusal(400, 'INVALID_PROJECT_SETTINGS', 'The supplied project settings are invalid.');
  return { revision: body.data.revision, reason: body.data.reason, patch: parsed.data as ProjectSettingsPatch };
}

async function applySettings(req: Request, res: Response, client: PoolClient, organizationId: number,
  write: ProjectSettingsWrite): Promise<ProjectSettingsEnvelope> {
  const programId = String(req.params.id);
  if (!await programInOrganization(client, programId, organizationId, { forUpdate: true })) {
    throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  }
  const access = await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: true });
  const claim = claimFrom(req);
  await verifyWorkspace(client, organizationId, access, claim, true);
  await retainReadGrants(client, organizationId, access);
  const current = await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: true });
  if (!sameScope(access, current)) throw stale();
  const before = await readSaved(client, organizationId, access);
  if (!before.canChange) throw new SettingsRefusal(409, 'PROJECT_SETTINGS_READ_ONLY', 'This project is read-only. No settings were changed.');
  if (write.revision !== before.revision) throw stale();
  const changedFields = PROJECT_SETTINGS_FIELDS.filter(field => Object.hasOwn(write.patch, field) && write.patch[field] !== before[field]);
  if (!changedFields.length) throw new SettingsRefusal(409, 'PROJECT_SETTINGS_NO_CHANGE', 'The supplied settings already match the saved values.');
  const patch = Object.fromEntries(changedFields.map(field => [field, write.patch[field]]));
  let after: ProjectSettingsData | undefined;
  await applyProgrammeProfilePatch({ db: drizzle(client), audit: { logAction: async entry => {
    after = await readSaved(client, organizationId, access);
    await writeChainedAuditRow(client, { ...entry, reason: write.reason, details: { ...entry.details, reason: write.reason,
      projectId: access.projectId, clientWorkspaceId: access.clientWorkspaceId,
      revisionBefore: before.revision, revisionAfter: after.revision } });
    return { persisted: true, chained: true };
  } } }, { organizationId, programId: access.programId, actorId: access.actor.userId, patch, action: 'c2c.project.settings.update' });
  const finalAccess = await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: true });
  if (!sameScope(access, finalAccess)) throw stale();
  await verifyWorkspace(client, organizationId, finalAccess, claim, true);
  const saved = await readSaved(client, organizationId, finalAccess);
  if (saved.revision !== after?.revision) throw unavailable();
  const receipt = { success: true as const, data: saved, meta: { auditTrail: { persisted: true as const, chained: true as const }, changedFields } };
  if (!isProjectSettingsEnvelope(receipt, before, write)) throw unavailable();
  return receipt;
}

function unknownOutcome(res: Response): Response {
  return res.status(503).json({ success: false, error: 'PROJECT_SETTINGS_OUTCOME_UNKNOWN',
    message: 'The save outcome could not be confirmed. Reload the saved settings before reviewing another change.' });
}

function connectionError(error: unknown, fallback: string): Error { return error instanceof Error ? error : new Error(fallback); }

async function changeSettings(req: Request, res: Response): Promise<Response> {
  let client: PoolClient | undefined;
  let transactionStarted = false;
  let commitAttempted = false;
  let discard: Error | undefined;
  try {
    const write = parseWrite(req.body);
    claimFrom(req);
    const organizationId = resolveOrgId(req);
    const scope = getTenantScope();
    if (!organizationId || scope?.source !== 'request' || scope.tenantId !== String(organizationId)) throw unavailable();
    client = await pool.connect();
    try { await client.query('BEGIN'); } catch (error) { discard = connectionError(error, 'Transaction admission unconfirmed'); throw error; }
    transactionStarted = true;
    const receipt = await applySettings(req, res, client, organizationId, write);
    commitAttempted = true;
    await client.query('COMMIT');
    transactionStarted = false;
    return res.json(receipt);
  } catch (error) {
    if (commitAttempted) discard = connectionError(error, 'Commit acknowledgement lost');
    else if (transactionStarted && client) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { discard = connectionError(rollbackError, 'Rollback acknowledgement lost'); }
    }
    if (transactionStarted && discard) return unknownOutcome(res);
    return sendFailure(res, error);
  } finally { client?.release(discard); }
}

export function installProjectSettingsRoutes(router: Router): void {
  router.get('/:id/settings', (req, res) => { void sendSettings(req, res); });
  router.patch('/:id/settings', (req, res) => { void changeSettings(req, res); });
}
