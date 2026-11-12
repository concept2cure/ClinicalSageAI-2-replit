/**
 * HA Interaction & Commitment API — Capability C2C-03
 *
 * Governed CRUD for agency meetings, their questions, and the commitments
 * (PMR/PMC/REMS) they spawn. Every mutation runs BEGIN → Tx → recordGovernedAction
 * → COMMIT, org-scoped from the verified request context. Commitments thread onto
 * the provenance spine in the service. Mounted at /api/ha-interactions.
 *
 * A commitment's fulfilment (2026-10-19, P-41) and its options read are
 * commitment-fulfil-route.ts, mounted here for the organisation's own
 * commitments: a PMR, PMC or REMS is fulfilled by a Part 11 signature naming
 * the sequence or Vault version that met it.
 *
 * @module server/routes/ha-interactions
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createInteractionTx,
  updateInteractionStatusTx,
  addQuestionTx,
  createCommitmentTx,
  addMilestoneTx,
  listInteractions,
  listCommitments,
  getInteractionReadinessInput,
  projectOfSubmission,
  submissionOfInteraction,
  subjectsOfCommitment,
  ORG_LEVEL,
} from '../services/ha-interactions/ha-service';
import { evaluateMeetingReadiness } from '../services/ha-interactions/ha-logic';
import { recordHaInteractionCreated, recordHaCommitmentCreated } from '../services/ha-metrics';
import { requestPgClient } from '../db/requestDb';
import { getCurrentAccessibleProgramScope } from '../services/c2c/current-program-access';
import { requireProjectAdmission, ProjectAdmissionRefusal } from './c2c/project-access';
import {
  answerFulfilmentFailure,
  commitmentsForRequest,
  fulfilCommitmentRoute,
  fulfilmentOptionsRoute,
  organisationViewerCapabilities,
  type CommitmentDoor,
} from './commitment-fulfil-route';
import { serverError } from '../lib/api-response';
import { requireEditorAccessForWrites } from '../middleware/orgMembership';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('ha-interactions');
// A viewer reads meetings and commitments and writes none of them: one gate for
// every write, as rim.ts (2026-10-18; until then any member could record or
// fulfil a postmarketing commitment). Communication's commitments tab writes
// through here.
router.use(requireEditorAccessForWrites);

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  serverError(res, log, 'handling the health-authority interaction request', err);
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the date as YYYY-MM-DD.');
/** A refused body, said as a sentence naming the field, so the person reads what to fix. */
function validationRefusal(res: Response, err: z.ZodError) {
  const first = err.issues[0];
  return res.status(400).json({
    error: { code: 'VALIDATION', message: `${first?.message ?? 'Invalid input.'} (${first?.path?.join('.') || 'request'}) Nothing was changed.`, details: err.flatten() },
  });
}

async function governedMutation(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The tenant scope on the transaction itself, as rim.ts sets it: the writes
    // below are checked by the tables' tenant policy under RLS_ENFORCE=on.
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'ha' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Interactions ────────────────────────────────────────────────────────────

const interactionSchema = z.object({
  interactionType: z.enum(['pre_ind', 'eop1', 'eop2', 'pre_nda', 'pre_bla', 'type_a', 'type_b', 'type_c', 'scientific_advice', 'other']),
  agency: z.enum(['fda', 'ema', 'pmda', 'mhra', 'other']),
  title: z.string().min(1).max(500),
  objective: z.string().max(4000).optional(),
  submissionId: z.number().int().positive().optional(),
  requestedDate: isoDate.optional(),
  scheduledDate: isoDate.optional(),
  reason,
});

/**
 * A meeting on a submission is changed only by someone who may change that
 * submission's project (P-39 step 4, 2026-10-30): the org editor gate alone
 * let any editor record or move a meeting on a program they cannot open.
 * Answers the refusal and returns false; true when admitted or when the
 * meeting names no submission.
 */
async function admitSubmissionWrite(req: Request, res: Response, orgId: number, submissionId: number | null | undefined,
  { forWrite = true, notFound = 'Interaction not found for this organization.' }: { forWrite?: boolean; notFound?: string } = {}): Promise<boolean> {
  if (submissionId == null) return true;
  // The submission's one project, read where AnA's commitment tools read it (ha-service.ts).
  const projectId = await projectOfSubmission(requestPgClient(req) as never, orgId, submissionId);
  if (projectId === null) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: forWrite ? 'That submission is not one of a project you may change. Nothing was recorded.' : notFound } });
    return false;
  }
  try { await requireProjectAdmission(req, String(projectId), forWrite); return true; } catch (err) {
    if (!(err instanceof ProjectAdmissionRefusal)) throw err;
    // A read refused is a meeting this person cannot see: said as not found, never confirmed.
    if (!forWrite) res.status(404).json({ error: { code: 'NOT_FOUND', message: notFound } });
    else res.status(err.status).json({ error: { code: err.code, message: `${err.message} Nothing was recorded.` } });
    return false;
  }
}

