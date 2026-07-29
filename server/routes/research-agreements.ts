/**
 * Research Agreements (MTA/DUA/CDA) API — Capability C2C-27
 *
 * Governed agreement authoring: create an agreement, edit it, read the deterministic
 * HIPAA execution-readiness gate (45 CFR 164.514), read a portfolio roll-up, and
 * execute behind that gate. Every mutation runs BEGIN → Tx → recordGovernedAction →
 * COMMIT, org-scoped. Mounted at /api/research-agreements.
 *
 * @module server/routes/research-agreements
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createAgreementTx, updateAgreementTx, executeAgreementTx, getReadiness, getPortfolio, listAgreements, getAgreement,
} from '../services/research-agreements/research-agreements-service';
import { recordAgreementCreated, recordAgreementUpdated, recordAgreementExecuted } from '../services/research-agreements-metrics';
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

const agreementFields = {
  agreementType: z.enum(['mta', 'dua', 'cda']).optional(),
  direction: z.enum(['incoming', 'outgoing']).optional(),
  ourParty: z.string().max(500).optional(),
  materialOrDataDescription: z.string().max(20000).optional(),
  containsPhi: z.boolean().optional(),
  containsHumanData: z.boolean().optional(),
  isDeidentified: z.boolean().optional(),
  limitedDataSet: z.boolean().optional(),
  ipRightsTerms: z.string().max(20000).optional(),
  publicationRights: z.boolean().optional(),
  effectiveDate: dateStr.optional(),
  expirationDate: dateStr.optional(),
  grantProposalId: z.number().int().positive().optional(),
  protocolDocumentId: z.number().int().positive().optional(),
};
const createSchema = z.object({ title: z.string().min(1).max(500), otherParty: z.string().min(1).max(500), ...agreementFields, reason });
router.post('/agreements', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createAgreementTx(client, orgId, userId, parsed.data);
    recordAgreementCreated();
    return { target: `research-agreement:${id}`, body: { id } };
  });
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  otherParty: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'under_review', 'negotiation', 'expired', 'terminated']).optional(),
  ...agreementFields,
  reason,
});
router.patch('/agreements/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await updateAgreementTx(client, orgId, id, parsed.data);
    recordAgreementUpdated();
    return { target: `research-agreement:${id}`, payload: { status: parsed.data.status }, body: { id } };
  });
});

router.get('/agreements', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const agreementType = typeof req.query.agreementType === 'string' ? req.query.agreementType : undefined;
  const gp = req.query.grantProposalId;
  const grantProposalId = typeof gp === 'string' && /^\d+$/.test(gp) ? Number(gp) : undefined;
  try { res.json(await listAgreements(orgId, { status, agreementType, grantProposalId })); } catch (err) { fail(res, err); }
});

router.get('/portfolio', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const asOf = typeof req.query.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf) ? req.query.asOf : undefined;
  try { res.json(await getPortfolio(orgId, asOf)); } catch (err) { fail(res, err); }
});

router.get('/agreements/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const a = await getAgreement(orgId, id);
    if (!a) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Research agreement not found.' } });
    res.json(a);
  } catch (err) { fail(res, err); }
});

router.get('/agreements/:id/readiness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getReadiness(orgId, id)); } catch (err) { fail(res, err); }
});

router.post('/agreements/:id/execute', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await executeAgreementTx(client, orgId, userId, id);
    recordAgreementExecuted();
    return { target: `research-agreement:${id}`, body: { id, ...result } };
  });
});

export default router;
