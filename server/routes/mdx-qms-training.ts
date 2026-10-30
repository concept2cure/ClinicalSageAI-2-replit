/**
 * QMS training routes under /api/mdx/qms, mounted by mdx-qms.ts
 * (docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.8): the training reads,
 * and the organization's job roles and who holds them (P-49).
 *
 *   GET    /api/mdx/qms/training                         list training records
 *   GET    /api/mdx/qms/training/expiring                periodic refresh due
 *   GET    /api/mdx/qms/training/compliance              read-and-understood per procedure
 *   GET    /api/mdx/qms/job-roles                        roles, members, roster
 *   POST   /api/mdx/qms/job-roles                        create a role
 *   PATCH  /api/mdx/qms/job-roles/:id                    rename / describe it
 *   DELETE /api/mdx/qms/job-roles/:id                    delete it (soft)
 *   POST   /api/mdx/qms/job-roles/:id/members            add a member
 *   DELETE /api/mdx/qms/job-roles/:id/members/:userId    remove a member (soft)
 *   GET    /api/mdx/qms/documents/:id/training-assignments                  who must train on it
 *   POST   /api/mdx/qms/documents/:id/training-assignments                  assign a role or a person
 *   DELETE /api/mdx/qms/documents/:id/training-assignments/:assignmentId    withdraw one (soft)
 *
 * Who may (decision D4). Reads: every member of the organization, except that
 * a document's people assigned are listed in full only to administrators and
 * designated QMS approvers; anyone else gets their own line and the count
 * (P-50 Q3). Job-role
 * writes: an administrator only (ADMINISTRATOR_ROLES, the set
 * authorizeOrgAccess uses), because who holds a job role decides who must
 * train on a document and who may read it (D3), which is an access decision.
 * A document's assignments: an administrator, or a designated QMS approver
 * (isQmsDesignatedApprover, with its Approver-role stand-in), the existing
 * quality authority; plain editor access is not enough, because removing an
 * assignment shrinks who must train. The role is the persisted
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
import { GOVERNED_WRITE_ROLES, requireEditorAccess } from '../middleware/orgMembership';
import { ADMINISTRATOR_ROLES } from '../services/tenant/membership-change';
import { isQmsDesignatedApprover } from '../services/qms/qms-approver-designation';
import {
  GovernedRefusal, governedQmsActor, governedQmsReason, governedQmsWrite,
  type GovernedQmsCommand, type GovernedQmsSubject,
} from '../services/qms/governed-qms-write';
import {
  currentStanding, QmsTrainingRefused, readQmsTrainingCompliance, readQmsTrainingExpiring, summarizeQmsTrainingCompliance,
  type TrainingSqlClient,
} from '../services/qms/training';
import {
  addQmsJobRoleMember, addQmsTrainingAssignment, createQmsJobRole, deleteQmsJobRole, readQmsJobRoles, readQmsTrainingAssignments,
  readTrainingDocument, removeQmsJobRoleMember, removeQmsTrainingAssignment, trainingAssignmentRefusal, updateQmsJobRole,
  type TrainingStoreChange,
} from '../services/qms/training-assignment';
import type { QmsDocumentRow } from '../services/qms/document-approval-signature';
import {
  qmsGovernedRemovalSchema, qmsJobRoleCreateSchema, qmsJobRoleMemberSchema, qmsJobRoleUpdateSchema, qmsTrainingAssignmentSchema,
} from '../../shared/qms/training';
import { getOrgId, getUserId, positiveId, qmsClient } from './mdx-qms-context';

const router = Router();
const log = createScopedLogger('mdx-qms-training');

const JOB_ROLE: GovernedQmsSubject = {
  noun: 'job role',
  changeWhat: 'a job role or who holds it',
  inUse: { error: 'QMS_JOB_ROLE_IN_USE', referrers: 'training assignments' },
  logLabel: 'QMS job role',
  logger: log,
};

const ASSIGNMENT: GovernedQmsSubject = {
  noun: 'training assignment',
  changeWhat: 'who must train on a controlled document',
  inUse: { error: 'QMS_TRAINING_ASSIGNMENT_CONFLICT', referrers: 'other records' },
  logLabel: 'QMS training assignment',
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
 * The organization first: one pending deletion, past due or cancelled is
 * read-only (as recordAcknowledgement refuses in training.ts), and the
 * lifecycle guard's cached posture (tenant-lifecycle.ts, 60 s) is not the last
 * word on a write.
 */
