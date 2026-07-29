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
  setMilestoneStatusTx,
  openCloseoutTx,
  updateCloseoutTx,
  finalizeCloseoutTx,
  getCloseoutRecord,
  createSubawardTx,
  screenSubawardTx,
  executeSubawardTx,
  listSubawards,
  addBudgetLineTx,
  recordExpenditureTx,
  getBudgetVsActual,
  setCostShareCommitmentTx,
  recordCostShareContributionTx,
  getCostShareStatus,
  requestNceTx,
  approveNceTx,
  listNce,
  listAwards,
  listMilestones,
  listProposals,
  listInvoices,
  getAwardPeriod,
} from '../services/grants/grants-service';
import { summarizeDeadlines, reportingObligations, awardPeriodState, evaluateCloseout } from '../services/grants/grants-logic';
import { recordGrantProposalCreated, recordGrantAwardRecorded, recordGrantInvoice, recordGrantMilestoneStatus, recordGrantCloseoutOpened, recordGrantCloseoutFinalized, recordGrantSubaward, recordGrantSubawardExecuted, recordGrantBudgetLine, recordGrantExpenditure, recordGrantCostShareContribution, recordGrantNceRequested, recordGrantNceApproved } from '../services/grants-metrics';
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
    await setTenantContextTx(client, orgId);
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