/** Admit a read or write of meeting `id` by its submission's project; answers the refusal and returns false. */
async function admitMeeting(req: Request, res: Response, id: number, forWrite: boolean): Promise<boolean> {
  const orgId = resolveOrgId(req);
  if (!orgId) return true; // governedMutation and the reads answer the missing identity themselves
  return meetingSubmission(req, orgId, id)
    .then((sub) => admitSubmissionWrite(req, res, orgId, sub, { forWrite }))
    .catch((err) => { fail(res, err); return false; });
}

const COMMITMENT_NOT_FOUND = 'Commitment not found here.';

/**
 * Admit a read or write of commitment `id` by the project of the submission it names, and of the meeting it was made
 * at (2026-11-12). Until then the organisation's editor role alone added a milestone to, or fulfilled, a commitment
 * on a program the person cannot open; a meeting has been admitted this way since P-39 step 4, and AnA's commitment
 * tools since 1ac146d37. Answers the refusal and returns false. A commitment that names neither is the
 * organisation's own, and one that is not here is left to the handler, which says so in its own words.
 */
async function admitCommitment(req: Request, res: Response, id: number, forWrite: boolean): Promise<boolean> {
  const orgId = resolveOrgId(req);
  if (!orgId) return true; // governedMutation and the fulfilment route answer the missing identity themselves
  try {
    const named = await subjectsOfCommitment(requestPgClient(req) as never, orgId, id);
    if (!named) return true;
    const how = { forWrite, notFound: COMMITMENT_NOT_FOUND };
    if (!(await admitSubmissionWrite(req, res, orgId, named.submissionId, how))) return false;
    if (named.sourceInteractionId == null) return true;
    return await admitSubmissionWrite(req, res, orgId, await meetingSubmission(req, orgId, named.sourceInteractionId), how);
  } catch (err) {
    fail(res, err);
    return false;
  }
}

router.post('/interactions', async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationRefusal(res, parsed.error);
  const orgId = resolveOrgId(req);
  if (orgId && !(await admitSubmissionWrite(req, res, orgId, parsed.data.submissionId).catch((err) => { fail(res, err); return false; }))) return;
  await governedMutation(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createInteractionTx(client, orgId, userId, parsed.data);
    recordHaInteractionCreated();
    return { target: `ha-interaction:${id}`, payload: { type: parsed.data.interactionType, agency: parsed.data.agency }, body: { id } };
  });
});

router.get('/interactions', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    // Only meetings this reader may see: none on a program they cannot open (P-39 step 4).
    const q = requestPgClient(req);
    const scope = await getCurrentAccessibleProgramScope(q as never, { organizationId: orgId, userId: resolveUserId(req) ?? undefined });
    res.json(await listInteractions(orgId, Number.isFinite(submissionId) ? submissionId : undefined, scope.programIds, q as never));
  } catch (err) {
    fail(res, err);
  }
});

const statusSchema = z.object({
  status: z.enum(['planned', 'requested', 'scheduled', 'held', 'minutes_received', 'closed', 'cancelled']),
  heldDate: isoDate.optional(),
  scheduledDate: isoDate.optional(),
  minutesReceivedDate: isoDate.optional(),
  /** The inbox letter (meeting minutes) that holds them; named with the move to minutes received. */
  minutesEventId: z.string().trim().min(1).max(120).optional(),
  reason,
});

/** The submission a meeting names, for its write admission; undefined when there is no such meeting here. */
async function meetingSubmission(req: Request, orgId: number, id: number): Promise<number | null | undefined> {
  return submissionOfInteraction(requestPgClient(req) as never, orgId, id);
}

