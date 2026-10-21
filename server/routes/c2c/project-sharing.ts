/** Completes the existing numeric sharing endpoints; no independent access policy. */
import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { ProjectSharingMember, ProjectSharingResponse } from '../../../shared/project-sharing';
import { memberLabels } from '../../../shared/utils/member-labels';
import { requestConnectable, requestPgClient, type RequestSqlClient } from '../../db/requestDb';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { applyProjectSharingState, canManageProject, getProjectSharingState } from '../../services/project-sharing-access';
import { readCsrProjectActor } from '../../services/csr/project-scope';
import { ProjectAdmissionRefusal, requireProjectAdmission, type AdmittedProject } from './project-access';
import { auditTrailFromEntry, getOrganizationId, getUserId, logAuditEntry, sendError, sendSuccess } from './shared';

type Row = Record<string, unknown>;
type SharingSnapshot = { raw: Row[]; sharing: ReturnType<typeof getProjectSharingState> };
type SharingContext = { project: AdmittedProject; snapshot: SharingSnapshot; role: string; organizationId: number; actorUserId: number; programId?: string };
export type SharingCommand = { kind: 'member'; userId: number; role: 'use' | 'edit' }
  | { kind: 'revoke'; userId: number } | { kind: 'visibility'; visibility: 'private' | 'org_public' };
const idSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2_147_483_647));
const memberSchema = z.object({ role: z.enum(['use', 'edit']) });
const visibilitySchema = z.object({ visibility: z.enum(['private', 'org_public']) });
const unavailable = () => new ProjectAdmissionRefusal(503, 'PROJECT_SHARING_UNAVAILABLE', 'Project sharing could not be verified. Read the current state before trying again.');

function validateMembers(rows: Row[]): void {
  const ids = new Set<number>();
  for (const member of rows) {
    if (!Number.isSafeInteger(member.user_id) || Number(member.user_id) <= 0 || ids.has(Number(member.user_id)) ||
        !['active', 'revoked'].includes(String(member.status)) || !['owner', 'edit', 'use'].includes(String(member.role))) throw unavailable();
    ids.add(Number(member.user_id));
  }
}

async function sharingSnapshot(q: RequestSqlClient, project: AdmittedProject, lock = false): Promise<SharingSnapshot> {
  const statement = lock
    ? `/* project-sharing:members */ SELECT id,user_id,role,status,invited_by_id,accepted_at,created_at,updated_at FROM project_members WHERE project_id=$1 AND organization_id=$2 ORDER BY user_id FOR UPDATE`
    : `/* project-sharing:members */ SELECT id,user_id,role,status,invited_by_id,accepted_at,created_at,updated_at FROM project_members WHERE project_id=$1 AND organization_id=$2 ORDER BY user_id`;
  const members = await q.query(statement, [project.id, project.organizationId]);
  validateMembers(members.rows);
  const visibility = await q.query('SELECT visibility FROM project_visibility_settings WHERE project_id=$1 AND organization_id=$2', [project.id, project.organizationId]);
  if (visibility.rows.length > 1) throw unavailable();
  const settings = project.settings && typeof project.settings === 'object' ? project.settings as Row : {};
  const identity = { settings, ownerId: project.ownerId, createdById: project.createdById };
  const fallback = getProjectSharingState(identity);
  const mode = visibility.rows[0]?.visibility ?? fallback.visibility;
  if (mode !== 'private' && mode !== 'org_public') throw unavailable();
  const sharing = getProjectSharingState({ ...identity, visibilityOverride: mode,
    membersOverride: members.rows.filter(m => m.status === 'active').map(m => ({ userId: Number(m.user_id),
      role: m.role as 'owner' | 'use' | 'edit', status: 'active' })) });
  return { raw: members.rows, sharing };
}

function manager(ctx: SharingContext): boolean {
  return !['archived', 'deleted'].includes(ctx.project.status) && GOVERNED_WRITE_ROLES.has(ctx.role) && canManageProject({
    actor: { userId: ctx.actorUserId, orgRole: ctx.role }, project: { ownerId: ctx.project.ownerId,
      createdById: ctx.project.createdById, settings: applyProjectSharingState({}, ctx.snapshot.sharing) },
  });
}

// Current actor is held as a request-derived field, never read from the body.
type ActorContext = SharingContext;

async function context(req: Request, q: RequestSqlClient, write = false): Promise<ActorContext> {
  const programId = z.string().uuid().optional().parse(req.query.programId)?.toLowerCase();
  const project = await requireProjectAdmission(req, req.params.id, write, { executor: q, programId, forShare: write });
  const snapshot = await sharingSnapshot(q, project, write);
  return { project, snapshot, programId, organizationId: getOrganizationId(req), actorUserId: getUserId(req), role: String(req.userRole) };
}