const milestoneStatusSchema = z.object({ status: z.enum(['pending', 'in_progress', 'met', 'missed', 'submitted']), completedDate: z.string().optional(), reason });
router.patch('/milestones/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = milestoneStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setMilestoneStatusTx(client, orgId, id, parsed.data.status, parsed.data.completedDate);
    recordGrantMilestoneStatus(parsed.data.status);
    return { target: `grant-milestone:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

// ─── Closeout (2 CFR 200.344) ────────────────────────────────────────────────

router.post('/awards/:id/closeout', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid, closeoutDueDate } = await openCloseoutTx(client, orgId, userId, id);
    recordGrantCloseoutOpened();
    return { target: `grant-award:${id}`, payload: { closeoutId: cid, closeoutDueDate }, body: { awardId: id, closeoutId: cid, closeoutDueDate } };
  });
});

const closeoutItemsSchema = z.object({
  finalRpprSubmitted: z.boolean().optional(),
  finalFfrSubmitted: z.boolean().optional(),
  equipmentInventoryReturned: z.boolean().optional(),
  finalInvoicesReconciled: z.boolean().optional(),
  deobligationAmount: amount.optional(),
  notes: z.string().max(2000).optional(),
  reason,
});
router.patch('/awards/:id/closeout', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = closeoutItemsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    await updateCloseoutTx(client, orgId, userId, id, parsed.data);
    return { target: `grant-award:${id}`, payload: { closeout: 'updated' }, body: { awardId: id } };
  });
});

router.post('/awards/:id/closeout/finalize', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const { closedAward } = await finalizeCloseoutTx(client, orgId, userId, id);
    recordGrantCloseoutFinalized();
    return { target: `grant-award:${id}`, payload: { closeout: 'completed', closedAward }, body: { awardId: id, status: 'completed', closedAward } };
  });
});

router.get('/awards/:id/closeout', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const rec = await getCloseoutRecord(orgId, id);
    if (!rec) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No closeout record for this award.' } });
    const state = evaluateCloseout({
      finalRpprSubmitted: rec.final_rppr_submitted, finalFfrSubmitted: rec.final_ffr_submitted,
      equipmentInventoryReturned: rec.equipment_inventory_returned, finalInvoicesReconciled: rec.final_invoices_reconciled,
      status: rec.status,
    }, rec.period_end, today());
    res.json({ record: rec, state });
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

// ─── Subawards / subrecipient monitoring (2 CFR 200.331–200.332, 200.214) ────

const INSTITUTION = z.enum(['higher_ed', 'nonprofit', 'commercial', 'foreign', 'government', 'other']);
const RISK = z.enum(['low', 'medium', 'high']);
const subawardSchema = z.object({
  subrecipientName: z.string().min(1).max(300),
  subrecipientUei: z.string().max(40).optional(),
  institutionType: INSTITUTION.optional(),
  amount: amount.optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  riskLevel: RISK.optional(),
  reason,
});
router.post('/awards/:id/subawards', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = subawardSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: sid } = await createSubawardTx(client, orgId, userId, id, parsed.data);
    recordGrantSubaward(parsed.data.institutionType ?? 'other');
    return { target: `grant-award:${id}`, payload: { subawardId: sid }, body: { awardId: id, subawardId: sid } };
  });
});

router.get('/subawards', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const awardId = req.query.awardId ? Number(req.query.awardId) : undefined;
  try { res.json(await listSubawards(orgId, Number.isFinite(awardId) ? awardId : undefined)); } catch (err) { fail(res, err); }
});

const screenSchema = z.object({ screenStatus: z.enum(['cleared', 'excluded']), screenSource: z.string().max(60).optional(), riskLevel: RISK.optional(), reason });
router.patch('/subawards/:id/screen', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = screenSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await screenSubawardTx(client, orgId, id, parsed.data);
    return { target: `grant-subaward:${id}`, payload: { screenStatus: parsed.data.screenStatus }, body: { id, screenStatus: parsed.data.screenStatus } };
  });
});

router.post('/subawards/:id/execute', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    await executeSubawardTx(client, orgId, userId, id);
    recordGrantSubawardExecuted();
    return { target: `grant-subaward:${id}`, payload: { status: 'executed' }, body: { id, status: 'executed' } };
  });
});

// ─── Budget lines & expenditures (2 CFR 200.308 / 200.403 / 200.414) ─────────

const CATEGORY = z.enum(['personnel', 'fringe', 'equipment', 'travel', 'supplies', 'contractual', 'construction', 'other_direct', 'indirect']);

const budgetLineSchema = z.object({ category: CATEGORY, budgetedAmount: z.number().nonnegative(), indirectRatePct: z.number().min(0).max(100).optional(), notes: z.string().max(1000).optional(), reason });
router.post('/awards/:id/budget', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = budgetLineSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: bid } = await addBudgetLineTx(client, orgId, userId, id, parsed.data);
    recordGrantBudgetLine(parsed.data.category);
    return { target: `grant-award:${id}`, payload: { budgetLineId: bid, category: parsed.data.category }, body: { awardId: id, budgetLineId: bid } };
  });
});

const expenditureSchema = z.object({ category: CATEGORY, amount: z.number().nonnegative(), expenditureDate: z.string().optional(), description: z.string().max(1000).optional(), reason });
router.post('/awards/:id/expenditures', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = expenditureSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: eid } = await recordExpenditureTx(client, orgId, userId, id, parsed.data);
    recordGrantExpenditure(parsed.data.category);
    return { target: `grant-award:${id}`, payload: { expenditureId: eid, category: parsed.data.category }, body: { awardId: id, expenditureId: eid } };
  });
});

router.get('/awards/:id/budget', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getBudgetVsActual(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── Cost share (2 CFR 200.306) ──────────────────────────────────────────────

const costShareCommitSchema = z.object({ committed: z.number().nonnegative(), reason });
router.patch('/awards/:id/cost-share', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = costShareCommitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await setCostShareCommitmentTx(client, orgId, id, parsed.data.committed);
    return { target: `grant-award:${id}`, payload: { costShareCommitted: parsed.data.committed }, body: { awardId: id } };
  });
});

const costShareContribSchema = z.object({ source: z.enum(['institutional', 'third_party', 'in_kind', 'other']), amount: z.number().nonnegative(), contributionDate: z.string().optional(), description: z.string().max(1000).optional(), reason });
router.post('/awards/:id/cost-share/contributions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = costShareContribSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid } = await recordCostShareContributionTx(client, orgId, userId, id, parsed.data);
    recordGrantCostShareContribution();
    return { target: `grant-award:${id}`, payload: { contributionId: cid, source: parsed.data.source }, body: { awardId: id, contributionId: cid } };
  });
});

router.get('/awards/:id/cost-share', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getCostShareStatus(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── No-cost extensions (2 CFR 200.308) ──────────────────────────────────────

const nceRequestSchema = z.object({ newEndDate: z.string(), reason });
router.post('/awards/:id/nce', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = nceRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: nid, requiresSponsorApproval, months } = await requestNceTx(client, orgId, userId, id, parsed.data);
    recordGrantNceRequested();
    return { target: `grant-award:${id}`, payload: { nceId: nid, months, requiresSponsorApproval }, body: { awardId: id, nceId: nid, months, requiresSponsorApproval } };
  });
});

const nceApproveSchema = z.object({ authority: z.enum(['grantee', 'sponsor']), reason });
router.post('/nce/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = nceApproveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const { newEndDate } = await approveNceTx(client, orgId, userId, id, parsed.data.authority);
    recordGrantNceApproved();
    return { target: `grant-nce:${id}`, payload: { status: 'approved', newEndDate }, body: { id, status: 'approved', newEndDate } };
  });
});

router.get('/nce', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const awardId = req.query.awardId ? Number(req.query.awardId) : undefined;
  try { res.json(await listNce(orgId, Number.isFinite(awardId) ? awardId : undefined)); } catch (err) { fail(res, err); }
});

export default router;