router.patch('/interactions/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationRefusal(res, parsed.error);
  if (!(await admitMeeting(req, res, id, true))) return;
  await governedMutation(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await updateInteractionStatusTx(client, orgId, id, parsed.data.status, parsed.data);
    return { target: `ha-interaction:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

const questionSchema = z.object({
  questionNumber: z.number().int().positive(),
  questionText: z.string().min(1).max(4000),
  sponsorPosition: z.string().max(4000).optional(),
  agencyResponse: z.string().max(4000).optional(),
  agreementReached: z.boolean().optional(),
  reason,
});

router.post('/interactions/:id/questions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = questionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationRefusal(res, parsed.error);
  if (!(await admitMeeting(req, res, id, true))) return;
  await governedMutation(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: qid } = await addQuestionTx(client, orgId, userId, id, parsed.data);
    return { target: `ha-interaction:${id}`, payload: { questionId: qid }, body: { interactionId: id, questionId: qid } };
  });
});

router.get('/interactions/:id/readiness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  if (!(await admitMeeting(req, res, id, false))) return;
  try {
    // On the request's own client, as this route's other reads: a connection from
    // connect() carries no tenant before BEGIN, so this read found no meeting (2026-11-12).
    const input = await getInteractionReadinessInput(requestPgClient(req) as never, orgId, id);
    res.json(evaluateMeetingReadiness(input as any));
  } catch (err) {
    fail(res, err);
  }
});

// ─── Commitments ─────────────────────────────────────────────────────────────

const commitmentSchema = z.object({
  commitmentType: z.enum(['pmr', 'pmc', 'rems', 'meeting_commitment', 'other']),
  description: z.string().min(1).max(4000),
  submissionId: z.number().int().positive().optional(),
  sourceInteractionId: z.number().int().positive().optional(),
  regulatoryBasis: z.string().max(500).optional(),
  dueDate: z.string().optional(),
  reason,
});

router.post('/commitments', async (req, res) => {
  const parsed = commitmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationRefusal(res, parsed.error);
  // A commitment on a submission, or made at a meeting on one, is recorded by someone who may change its project.
  const org = resolveOrgId(req);
  if (org && !(await admitSubmissionWrite(req, res, org, parsed.data.submissionId).catch((err) => { fail(res, err); return false; }))) return;
  if (parsed.data.sourceInteractionId != null && !(await admitMeeting(req, res, parsed.data.sourceInteractionId, true))) return;
  await governedMutation(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, provenanceLinkIds } = await createCommitmentTx(client, orgId, userId, parsed.data);
    recordHaCommitmentCreated(parsed.data.commitmentType);
    return { target: `regulatory-commitment:${id}`, payload: { type: parsed.data.commitmentType, provenanceLinkIds }, body: { id, provenanceLinkIds } };
  });
});

router.get('/commitments', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    // On the request's tenant-pinned connection, projected per reader
    // (2026-10-19): evidence in a program this person cannot open is said to
    // exist and not named, and no raw fulfilment column is sent.
    // Only commitments this reader may see (2026-11-12): none that names a submission, or was made at a meeting
    // on one, of a program they cannot open. The meetings list beside it has been bound this way since P-39 step 4.
    const q = requestPgClient(req);
    const scope = await getCurrentAccessibleProgramScope(q as never, { organizationId: orgId, userId: resolveUserId(req) ?? undefined });
    const rows = await listCommitments(orgId, Number.isFinite(submissionId) ? submissionId : undefined, ORG_LEVEL, q as never, scope.programIds);
    res.json(await commitmentsForRequest(req, orgId, rows));
  } catch (err) {
    answerFulfilmentFailure(res, err);
  }
});

/* The organisation's door onto a commitment's fulfilment (P-41, 2026-10-19):
   its own commitments only (project_id IS NULL). A PMR, PMC or REMS is
   fulfilled by a signature naming what met it; anything else with a reason.
   The rules, the order of refusals and the body are commitment-fulfil-route.ts,
   shared with the project's door. requireEditorAccessForWrites above still
   gates the POST. */
const ORG_DOOR: CommitmentDoor = {
  scope: ORG_LEVEL,
  idParam: 'id',
  visible: () => true,
  viewer: organisationViewerCapabilities,
};

router.post('/commitments/:id/fulfill', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isInteger(id) && !(await admitCommitment(req, res, id, true))) return;
  await fulfilCommitmentRoute(req, res, ORG_DOOR);
});
router.get('/commitments/:id/fulfilment-options', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isInteger(id) && !(await admitCommitment(req, res, id, false))) return;
  await fulfilmentOptionsRoute(req, res, ORG_DOOR);
});

const milestoneSchema = z.object({ title: z.string().min(1).max(500), dueDate: z.string().optional(), reason });

router.post('/commitments/:id/milestones', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = milestoneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationRefusal(res, parsed.error);
  if (!(await admitCommitment(req, res, id, true))) return;
  await governedMutation(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: mid } = await addMilestoneTx(client, orgId, userId, id, parsed.data);
    return { target: `regulatory-commitment:${id}`, payload: { milestoneId: mid }, body: { commitmentId: id, milestoneId: mid } };
  });
});

export default router;
