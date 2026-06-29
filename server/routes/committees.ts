/**
 * Research Committee Governance API — Capability C2C-16
 *
 * Governed, RBAC-gated committee operations: membership, meetings, attendance,
 * agenda items, per-member polling/voting, and the finalized determination.
 * Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped.
 * Role-specific privileges are enforced with the platform RBAC engine
 * (can(orgId, role, {action, resourceType:'committee'})): assigning members /
 * convening / agenda needs 'assign'; voting needs 'review'; finalizing a
 * determination needs 'approve' AND current CITI training. Mounted at
 * /api/committees.
 *
 * @module server/routes/committees
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { can } from '../services/governance/permissions';
import {
  addCommitteeMemberTx,
  listCommitteeMembers,
  getCompositionStatus,
  createMeetingTx,
  conveneMeetingTx,
  addAgendaItemTx,
  castVoteTx,
  finalizeAgendaItemTx,
  getActorTrainingStatus,
  listMeetings,
  getMeeting,
  getProtocolPortfolio,
  CommitteeError,
} from '../services/committees/committee-service';
import { recordCommitteeMemberAdded, recordCommitteeMeetingConvened, recordCommitteeVote, recordCommitteeDetermination } from '../services/committee-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

const router = Router();

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
function resolveRole(req: Request): string {
  const r = req as any;
  return String(r.userRole ?? r.user?.role ?? r.tenantContext?.role ?? '');
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400, NOT_TRAINED: 403 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const COMMITTEE = z.enum(['iacuc', 'irb', 'ibc']);

/** RBAC gate: 403 unless the actor's role grants `action` on a committee resource. Returns true when allowed. */
async function ensureCan(req: Request, res: Response, orgId: number, action: string): Promise<boolean> {
  const role = resolveRole(req);
  if (await can(orgId, role, { action, resourceType: 'committee' })) return true;
  res.status(403).json({ error: { code: 'NOT_AUTHORIZED', message: `Your role (${role || 'none'}) does not hold ${action} privilege for committee actions.` } });
  return false;
}

async function governed(
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
    await setTenantContextTx(client, orgId, resolveRole(req));
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'committee' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Members ─────────────────────────────────────────────────────────────────

const memberSchema = z.object({
  committeeType: COMMITTEE,
  memberName: z.string().min(1).max(300),
  role: z.enum(['chair', 'vice_chair', 'member', 'veterinarian', 'nonscientist', 'community_member', 'coordinator', 'administrator']).optional(),
  userId: z.number().int().positive().optional(),
  personnelId: z.number().int().positive().optional(),
  votingMember: z.boolean().optional(),
  scientist: z.boolean().optional(),
  affiliated: z.boolean().optional(),
  startDate: z.string().optional(),
  reason,
});
router.post('/members', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  if (!(await ensureCan(req, res, orgId, 'assign'))) return;
  const parsed = memberSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'assign', parsed.data.reason, async (client, oid, userId) => {
    const { id } = await addCommitteeMemberTx(client, oid, userId, parsed.data);
    recordCommitteeMemberAdded(parsed.data.committeeType);
    return { target: `committee:${parsed.data.committeeType}`, payload: { memberId: id, role: parsed.data.role }, body: { id } };
  });
});

router.get('/members', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listCommitteeMembers(orgId, typeof req.query.committeeType === 'string' ? req.query.committeeType : undefined)); } catch (err) { fail(res, err); }
});

router.get('/:committeeType/composition', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = COMMITTEE.safeParse(req.params.committeeType);
  if (!parsed.success) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid committee type.' } });
  try { res.json(await getCompositionStatus(orgId, parsed.data)); } catch (err) { fail(res, err); }
});

// ─── Meetings ────────────────────────────────────────────────────────────────

const meetingSchema = z.object({ committeeType: COMMITTEE, title: z.string().min(1).max(500), meetingDate: z.string().optional(), reason });
router.post('/meetings', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  if (!(await ensureCan(req, res, orgId, 'assign'))) return;
  const parsed = meetingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, oid, userId) => {
    const { id } = await createMeetingTx(client, oid, userId, parsed.data);
    return { target: `committee-meeting:${id}`, payload: { committeeType: parsed.data.committeeType }, body: { id } };
  });
});

