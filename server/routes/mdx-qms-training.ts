/**
 * QMS training routes under /api/mdx/qms, mounted by mdx-qms.ts
 * (docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.8). Slice 1: the
 * organization's job roles and who holds them (P-49).
 *
 *   GET    /api/mdx/qms/job-roles                        roles, members, roster
 *   POST   /api/mdx/qms/job-roles                        create a role
 *   PATCH  /api/mdx/qms/job-roles/:id                    rename / describe it
 *   DELETE /api/mdx/qms/job-roles/:id                    delete it (soft)
 *   POST   /api/mdx/qms/job-roles/:id/members            add a member
 *   DELETE /api/mdx/qms/job-roles/:id/members/:userId    remove a member (soft)
 *
 * Who may (decision D4). Reads: every member of the organization. Writes: an
 * administrator only (ADMINISTRATOR_ROLES, the set authorizeOrgAccess uses),
 * because who holds a job role decides who must train on a document and who
 * may read it (D3), which is an access decision. The role is the persisted
 * membership role, read on the request client inside the write's transaction
 * under FOR SHARE (currentStanding), so a demotion committed meanwhile cannot
 * slip between the check and the write. requireEditorAccess still runs first,
 * so a viewer is refused as on every governed write. A manager is not admitted.
 * The same read refuses an organization that is not in good standing (pending
 * deletion, past due, cancelled: read-only), whatever the lifecycle guard's
 * cached posture says, and `canAdminister` answers from the same rule.
 *
 * Every write runs governedQmsWrite: a reason of at least 8 characters, the
 * acting user, a strict body, then BEGIN → tenant vars → the change → its
 * ledger pair → COMMIT on the request client. A refusal decided inside the
 * transaction rolls back with nothing written.
 *
 * @module server/routes/mdx-qms-training
 */
import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { requestPgClient } from '../db/requestDb';
import { requireEditorAccess } from '../middleware/orgMembership';
import { ADMINISTRATOR_ROLES } from '../services/tenant/membership-change';
import {
  GovernedRefusal, governedQmsActor, governedQmsReason, governedQmsWrite,
  type GovernedQmsCommand, type GovernedQmsSubject,
} from '../services/qms/governed-qms-write';
import { currentStanding, QmsTrainingRefused, type TrainingSqlClient } from '../services/qms/training';
import {
  addQmsJobRoleMember, createQmsJobRole, deleteQmsJobRole, readQmsJobRoles, removeQmsJobRoleMember, updateQmsJobRole,
  type JobRoleChange,
} from '../services/qms/training-assignment';
import {
  qmsGovernedRemovalSchema, qmsJobRoleCreateSchema, qmsJobRoleMemberSchema, qmsJobRoleUpdateSchema,
} from '../../shared/qms/training';
import { getOrgId, getUserId, positiveId } from './mdx-qms-context';

const router = Router();
const log = createScopedLogger('mdx-qms-training');

const JOB_ROLE: GovernedQmsSubject = {
  noun: 'job role',
  changeWhat: 'a job role or who holds it',
  inUse: { error: 'QMS_JOB_ROLE_IN_USE', referrers: 'training assignments' },
  logLabel: 'QMS job role',
  logger: log,
};

type Standing = Awaited<ReturnType<typeof currentStanding>>;

/** The actor's persisted standing in this organization, or a refusal the transaction rolls back on. */
async function standingOf(client: TrainingSqlClient, orgId: number, userId: number, lock: boolean): Promise<Standing> {
  try {
    return await currentStanding(client, { organizationId: orgId, userId }, lock);
  } catch (error) {
    if (error instanceof QmsTrainingRefused) throw new GovernedRefusal(error.status, { error: error.code, message: `${error.message} Nothing was changed.` });
    throw error;
  }
}

/**
 * Why this standing may not change job roles, or null when it may. The
 * organization first: one pending deletion, past due or cancelled is read-only
 * (as recordAcknowledgement refuses in training.ts), and the lifecycle guard's
 * cached posture (tenant-lifecycle.ts, 60 s) is not the last word on a write.
 * Then D4: an administrator only.
 */
function jobRoleRefusal(standing: Standing): GovernedRefusal | null {
  if (standing.decision !== 'allow') return new GovernedRefusal(403, { error: standing.code, message: `${standing.reason} Nothing was changed.` });
  if (!ADMINISTRATOR_ROLES.includes(standing.membershipRole ?? '')) {
    return new GovernedRefusal(403, {
      error: 'QMS_JOB_ROLE_AUTHORITY',
      message: 'Only an administrator changes the job roles and who holds them. Nothing was changed.',
    });
  }
  return null;
}

/** D4, on the write's own transaction: the standing is read FOR SHARE, so a demotion committed meanwhile is seen. */
async function requireJobRoleAdministrator(client: TrainingSqlClient, orgId: number, userId: number): Promise<void> {
  const refusal = jobRoleRefusal(await standingOf(client, orgId, userId, true));
  if (refusal) throw refusal;
}

