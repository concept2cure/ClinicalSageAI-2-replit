/**
 * eGrants API — Capability C2C-14
 *
 * Governed CRUD across the grant lifecycle: opportunities, proposals, awards,
 * milestones, invoices. Every mutation runs BEGIN → Tx → recordGovernedAction →
 * COMMIT, org-scoped. Awards thread proposal → award provenance. Read endpoints
 * surface deadline-urgency portfolios and federal reporting obligations. Mounted
 * at /api/grants.
 *
 * @module server/routes/grants
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createOpportunityTx,
  createProposalTx,
  setProposalStatusTx,
  createAwardTx,
  addMilestoneTx,
  createInvoiceTx,
  setInvoiceStatusTx,
  listAwards,
  listMilestones,
  listProposals,
  listInvoices,
  getAwardPeriod,
} from '../services/grants/grants-service';
import { summarizeDeadlines, reportingObligations, awardPeriodState } from '../services/grants/grants-logic';
import { recordGrantProposalCreated, recordGrantAwardRecorded, recordGrantInvoice } from '../services/grants-metrics';

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
const AGENCY = z.enum(['nih', 'nsf', 'barda', 'dod', 'cdc', 'arpa_h', 'foundation', 'industry', 'other']);
const MECHANISM = z.enum(['sbir', 'sttr', 'r01', 'r21', 'u01', 'p01', 'contract', 'cooperative_agreement', 'other']);
const amount = z.union([z.number(), z.string()]);
function today(): string { return new Date().toISOString().slice(0, 10); }

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
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'grants' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Opportunities ───────────────────────────────────────────────────────────

const opportunitySchema = z.object({
  opportunityNumber: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  fundingAgency: AGENCY,
  mechanism: MECHANISM.optional(),
  externalId: z.string().max(120).optional(),
  dueDate: z.string().optional(),
  ceilingAmount: amount.optional(),
  reason,
});
router.post('/opportunities', async (req, res) => {
  const parsed = opportunitySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createOpportunityTx(client, orgId, userId, parsed.data);
    return { target: `grant-opportunity:${id}`, payload: { agency: parsed.data.fundingAgency }, body: { id } };
  });
});

// ─── Proposals ───────────────────────────────────────────────────────────────

const proposalSchema = z.object({
  title: z.string().min(1).max(500),
  opportunityId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  principalInvestigator: z.string().max(300).optional(),
  requestedAmount: amount.optional(),
  reason,
});
router.post('/proposals', async (req, res) => {
  const parsed = proposalSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createProposalTx(client, orgId, userId, parsed.data);
    recordGrantProposalCreated();
    return { target: `grant-proposal:${id}`, body: { id } };
  });
});

router.get('/proposals', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listProposals(orgId)); } catch (err) { fail(res, err); }
});

const proposalStatusSchema = z.object({ status: z.enum(['draft', 'internal_review', 'submitted', 'awarded', 'declined', 'withdrawn']), submittedDate: z.string().optional(), reason });
router.patch('/proposals/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = proposalStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setProposalStatusTx(client, orgId, id, parsed.data.status, parsed.data.submittedDate);
    return { target: `grant-proposal:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

// ─── Awards ──────────────────────────────────────────────────────────────────

const awardSchema = z.object({
  awardNumber: z.string().min(1).max(120),
  fundingAgency: AGENCY,
  proposalId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  totalAmount: amount.optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  reason,
});
router.post('/awards', async (req, res) => {
  const parsed = awardSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, provenanceLinkId } = await createAwardTx(client, orgId, userId, parsed.data);
    recordGrantAwardRecorded(parsed.data.fundingAgency);
    return { target: `grant-award:${id}`, payload: { agency: parsed.data.fundingAgency, provenanceLinkId }, body: { id, provenanceLinkId } };
  });
});

router.get('/awards', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listAwards(orgId)); } catch (err) { fail(res, err); }
});

router.get('/awards/:id/reporting', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const { periodStart, periodEnd } = await getAwardPeriod(orgId, id);
    res.json({ periodState: awardPeriodState(periodStart, periodEnd, today()), obligations: reportingObligations(periodStart, periodEnd) });
  } catch (err) { fail(res, err); }
});

// ─── Milestones ──────────────────────────────────────────────────────────────

const milestoneSchema = z.object({ title: z.string().min(1).max(500), milestoneType: z.enum(['scientific', 'progress_report', 'financial_report', 'deliverable', 'regulatory']), dueDate: z.string().optional(), reason });
router.post('/awards/:id/milestones', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = milestoneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: mid } = await addMilestoneTx(client, orgId, userId, id, parsed.data);
    // Best-effort: surface the milestone deadline as a central task.
    const { emitDeadlineTask } = await import('../services/research-compliance/tasking-bridge');
    await emitDeadlineTask({ organizationId: orgId, title: `Grant milestone: ${parsed.data.title}`, sourceEntityType: 'grant_milestone', sourceEntityId: mid, dueDate: parsed.data.dueDate, taskType: 'milestone', regulatoryImpact: parsed.data.milestoneType === 'regulatory' });
    return { target: `grant-award:${id}`, payload: { milestoneId: mid, milestoneType: parsed.data.milestoneType }, body: { awardId: id, milestoneId: mid } };
  });
});

router.get('/milestones', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const awardId = req.query.awardId ? Number(req.query.awardId) : undefined;
  try {
    const rows = await listMilestones(orgId, Number.isFinite(awardId) ? awardId : undefined);
    const summary = summarizeDeadlines(rows.map((r) => ({ dueDate: r.due_date, terminal: r.status === 'met' || r.status === 'submitted' })), today());
    res.json({ milestones: rows, summary });
  } catch (err) { fail(res, err); }
});

// ─── Invoices (sponsor billing) ──────────────────────────────────────────────

const invoiceSchema = z.object({ invoiceNumber: z.string().min(1).max(120), amount, periodStart: z.string().optional(), periodEnd: z.string().optional(), reason });
router.post('/awards/:id/invoices', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = invoiceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: iid } = await createInvoiceTx(client, orgId, userId, id, parsed.data);
    recordGrantInvoice('draft');
    return { target: `grant-award:${id}`, payload: { invoiceId: iid }, body: { awardId: id, invoiceId: iid } };
  });
});

router.get('/invoices', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const awardId = req.query.awardId ? Number(req.query.awardId) : undefined;
  try {
    const rows = await listInvoices(orgId, Number.isFinite(awardId) ? awardId : undefined);
    const summary = summarizeDeadlines(rows.map((r) => ({ dueDate: r.period_end, terminal: r.status === 'paid' || r.status === 'void' })), today());
    res.json({ invoices: rows, summary });
  } catch (err) { fail(res, err); }
});

const invoiceStatusSchema = z.object({ status: z.enum(['draft', 'submitted', 'paid', 'disputed', 'void']), reason });
router.patch('/invoices/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = invoiceStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setInvoiceStatusTx(client, orgId, id, parsed.data.status);
    recordGrantInvoice(parsed.data.status);
    return { target: `grant-invoice:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

export default router;