function postureRefusal(standing: Standing): GovernedRefusal | null {
  return standing.decision === 'allow' ? null : new GovernedRefusal(403, { error: standing.code, message: `${standing.reason} Nothing was changed.` });
}

const isAdministrator = (standing: Standing) => ADMINISTRATOR_ROLES.includes(standing.membershipRole ?? '');

/** Why this standing may not change job roles, or null when it may: the organization's standing, then D4, an administrator only. */
function jobRoleRefusal(standing: Standing): GovernedRefusal | null {
  const posture = postureRefusal(standing);
  if (posture) return posture;
  if (!isAdministrator(standing)) {
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

/**
 * Why this standing may not change a document's training assignments, or null
 * when it may: the organization's standing; then editor access, on the role
 * read here (a QMS designation is not cleared when its holder's role changes,
 * so a designee demoted to viewer is refused on this read, under the lock, and
 * not only by requireEditorAccess before the transaction); then D4, an
 * administrator or a designated QMS approver (with the Approver-role stand-in
 * while the organization has designated nobody). A manager is not admitted.
 */
async function assignerRefusal(client: TrainingSqlClient, orgId: number, userId: number, standing: Standing): Promise<GovernedRefusal | null> {
  const posture = postureRefusal(standing);
  if (posture) return posture;
  const authorized = GOVERNED_WRITE_ROLES.has(standing.membershipRole ?? '')
    && (isAdministrator(standing) || await isQmsDesignatedApprover(client, orgId, userId));
  if (authorized) return null;
  return new GovernedRefusal(403, {
    error: 'QMS_TRAINING_ASSIGN_AUTHORITY',
    message: 'Only an administrator or a designated QMS approver who can edit changes who must train on a controlled document. Nothing was changed.',
  });
}

/** D4 for assignments, on the write's own transaction: the standing is read FOR SHARE, so a demotion committed meanwhile is seen. */
async function requireTrainingAssigner(client: TrainingSqlClient, orgId: number, userId: number): Promise<void> {
  const refusal = await assignerRefusal(client, orgId, userId, await standingOf(client, orgId, userId, true));
  if (refusal) throw refusal;
}

/** A refusal is "may not"; a check that could not run (5xx) is not, so it reads as unknown. */
const refusedOrUnknown = (refusal: GovernedRefusal): false | null => (refusal.status >= 500 ? null : false);

/**
 * Whether the viewer may change this document's assignments: the authority,
 * then the document's own refusals (trainable, in use, readable by them).
 * null when that could not be checked: an error is never shown as "may not".
 */
async function canAssignTraining(client: TrainingSqlClient, orgId: number, userId: number | null, document: QmsDocumentRow): Promise<boolean | null> {
  if (userId === null) return false;
  try {
    const authority = await assignerRefusal(client, orgId, userId, await standingOf(client, orgId, userId, false));
    if (authority) return refusedOrUnknown(authority);
    const refusal = await trainingAssignmentRefusal(client, orgId, userId, document);
    return refusal ? refusedOrUnknown(refusal) : true;
  } catch (error) {
    if (error instanceof GovernedRefusal) return refusedOrUnknown(error);
    throw error;
  }
}

/**
 * P-50 Q3: training person by person (who must train, their receipts, their
 * lapses) is for administrators and designated QMS approvers (with the
 * Approver-role stand-in); every other member sees their own and the counts.
 * The assignment listing, the training records and the expiry read all ask this.
 */
async function seesEveryAssignee(client: TrainingSqlClient, orgId: number, userId: number | null): Promise<boolean> {
  if (userId === null) return false;
  try {
    const standing = await standingOf(client, orgId, userId, false);
    return isAdministrator(standing) || await isQmsDesignatedApprover(client, orgId, userId);
  } catch (error) {
    if (error instanceof GovernedRefusal) return false;
    throw error;
  }
}

interface StoreWrite<T> {
  command: GovernedQmsCommand;
  status: 200 | 201;
  /** Path parameters that must be positive integers, in the order `run` takes them. */
  params: readonly string[];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  failure: string;
  run: (client: TrainingSqlClient, orgId: number, actorId: number, body: T, ids: number[]) => Promise<TrainingStoreChange>;
}

interface StoreAuthority {
  subject: GovernedQmsSubject;
  /** D4, inside the transaction, before the change. */
  authorize: (client: TrainingSqlClient, orgId: number, userId: number) => Promise<void>;
}

const JOB_ROLE_AUTHORITY: StoreAuthority = { subject: JOB_ROLE, authorize: requireJobRoleAdministrator };
const ASSIGNMENT_AUTHORITY: StoreAuthority = { subject: ASSIGNMENT, authorize: requireTrainingAssigner };

/** Ids, reason, actor, body, then one governed transaction with the authority check inside it. */
async function storeWrite<T>(req: Request, res: Response, authority: StoreAuthority, spec: StoreWrite<T>): Promise<unknown> {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const ids = spec.params.map(p => positiveId(req.params[p]));
  if (ids.some(id => id === null)) {
    return res.status(422).json({ error: 'QMS_TRAINING_INPUT_INVALID', message: `${spec.params.join(' and ')} must be a positive integer. Nothing was changed.` });
  }
  const reason = governedQmsReason(req, res, authority.subject);
  if (reason === null) return;
  const userId = governedQmsActor(req, res, authority.subject);
  if (userId === null) return;
  const parsed = spec.schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: 'QMS_TRAINING_INPUT_INVALID',
      message: `${parsed.error.issues[0]?.message ?? 'The request is not valid.'} Nothing was changed.`,
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  await governedQmsWrite(req, res, authority.subject, { orgId, userId, reason, command: spec.command, failure: spec.failure }, async () => {
    const client = requestPgClient(req);
    await authority.authorize(client, orgId, userId);
    const change = await spec.run(client, orgId, userId, parsed.data, ids as number[]);
    return { target: change.target, payload: change.payload, status: spec.status, body: { data: change.data } };
  });
}

const jobRoleWrite = <T>(req: Request, res: Response, spec: StoreWrite<T>) => storeWrite(req, res, JOB_ROLE_AUTHORITY, spec);
const assignmentWrite = <T>(req: Request, res: Response, spec: StoreWrite<T>) => storeWrite(req, res, ASSIGNMENT_AUTHORITY, spec);

/* ─── Training records, expiry and compliance (moved unchanged from mdx-qms.ts) ─── */

/* Training records, person by person: every member's for an administrator or a
   designated QMS approver, otherwise the reader's own (P-50 Q3). */
router.get('/qms/training', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const userId = getUserId(req);
    const everyone = await seesEveryAssignee(requestPgClient(req), orgId, userId);
    const { rows } = everyone
      ? await qmsClient(req).query(`SELECT * FROM qms_training_records WHERE organization_id = $1
          ORDER BY acknowledged_at DESC LIMIT 500`, [orgId])
      : await qmsClient(req).query(`SELECT * FROM qms_training_records WHERE organization_id = $1 AND user_id = $2
          ORDER BY acknowledged_at DESC LIMIT 500`, [orgId, userId ?? 0]);
    return ok(res, rows, { count: rows.length, scope: everyone ? 'everyone' : 'own' });
  } catch (err) { return serverError(res, log, 'training-list', err); }
});