function date(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function memberRows(ctx: SharingContext, canManage: boolean): ProjectSharingMember[] {
  return ctx.snapshot.sharing.members.map(member => {
    const raw = ctx.snapshot.raw.find(row => row.user_id === member.userId && row.status === 'active');
    const implicitSources: ProjectSharingMember['implicitSources'] = [];
    if (member.userId === ctx.project.ownerId) implicitSources.push('project_owner');
    if (member.userId === ctx.project.createdById) implicitSources.push('project_creator');
    const editable = canManage && Boolean(raw) && !implicitSources.length && member.role !== 'owner';
    return { userId: member.userId, role: member.role, status: 'active', addedById: raw?.invited_by_id == null ? null : Number(raw.invited_by_id),
      addedAt: date(raw?.accepted_at), explicit: Boolean(raw), implicitSources, canSetRole: editable, canRevoke: editable };
  });
}

async function candidates(q: RequestSqlClient, org: number): Promise<ProjectSharingResponse['candidates']> {
  const { rows } = await q.query(`SELECT u.id,u.name,u.email,ou.role FROM organization_users ou JOIN users u ON u.id=ou.user_id
    WHERE ou.organization_id=$1 AND u.status='active' ORDER BY u.id`, [org]);
  const seen = new Set<number>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || seen.has(Number(row.id)) || typeof row.role !== 'string' || !row.role.trim()) throw unavailable();
    seen.add(Number(row.id));
  }
  const named = rows.map(row => ({ id: Number(row.id), name: typeof row.name === 'string' ? row.name : null, email: typeof row.email === 'string' ? row.email : null }));
  const labels = memberLabels(named);
  const values = [...labels.values()];
  return named.map(row => { const base = labels.get(String(row.id))!;
    const label = (!row.name && !row.email) ? `Account #${row.id}` : values.filter(v => v.toLowerCase() === base.toLowerCase()).length > 1 ? `${base} · Account #${row.id}` : base;
    return { userId: row.id, label };
  });
}

async function response(q: RequestSqlClient, ctx: ActorContext): Promise<ProjectSharingResponse> {
  const canManage = manager(ctx);
  return { projectId: `proj_${ctx.project.id}`, programId: ctx.programId ?? ctx.project.regulatoryProgramId ?? null,
    organizationId: ctx.organizationId, clientWorkspaceId: ctx.project.clientWorkspaceId ?? null, actorUserId: ctx.actorUserId,
    visibility: ctx.snapshot.sharing.visibility, legacyFallbackApplied: ctx.snapshot.sharing.legacyFallbackApplied,
    members: memberRows(ctx, canManage), canManage, candidates: canManage ? await candidates(q, ctx.organizationId) : [] };
}

const fingerprint = (ctx: ActorContext) => JSON.stringify({ projectId: ctx.project.id, workspace: ctx.project.clientWorkspaceId,
  status: ctx.project.status, owner: ctx.project.ownerId, creator: ctx.project.createdById, raw: ctx.snapshot.raw, visibility: ctx.snapshot.sharing.visibility, role: ctx.role });

export async function readProjectSharing(req: Request): Promise<ProjectSharingResponse> {
  const q = requestPgClient(req);
  const before = await context(req, q);
  const data = await response(q, before);
  const after = await context(req, q);
  if (fingerprint(before) !== fingerprint(after)) throw new ProjectAdmissionRefusal(503, 'PROJECT_ACCESS_CHANGED', 'Project sharing changed during the read. Read it again before making a change.');
  return data;
}

function mutableMember(ctx: ActorContext, userId: number): Row | undefined {
  const row = ctx.snapshot.raw.find(member => member.user_id === userId);
  if (userId === ctx.project.ownerId || userId === ctx.project.createdById || row?.role === 'owner') {
    throw new ProjectAdmissionRefusal(409, 'PROJECT_OWNER_PROTECTED', 'Owner and creator access is managed separately. No membership change was made.');
  }
  return row;
}

