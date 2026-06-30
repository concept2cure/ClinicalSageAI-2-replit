/**
 * Invention Disclosure / Technology Transfer API — Capability C2C-25
 *
 * Governed tech-transfer authoring: create a disclosure, edit/transition status +
 * TTO decision, read the Bayh-Dole compliance picture (37 CFR 401.14 deadlines),
 * read submission readiness, and submit behind the deterministic readiness gate.
 * Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped.
 * Mounted at /api/invention-disclosures.
 *
 * @module server/routes/invention-disclosure
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createDisclosureTx, updateDisclosureTx, submitDisclosureTx, getCompliance, getReadiness, listDisclosures, getDisclosure,
} from '../services/invention-disclosure/invention-disclosure-service';
import { recordDisclosureCreated, recordDisclosureUpdated, recordDisclosureSubmitted } from '../services/invention-disclosure-metrics';
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
  if (code && CODE_STATUS[code]) { res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd.');

async function governed(
  req: Request, res: Response, command: string, reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) { res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally { client.release(); }
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  inventors: z.string().max(5000).optional(),
  fundingSource: z.string().max(500).optional(),
  federalFunding: z.boolean().optional(),
  federalAward: z.string().max(200).optional(),
  disclosureDate: dateStr.optional(),
  grantProposalId: z.number().int().positive().optional(),
  reason,
});
router.post('/disclosures', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createDisclosureTx(client, orgId, userId, parsed.data);
    recordDisclosureCreated();
    return { target: `invention-disclosure:${id}`, body: { id } };
  });
});

const updateSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'elected', 'patent_filed', 'licensed', 'released', 'abandoned']).optional(),
  inventors: z.string().max(5000).optional(),
  fundingSource: z.string().max(500).optional(),
  federalFunding: z.boolean().optional(),
  federalAward: z.string().max(200).optional(),
  disclosureDate: dateStr.optional(),
  electionDate: dateStr.optional(),
  decisionRationale: z.string().max(20000).optional(),
  reason,
});
router.patch('/disclosures/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    await updateDisclosureTx(client, orgId, userId, id, parsed.data);
    recordDisclosureUpdated();
    return { target: `invention-disclosure:${id}`, payload: { status: parsed.data.status }, body: { id } };
  });
});

router.get('/disclosures', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const gp = req.query.grantProposalId;
  const grantProposalId = typeof gp === 'string' && /^\d+$/.test(gp) ? Number(gp) : undefined;
  try { res.json(await listDisclosures(orgId, { status, grantProposalId })); } catch (err) { fail(res, err); }
});

router.get('/disclosures/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const d = await getDisclosure(orgId, id);
    if (!d) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invention disclosure not found.' } });
    res.json(d);
  } catch (err) { fail(res, err); }
});

router.get('/disclosures/:id/compliance', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const asOf = typeof req.query.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf) ? req.query.asOf : undefined;
  try { res.json({ compliance: await getCompliance(orgId, id, asOf), readiness: await getReadiness(orgId, id) }); } catch (err) { fail(res, err); }
});

router.post('/disclosures/:id/submit', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'submit', parsed.data.reason, async (client, orgId, userId) => {
    const result = await submitDisclosureTx(client, orgId, userId, id);
    recordDisclosureSubmitted();
    return { target: `invention-disclosure:${id}`, body: { id, ...result } };
  });
});

export default router;