router.get('/qms/training/expiring', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const withinDays = Math.max(1, Math.min(365, Number(req.query.within) || 60));
  /* G10 (2026-10-29). Each person assigned whose current training on a release in
     force lapses within the window, read as coverage reads it. This listed every
     record with an expiry inside the window: a superseded version, a receipt
     its member had renewed, a departed member's. No client called it. Person by
     person, it is for administrators and designated QMS approvers; anyone else
     gets their own rows (P-50 Q3). */
  try {
    const client = requestPgClient(req);
    const userId = getUserId(req);
    const everyone = await seesEveryAssignee(client, orgId, userId);
    const rows = (await readQmsTrainingExpiring(client, orgId, withinDays)).filter(r => everyone || r.userId === userId);
    return ok(res, rows, { count: rows.length, withinDays, scope: everyone ? 'everyone' : 'own' });
  } catch (err) { return serverError(res, log, 'training-expiring', err); }
});

/* Read-and-understood compliance per controlled procedure (P-49). The
   denominator is the distinct active people assigned to the document; the
   numerator, those of them with a current acknowledgment of the release in
   force. A document assigned to nobody has no figure. Each row carries the
   reader's own line, and meta.summary is the register's one training figure.
   Counts only, so every member may read it (P-50 Q3). Only trainable doc types
   are counted: forms and specifications carry no read-and-understood. */
