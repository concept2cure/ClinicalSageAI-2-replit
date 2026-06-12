/**
 * RIM-lite API — Registration Grid + Labeling (Capability C2C-12)
 *
 * Governed CRUD for products, the product × country registration grid, and label
 * versions. Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT,
 * org-scoped. Read endpoints surface the grid summary, renewal urgency, and the
 * label-currency gate. Mounted at /api/rim.
 *
 * @module server/routes/rim
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  createProductTx,
  upsertRegistrationTx,
  addLabelTx,
  listProducts,
  listRegistrations,
  getLabelCurrencyInput,
} from '../services/rim/rim-service';
import { summarizeGrid, evaluateLabelCurrency, expectedLabelType } from '../services/rim/rim-logic';
import { recordRimProductCreated, recordRimRegistration, recordRimLabelApproved } from '../services/rim-metrics';

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
const MARKET_STATUS = z.enum(['planned', 'submitted', 'under_review', 'approved', 'withdrawn', 'suspended', 'cancelled']);
const LABEL_TYPE = z.enum(['uspi', 'smpc', 'pil', 'core_data_sheet', 'carton_labeling', 'patient_leaflet']);
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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'rim' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

const productSchema = z.object({
  productName: z.string().min(1).max(300),
  inn: z.string().max(200).optional(),
  dosageForm: z.string().max(120).optional(),
  atcCode: z.string().max(20).optional(),
  status: z.enum(['development', 'active', 'discontinued']).optional(),
  reason,
});
router.post('/products', async (req, res) => {
  const parsed = productSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createProductTx(client, orgId, userId, parsed.data);
    recordRimProductCreated();
    return { target: `rim-product:${id}`, body: { id } };
  });
});

router.get('/products', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listProducts(orgId)); } catch (err) { fail(res, err); }
});

// ─── Registrations (grid) ────────────────────────────────────────────────────

const registrationSchema = z.object({
  country: z.string().min(2).max(40),
  marketStatus: MARKET_STATUS.optional(),
  registrationNumber: z.string().max(120).optional(),
  marketingAuthHolder: z.string().max(300).optional(),
  approvalDate: z.string().optional(),
  renewalDueDate: z.string().optional(),
  reason,
});
router.put('/products/:id/registrations', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = registrationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: rid } = await upsertRegistrationTx(client, orgId, userId, id, parsed.data);
    if (parsed.data.marketStatus) recordRimRegistration(parsed.data.marketStatus);
    return { target: `rim-product:${id}`, payload: { registrationId: rid, country: parsed.data.country, status: parsed.data.marketStatus }, body: { productId: id, registrationId: rid } };
  });
});

router.get('/registrations', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  try {
    const rows = await listRegistrations(orgId, Number.isFinite(productId) ? productId : undefined);
    const summary = summarizeGrid(rows.map((r) => ({ country: r.country, marketStatus: r.market_status, renewalDueDate: r.renewal_due_date })), today());
    res.json({ registrations: rows, summary });
  } catch (err) { fail(res, err); }
});

// ─── Labels ──────────────────────────────────────────────────────────────────

const labelSchema = z.object({
  country: z.string().max(40).optional(),
  labelType: LABEL_TYPE,
  version: z.string().max(30).optional(),
  status: z.enum(['draft', 'in_review', 'approved']).optional(),
  approvedDate: z.string().optional(),
  reason,
});
router.post('/products/:id/labels', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = labelSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, parsed.data.status === 'approved' ? 'sign' : 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: lid, supersededCount } = await addLabelTx(client, orgId, userId, id, parsed.data);
    if (parsed.data.status === 'approved') recordRimLabelApproved(parsed.data.labelType);
    return { target: `rim-product:${id}`, payload: { labelId: lid, labelType: parsed.data.labelType, supersededCount }, body: { productId: id, labelId: lid, supersededCount } };
  });
});

router.get('/products/:id/label-currency', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const input = await getLabelCurrencyInput(orgId, id);
    res.json(evaluateLabelCurrency(input));
  } catch (err) { fail(res, err); }
});

router.get('/expected-label-type', async (req, res) => {
  const country = typeof req.query.country === 'string' ? req.query.country : '';
  if (!country) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'country is required.' } });
  res.json(expectedLabelType(country));
});

export default router;