/** Whether the viewer may administer job roles, for the screen to offer only what the server admits. */
async function canAdministerJobRoles(client: TrainingSqlClient, orgId: number, userId: number | null): Promise<boolean> {
  if (userId === null) return false;
  try {
    return jobRoleRefusal(await standingOf(client, orgId, userId, false)) === null;
  } catch (error) {
    if (error instanceof GovernedRefusal) return false;
    throw error;
  }
}

interface JobRoleWrite<T> {
  command: GovernedQmsCommand;
  status: 200 | 201;
  /** Path parameters that must be positive integers, in the order `run` takes them. */
  params: readonly string[];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  failure: string;
  run: (client: TrainingSqlClient, orgId: number, actorId: number, body: T, ids: number[]) => Promise<JobRoleChange>;
}

/** Ids, reason, actor, body, then one governed transaction with the administrator check inside it. */
async function jobRoleWrite<T>(req: Request, res: Response, spec: JobRoleWrite<T>): Promise<unknown> {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const ids = spec.params.map(p => positiveId(req.params[p]));
  if (ids.some(id => id === null)) {
    return res.status(422).json({ error: 'QMS_TRAINING_INPUT_INVALID', message: `${spec.params.join(' and ')} must be a positive integer. Nothing was changed.` });
  }
  const reason = governedQmsReason(req, res, JOB_ROLE);
  if (reason === null) return;
  const userId = governedQmsActor(req, res, JOB_ROLE);
  if (userId === null) return;
  const parsed = spec.schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: 'QMS_TRAINING_INPUT_INVALID',
      message: `${parsed.error.issues[0]?.message ?? 'The request is not valid.'} Nothing was changed.`,
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  await governedQmsWrite(req, res, JOB_ROLE, { orgId, userId, reason, command: spec.command, failure: spec.failure }, async () => {
    const client = requestPgClient(req);
    await requireJobRoleAdministrator(client, orgId, userId);
    const change = await spec.run(client, orgId, userId, parsed.data, ids as number[]);
    return { target: change.target, payload: change.payload, status: spec.status, body: { data: change.data } };
  });
}

router.get('/qms/job-roles', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const client = requestPgClient(req);
    const listing = await readQmsJobRoles(client, orgId);
    return ok(res, { ...listing, canAdminister: await canAdministerJobRoles(client, orgId, getUserId(req)) });
  } catch (err) { return serverError(res, log, 'job-roles-list', err); }
});

router.post('/qms/job-roles', requireEditorAccess, (req: Request, res: Response) => jobRoleWrite(req, res, {
  command: 'create', status: 201, params: [], schema: qmsJobRoleCreateSchema, failure: 'QMS_JOB_ROLE_CREATE_FAILED',
  run: (client, orgId, actorId, body) => createQmsJobRole(client, orgId, actorId, body),
}));

router.patch('/qms/job-roles/:id', requireEditorAccess, (req: Request, res: Response) => jobRoleWrite(req, res, {
  command: 'update', status: 200, params: ['id'], schema: qmsJobRoleUpdateSchema, failure: 'QMS_JOB_ROLE_UPDATE_FAILED',
  run: (client, orgId, actorId, body, [roleId]) => updateQmsJobRole(client, orgId, actorId, roleId, body),
}));

router.delete('/qms/job-roles/:id', requireEditorAccess, (req: Request, res: Response) => jobRoleWrite(req, res, {
  command: 'delete', status: 200, params: ['id'], schema: qmsGovernedRemovalSchema, failure: 'QMS_JOB_ROLE_DELETE_FAILED',
  run: (client, orgId, actorId, _body, [roleId]) => deleteQmsJobRole(client, orgId, actorId, roleId),
}));

router.post('/qms/job-roles/:id/members', requireEditorAccess, (req: Request, res: Response) => jobRoleWrite(req, res, {
  command: 'create', status: 201, params: ['id'], schema: qmsJobRoleMemberSchema, failure: 'QMS_JOB_ROLE_MEMBER_ADD_FAILED',
  run: (client, orgId, actorId, body, [roleId]) => addQmsJobRoleMember(client, orgId, actorId, roleId, body.userId),
}));

router.delete('/qms/job-roles/:id/members/:userId', requireEditorAccess, (req: Request, res: Response) => jobRoleWrite(req, res, {
  command: 'delete', status: 200, params: ['id', 'userId'], schema: qmsGovernedRemovalSchema, failure: 'QMS_JOB_ROLE_MEMBER_REMOVE_FAILED',
  run: (client, orgId, actorId, _body, [roleId, userId]) => removeQmsJobRoleMember(client, orgId, actorId, roleId, userId),
}));

export default router;