router.get('/qms/training/compliance', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const rows = await readQmsTrainingCompliance(requestPgClient(req), orgId, new Date(), getUserId(req));
    return ok(res, rows, { count: rows.length, summary: summarizeQmsTrainingCompliance(rows) });
  } catch (err) { return serverError(res, log, 'training-compliance', err); }
});

/* ─── Job roles and who holds them (P-49) ─── */

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

/* ─── Who must train on each controlled document (P-49) ─── */

/* /qms/documents/:id (mdx-qms.ts) matches one path segment, so these deeper
   paths are not captured by it although this router is mounted after it. */
router.get('/qms/documents/:id/training-assignments', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const documentId = positiveId(req.params.id);
  if (documentId === null) return res.status(422).json({ error: 'QMS_TRAINING_INPUT_INVALID', message: 'id must be a positive integer.' });
  try {
    const client = requestPgClient(req);
    const document = await readTrainingDocument(client, orgId, documentId);
    if (!document) return res.status(404).json({ error: 'QMS_DOCUMENT_NOT_FOUND', message: 'Document not found in this organization.' });
    const userId = getUserId(req);
    const listing = await readQmsTrainingAssignments(client, orgId, document, { userId, seesEveryone: await seesEveryAssignee(client, orgId, userId) });
    return ok(res, { ...listing, canAssign: await canAssignTraining(client, orgId, userId, document) });
  } catch (err) { return serverError(res, log, 'training-assignments-list', err); }
});

router.post('/qms/documents/:id/training-assignments', requireEditorAccess, (req: Request, res: Response) => assignmentWrite(req, res, {
  command: 'create', status: 201, params: ['id'], schema: qmsTrainingAssignmentSchema, failure: 'QMS_TRAINING_ASSIGN_FAILED',
  run: (client, orgId, actorId, body, [documentId]) => addQmsTrainingAssignment(client, orgId, actorId, documentId, body),
}));

router.delete('/qms/documents/:id/training-assignments/:assignmentId', requireEditorAccess, (req: Request, res: Response) => assignmentWrite(req, res, {
  command: 'delete', status: 200, params: ['id', 'assignmentId'], schema: qmsGovernedRemovalSchema, failure: 'QMS_TRAINING_UNASSIGN_FAILED',
  run: (client, orgId, actorId, _body, [documentId, assignmentId]) => removeQmsTrainingAssignment(client, orgId, actorId, documentId, assignmentId),
}));

export default router;
