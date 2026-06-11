/**
 * Controlled Substances API — DEA (Capability C2C-15)
 *
 * Governed CRUD for DEA registrations, the controlled-substances inventory, and
 * the perpetual transaction ledger. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Transactions reconcile the balance
 * (no negative inventory). Mounted at /api/controlled-substances.
 *
 * @module server/routes/controlled-substances
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createRegistrationTx,
  createSubstanceTx,
  recordTransactionTx,
  listRegistrations,
  listSubstances,
  listTransactions,
  getRecordkeepingContext,
} from '../services/controlled-substances/cs-service';
import { registrationExpiryStatus, evaluateRecordkeeping } from '../services/controlled-substances/cs-logic';
import { recordCsRegistration, recordCsSubstance, recordCsTransaction } from '../services/cs-metrics';

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
const SCHEDULE = z.enum(['I', 'II', 'III', 'IV', 'V']);
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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'controlled_substances' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Registrations ───────────────────────────────────────────────────────────

const registrationSchema = z.object({
  registrantName: z.string().min(1).max(300),
  deaNumber: z.string().min(1).max(40),
  businessActivity: z.enum(['researcher', 'analytical_lab', 'manufacturer', 'distributor', 'practitioner', 'teaching_institution', 'other']),
  schedules: z.array(SCHEDULE).default([]),
  expirationDate: z.string().optional(),
  reason,
});
router.post('/registrations', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createRegistrationTx(client, orgId, userId, parsed.data);
    recordCsRegistration();
    return { target: `dea-registration:${id}`, payload: { deaNumber: parsed.data.deaNumber }, body: { id } };
  });
});

router.get('/registrations', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const rows = await listRegistrations(orgId);
    const t = today();
    res.json(rows.map((r) => ({ ...r, expiryStatus: registrationExpiryStatus(r.expiration_date, t) })));
  } catch (err) { fail(res, err); }
});

// ─── Substances ──────────────────────────────────────────────────────────────

const substanceSchema = z.object({
  substanceName: z.string().min(1).max(300),
  deaSchedule: SCHEDULE,
  unit: z.string().max(20).optional(),
  deaRegistrationId: z.number().int().positive().optional(),
  reason,
});
router.post('/substances', async (req, res) => {
  const parsed = substanceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createSubstanceTx(client, orgId, userId, parsed.data);
    recordCsSubstance(parsed.data.deaSchedule);
    return { target: `controlled-substance:${id}`, payload: { schedule: parsed.data.deaSchedule }, body: { id } };
  });
});

router.get('/substances', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listSubstances(orgId)); } catch (err) { fail(res, err); }
});

// ─── Transactions (perpetual ledger) ─────────────────────────────────────────

const transactionSchema = z.object({
  transactionType: z.enum(['receipt', 'dispense', 'use', 'disposal', 'transfer', 'adjustment']),
  quantity: z.number(),
  transactionDate: z.string().optional(),
  witnessedBy: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  reason,
});
router.post('/substances/:id/transactions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = transactionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: tid, balanceAfter } = await recordTransactionTx(client, orgId, userId, id, parsed.data);
    recordCsTransaction(parsed.data.transactionType);
    return { target: `controlled-substance:${id}`, payload: { transactionId: tid, type: parsed.data.transactionType, balanceAfter }, body: { substanceId: id, transactionId: tid, balanceAfter } };
  });
});

router.get('/substances/:id/transactions', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await listTransactions(orgId, id)); } catch (err) { fail(res, err); }
});

router.get('/substances/:id/recordkeeping', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const txType = typeof req.query.transactionType === 'string' ? req.query.transactionType : 'use';
  try {
    const ctx = await getRecordkeepingContext(orgId, id);
    res.json(evaluateRecordkeeping({ schedule: ctx.schedule, transactionType: txType as any, hasActiveRegistration: ctx.hasActiveRegistration, witnessedBy: typeof req.query.witnessedBy === 'string' ? req.query.witnessedBy : null }));
  } catch (err) { fail(res, err); }
});

export default router;
