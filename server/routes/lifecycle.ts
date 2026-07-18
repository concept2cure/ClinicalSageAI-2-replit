/**
 * Lifecycle Obligation API — Capability C2C-11
 *
 * Governed CRUD for post-approval obligations and their recurring occurrences.
 * Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped.
 * Read endpoints surface the obligation calendar with urgency. Mounted at
 * /api/lifecycle.
 *
 * @module server/routes/lifecycle
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  createObligationTx,
  setObligationStatusTx,
  setEventStatusTx,
  listObligations,
  listCalendar,
  listEvents,
  nextEventDueByObligation,
} from '../services/lifecycle-obligations/lifecycle-service';
import { summarizeCalendar, classificationPathway, projectRenewalObligations } from '../services/lifecycle-obligations/lifecycle-logic';
import { recordLifecycleObligation, recordLifecycleSubmission } from '../services/lifecycle-metrics';

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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'lifecycle' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const obligationSchema = z.object({
  obligationType: z.enum(['variation', 'supplement', 'periodic_report', 'pediatric', 'renewal', 'annual_report']),
  region: z.enum(['fda', 'eu', 'jp', 'mhra', 'other']),
  title: z.string().min(1).max(500),
  classification: z.string().max(40).optional(),
  productId: z.number().int().positive().optional(),
  submissionId: z.number().int().positive().optional(),
  dueDate: z.string().optional(),
  recurrenceMonths: z.number().int().positive().optional(),
  anchorDate: z.string().optional(),
  occurrencesToGenerate: z.number().int().positive().max(24).optional(),
  reason,
});
router.post('/obligations', async (req, res) => {
  const parsed = obligationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, occurrencesCreated } = await createObligationTx(client, orgId, userId, parsed.data);
    recordLifecycleObligation(parsed.data.obligationType, occurrencesCreated);
    // Best-effort: surface the obligation deadline as a central task.
    const { emitDeadlineTask } = await import('../services/research-compliance/tasking-bridge');
    await emitDeadlineTask({ organizationId: orgId, title: `Lifecycle obligation: ${parsed.data.title}`, sourceEntityType: 'lifecycle_obligation', sourceEntityId: id, dueDate: parsed.data.dueDate, taskType: 'deliverable', regulatoryImpact: true });
    return { target: `lifecycle-obligation:${id}`, payload: { type: parsed.data.obligationType, occurrencesCreated }, body: { id, occurrencesCreated, pathway: classificationPathway(parsed.data.classification ?? null) } };
  });
});

router.get('/obligations', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  try { res.json(await listObligations(orgId, Number.isFinite(productId) ? productId : undefined)); } catch (err) { fail(res, err); }
});

router.get('/obligations/:id/events', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await listEvents(orgId, id)); } catch (err) { fail(res, err); }
});

const obligationStatusSchema = z.object({ status: z.enum(['planned', 'in_preparation', 'submitted', 'approved', 'rejected', 'overdue', 'closed']), submittedDate: z.string().optional(), reason });
router.patch('/obligations/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = obligationStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setObligationStatusTx(client, orgId, id, parsed.data.status, parsed.data.submittedDate);
    if (parsed.data.status === 'submitted') recordLifecycleSubmission();
    return { target: `lifecycle-obligation:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

const eventStatusSchema = z.object({ status: z.enum(['pending', 'in_preparation', 'submitted', 'approved', 'overdue']), submittedDate: z.string().optional(), reason });
router.patch('/events/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = eventStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setEventStatusTx(client, orgId, id, parsed.data.status, parsed.data.submittedDate);
    if (parsed.data.status === 'submitted') recordLifecycleSubmission();
    return { target: `lifecycle-event:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

router.get('/calendar', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const items = await listCalendar(orgId);
    const summary = summarizeCalendar(items.map((i) => ({ dueDate: i.dueDate, terminal: i.status === 'approved' || i.status === 'closed' || i.status === 'submitted' })), today());
    res.json({ summary, items });
  } catch (err) { fail(res, err); }
});

/**
 * Read-side projection of the governed recurring-obligation store into the
 * Lifecycle surface's "Renewal cycles" shape ({ data: RenewalView[] }), enriched
 * with the deterministic urgency bucket. Recurring reporting/renewal types only.
 * Fails CLOSED to an empty list (never 500, never fabricated) when the store is
 * absent or errors, so the surface shows its sample fallback — the whole point
 * of the surface's live ?? fixture guard.
 */
router.get('/renewals', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const rows = await listObligations(orgId);
    // A recurring obligation created with an anchor + cadence but no explicit
    // parent due_date carries its dated occurrences on the events table; fall
    // back to the nearest non-terminal event so the next generated occurrence
    // shows (and sorts) correctly instead of as an undated row.
    const eventDue = await nextEventDueByObligation(orgId);
    const enriched = rows.map((r: any) => ({ ...r, due_date: r.due_date ?? eventDue.get(Number(r.id)) ?? null }));
    const data = projectRenewalObligations(enriched, today());
    res.json({ data, meta: { count: data.length } });
  } catch (err) {
    const pendingStore = (err as { code?: string } | null)?.code === '42P01';
    res.json({ data: [], meta: { count: 0, pendingStore } });
  }
});

export default router;
