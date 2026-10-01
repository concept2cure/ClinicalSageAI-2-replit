/**
 * IBC / Biosafety API — Capability C2C-07
 *
 * Governed CRUD for biosafety registrations, biological agents, and committee
 * determinations. Every mutation runs BEGIN → Tx → recordGovernedAction →
 * COMMIT, org-scoped from the verified request context. Approval threads a
 * provenance link to Module 4. Mounted at /api/ibc.
 *
 * @module server/routes/ibc
 */

import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { signGovernedAct, signedActAttempts } from './governed-signed-act';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { requireEditorAccessForWrites } from '../middleware/orgMembership';
import {
  createRegistrationTx,
  setRegistrationStatusTx,
  addAgentTx,
  recordReviewTx,
  listRegistrations,
  getContainmentInput,
} from '../services/ibc/ibc-service';
import { evaluateContainment, registrationExpiration, requiresConvenedReview } from '../services/ibc/ibc-logic';
import { recordIbcRegistrationCreated, recordIbcApproval, recordIbcAgentRegistered } from '../services/ibc-metrics';

const router = Router();
// A viewer reads these records and writes none of them: one gate for every
// write, as the ProtocolDev routers (P11-C-1). The signed review routes also
// check signing authority (P0-10b).
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
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const BSL = z.enum(['BSL-1', 'BSL-2', 'BSL-3', 'BSL-4']);
const SECTION = z.enum(['III-A', 'III-B', 'III-C', 'III-D', 'III-E', 'III-F', 'exempt', 'not_applicable']);

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
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'ibc' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const registrationSchema = z.object({
  registrationNumber: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  biosafetyLevel: BSL,
  nihGuidelinesSection: SECTION.optional(),
  submissionId: z.number().int().positive().optional(),
  involvesRecombinantDna: z.boolean().optional(),
  involvesHumanGeneTransfer: z.boolean().optional(),
  reason,
});

router.post('/registrations', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createRegistrationTx(client, orgId, userId, parsed.data);
    recordIbcRegistrationCreated(parsed.data.biosafetyLevel);
    const convened = requiresConvenedReview(parsed.data.nihGuidelinesSection ?? 'not_applicable', parsed.data.involvesHumanGeneTransfer === true);
    return { target: `ibc-registration:${id}`, payload: { bsl: parsed.data.biosafetyLevel }, body: { id, requiresConvenedReview: convened } };
  });
});

router.get('/registrations', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    res.json(await listRegistrations(orgId, Number.isFinite(submissionId) ? submissionId : undefined));
  } catch (err) {
    fail(res, err);
  }
});

const statusSchema = z.object({
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'conditional', 'disapproved', 'expired', 'closed']),
  reason,
});

/*
 * A status a committee determination sets is set only by the determination,
 * POST /api/ibc/registrations/:id/reviews, where an approval is an electronic signature
 * (signGovernedAct) and every outcome leaves a review record. This route used
 * to accept 'approved' too and wrote it under a 'transition' ledger row and
 * nothing else: an approval with no signature, no review and no reviewer, from
 * a session alone (P0-10b fix round, DP-02). The statuses no determination
 * sets still move here.
 */
const SET_BY_DETERMINATION: ReadonlySet<string> = new Set(['approved', 'conditional']);

router.patch('/registrations/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  if (SET_BY_DETERMINATION.has(parsed.data.status)) {
    return res.status(409).json({ error: { code: 'STATUS_SET_BY_DETERMINATION', message: `'${parsed.data.status}' is a committee determination. Record it at POST /api/ibc/registrations/:id/reviews; an approval there is an electronic signature. Nothing was changed.` } });
  }
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setRegistrationStatusTx(client, orgId, id, parsed.data.status);
    return { target: `ibc-registration:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

const agentSchema = z.object({
  agentName: z.string().min(1).max(300),
  agentType: z.enum(['virus', 'bacterium', 'fungus', 'toxin', 'viral_vector', 'cell_line', 'recombinant_construct', 'other']),
  riskGroup: z.enum(['RG1', 'RG2', 'RG3', 'RG4']),
  reason,
});

router.post('/registrations/:id/agents', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = agentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: aid, requiredBsl } = await addAgentTx(client, orgId, userId, id, parsed.data);
    recordIbcAgentRegistered(parsed.data.riskGroup);
    return { target: `ibc-registration:${id}`, payload: { agentId: aid, riskGroup: parsed.data.riskGroup, requiredBsl }, body: { registrationId: id, agentId: aid, requiredBsl } };
  });
});

const reviewSchema = z.object({
  outcome: z.enum(['approved', 'conditional', 'disapproved', 'tabled']),
  convenedQuorum: z.boolean().optional(),
  conditions: z.string().max(4000).optional(),
  determinationDate: z.string().optional(),
  reason,
});

/*
 * An approval is an electronic signature (21 CFR 11.50, 11.200): it runs the
 * platform's one signing ceremony (governed-signed-act.ts): password, enrolled
 * second factor, declared meaning and reason, then the act, the ledger `sign`
 * and the electronic_signatures row on one transaction. A request without them
 * writes nothing. Any other outcome is a determination recorded under
 * 'resolve' and asks for no password. It used to write a 'sign' ledger row
 * with neither (P0-10b, DP-02).
 */
/** The signing-attempt limit, for the requests that sign. */
const whenApproving: RequestHandler = (req, res, next) =>
  req.body?.outcome === 'approved' ? signedActAttempts(req, res, next) : next();

router.post('/registrations/:id/reviews', whenApproving, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  const record = async (client: any, orgId: number, userId: number) => {
    const result = await recordReviewTx(client, orgId, userId, id, parsed.data);
    if (parsed.data.outcome === 'approved') recordIbcApproval();
    return { target: `ibc-registration:${id}`, payload: { outcome: parsed.data.outcome, expirationDate: result.expirationDate, provenanceLinkId: result.provenanceLinkId }, body: { id, ...result } };
  };
  if (parsed.data.outcome !== 'approved') return governed(req, res, 'resolve', parsed.data.reason, record);
  await signGovernedAct(req, res, { domain: 'ibc', target: `ibc-registration:${id}`, meanings: DECISION_ACT_MEANINGS, codeStatus: CODE_STATUS, run: record });
});

router.get('/registrations/:id/containment', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const client = await pool.connect();
  try {
    const input = await getContainmentInput(client, orgId, id);
    const containment = evaluateContainment(input);
    const expiration = registrationExpiration(input.approvalDate, new Date().toISOString().slice(0, 10));
    res.json({ containment, expiration });
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

export default router;