async function applyCommand(q: RequestSqlClient, ctx: ActorContext, command: SharingCommand): Promise<void> {
  if (command.kind === 'visibility') {
    const written = await q.query(`INSERT INTO project_visibility_settings(project_id,organization_id,visibility,updated_by_id)
      VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO UPDATE SET visibility=EXCLUDED.visibility,updated_by_id=EXCLUDED.updated_by_id,updated_at=now()
      WHERE project_visibility_settings.organization_id=EXCLUDED.organization_id RETURNING id`, [ctx.project.id,ctx.organizationId,command.visibility,ctx.actorUserId]);
    if (written.rows.length !== 1) throw unavailable();
    return;
  }
  const member = mutableMember(ctx, command.userId);
  if (command.kind === 'revoke') {
    if (!member || member.status !== 'active') throw new ProjectAdmissionRefusal(409, 'PROJECT_SHARE_NOT_ACTIVE', 'No active explicit share can be revoked. Read the saved sharing state.');
    const written = await q.query("UPDATE project_members SET status='revoked',updated_at=now() WHERE id=$1 AND organization_id=$2 AND status='active' RETURNING id", [member.id, ctx.organizationId]);
    if (written.rows.length !== 1) throw unavailable();
    return;
  }
  try { await readCsrProjectActor(q, ctx.organizationId, command.userId, { forShare: true }); }
  catch (error) {
    if ((error as { status?: number })?.status === 403) throw new ProjectAdmissionRefusal(403, 'PROJECT_RECIPIENT_NOT_ACTIVE', 'The recipient is not a current active member of this organization. Nothing was changed.');
    throw error;
  }
  const written = await q.query(`INSERT INTO project_members(project_id,organization_id,user_id,role,status,invited_by_id,accepted_at)
    VALUES($1,$2,$3,$4,'active',$5,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active',
    invited_by_id=CASE WHEN project_members.status='revoked' THEN EXCLUDED.invited_by_id ELSE project_members.invited_by_id END,
    accepted_at=CASE WHEN project_members.status='revoked' THEN EXCLUDED.accepted_at ELSE project_members.accepted_at END,updated_at=now()
    WHERE project_members.organization_id=EXCLUDED.organization_id RETURNING id`, [ctx.project.id,ctx.organizationId,command.userId,command.role,ctx.actorUserId]);
  if (written.rows.length !== 1) throw unavailable();
}

export async function changeProjectSharing(req: Request, command: SharingCommand) {
  const q = requestPgClient(req);
  const client = await requestConnectable(req).connect();
  let began = false;
  let committing = false;
  try {
    await client.query('BEGIN'); began = true;
    const current = await context(req, q, true);
    if (!manager(current)) throw new ProjectAdmissionRefusal(403, 'PROJECT_MANAGE_PERMISSION_DENIED', 'Current project management permission is required. Nothing was changed.');
    const before = { sharing: { visibility: current.snapshot.sharing.visibility, members: current.snapshot.raw } };
    await applyCommand(q, current, command);
    current.snapshot = await sharingSnapshot(q, current.project);
    const data = await response(q, current);
    const after = { sharing: { visibility: current.snapshot.sharing.visibility, members: current.snapshot.raw } };
    committing = true; await client.query('COMMIT');
    return { data, before, after };
  } catch (error) {
    let uncertain = !began || committing;
    if (began && !committing) { try { await client.query('ROLLBACK'); } catch { uncertain = true; } }
    if (uncertain) {
      try { await q.discard?.(error instanceof Error ? error : new Error('Sharing transaction unconfirmed')); } catch { /* Keep the uncertain outcome visible even if eviction fails. */ }
      throw new ProjectAdmissionRefusal(503, 'PROJECT_SHARING_UNCONFIRMED', 'The server could not confirm the sharing change. Read the saved state before retrying.');
    }
    throw error;
  } finally { client.release(); }
}

function failure(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
  if (error instanceof ProjectAdmissionRefusal) return sendError(res, error.status, error.message, undefined, error.code);
  return sendError(res, 503, 'Project sharing could not be verified. Read the current state before trying again.', undefined, 'PROJECT_SHARING_UNAVAILABLE');
}

/** Same registered routes, with current admission, preserved history and audit metadata. */
export function installProjectSharingRoutes(router: Router): void {
  router.get('/projects/:id/sharing', async (req, res) => {
    try { return sendSuccess(res, await readProjectSharing(req)); } catch (error) { return failure(res, error); }
  });
  const write = (kind: SharingCommand['kind']) => async (req: Request, res: Response) => {
    try {
      const command: SharingCommand = kind === 'visibility' ? { kind, ...visibilitySchema.parse(req.body) }
        : kind === 'member' ? { kind, userId: idSchema.parse(req.params.userId), ...memberSchema.parse(req.body) }
          : { kind, userId: idSchema.parse(req.params.userId) };
      const saved = await changeProjectSharing(req, command);
      const audit = await logAuditEntry(req, 'UPDATE', 'project', String(saved.data.projectId.slice(5)), saved.before, saved.after);
      return sendSuccess(res, saved.data, { auditTrail: auditTrailFromEntry(audit) });
    } catch (error) { return failure(res, error); }
  };
  router.put('/projects/:id/sharing/members/:userId', write('member'));
  router.delete('/projects/:id/sharing/members/:userId', write('revoke'));
  router.patch('/projects/:id/sharing/visibility', write('visibility'));
}