const conveneSchema = z.object({ presentMemberIds: z.array(z.number().int().positive()).min(1), reason });
router.post('/meetings/:id/convene', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  if (!(await ensureCan(req, res, orgId, 'assign'))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = conveneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, oid) => {
    const quorum = await conveneMeetingTx(client, oid, id, parsed.data.presentMemberIds);
    recordCommitteeMeetingConvened('meeting', quorum.quorumMet);
    return { target: `committee-meeting:${id}`, payload: { quorumMet: quorum.quorumMet }, body: { id, quorum } };
  });
});

router.get('/meetings', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listMeetings(orgId, typeof req.query.committeeType === 'string' ? req.query.committeeType : undefined)); } catch (err) { fail(res, err); }
});

router.get('/meetings/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const m = await getMeeting(orgId, id);
    if (!m) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found.' } });
    res.json(m);
  } catch (err) { fail(res, err); }
});

// ─── Agenda items ────────────────────────────────────────────────────────────

const agendaSchema = z.object({
  protocolKind: z.enum(['iacuc_protocol', 'irb_submission']),
  protocolId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  reviewType: z.string().max(60).optional(),
  reason,
});
router.post('/meetings/:id/agenda', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  if (!(await ensureCan(req, res, orgId, 'assign'))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = agendaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, oid, userId) => {
    const { id: itemId } = await addAgendaItemTx(client, oid, userId, id, parsed.data);
    return { target: `committee-meeting:${id}`, payload: { agendaItemId: itemId, protocol: `${parsed.data.protocolKind}:${parsed.data.protocolId}` }, body: { meetingId: id, agendaItemId: itemId } };
  });
});

// ─── Votes (the poll) ────────────────────────────────────────────────────────

const voteSchema = z.object({
  memberId: z.number().int().positive(),
  vote: z.enum(['approve', 'approve_with_modifications', 'disapprove', 'abstain', 'recuse']),
  comment: z.string().max(2000).optional(),
  reason,
});
router.post('/agenda/:id/votes', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  if (!(await ensureCan(req, res, orgId, 'review'))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = voteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'review', parsed.data.reason, async (client, oid, userId) => {
    await castVoteTx(client, oid, userId, id, parsed.data.memberId, parsed.data.vote, parsed.data.comment);
    recordCommitteeVote(parsed.data.vote);
    return { target: `committee-agenda:${id}`, payload: { memberId: parsed.data.memberId, vote: parsed.data.vote }, body: { agendaItemId: id, memberId: parsed.data.memberId, vote: parsed.data.vote } };
  });
});

// ─── Finalize (gated: approve privilege + CITI training) ─────────────────────

router.post('/agenda/:id/finalize', async (req, res) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  if (!(await ensureCan(req, res, orgId, 'approve'))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  // CITI training gate — resolve the agenda item's committee type, then check the actor.
  try {
    const ct = await pool.query(`SELECT committee_type FROM committee_agenda_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, orgId]);
    if (ct.rows.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agenda item not found.' } });
    const training = await getActorTrainingStatus(orgId, userId, ct.rows[0].committee_type);
    if (!training.trained) {
      return res.status(403).json({ error: { code: 'NOT_TRAINED', message: `Cannot finalize: ${training.reason}` } });
    }
  } catch (err) { return fail(res, err); }
  await governed(req, res, 'sign', parsed.data.reason, async (client, oid, uid) => {
    const determination = await finalizeAgendaItemTx(client, oid, uid, id);
    recordCommitteeDetermination(determination.outcome);
    return { target: `committee-agenda:${id}`, payload: { outcome: determination.outcome }, body: { agendaItemId: id, ...determination } };
  });
});

// ─── Multi-protocol portfolio ────────────────────────────────────────────────

router.get('/portfolio', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await getProtocolPortfolio(orgId)); } catch (err) { fail(res, err); }
});

export default router;
