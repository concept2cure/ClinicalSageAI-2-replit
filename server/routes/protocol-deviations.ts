/**
 * Protocol Deviations & CAPA API — Capability C2C-18b
 *
 * Governed deviation management: record a deviation (deterministic reportability),
 * attach CAPA actions, advance CAPA status, and close a deviation behind the
 * deterministic CAPA-closure gate. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Read endpoints are unguarded by a
 * transaction. Mounted at /api/protocol-deviations.
 *
 * @module server/routes/protocol-deviations
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createDeviationTx,
  addCapaActionTx,
  setCapaStatusTx,
  closeDeviationTx,
  assessDeviationTx,
  listDeviations,
  getDeviation,
} from '../services/protocol-deviations/protocol-deviations-service';
import {
  DEVIATION_CATEGORIES,
  DEVIATION_SEVERITIES,
  CAPA_ACTION_STATUSES,
} from '../services/protocol-deviations/protocol-deviations-logic';
import { deviationTrendsForProtocol } from '../services/protocol-development/protocol-industry-service';
import { requestPgClient } from '../db/requestDb';
import {
  recordDeviationReported, recordCapaActionAdded, recordDeviationClosed,
} from '../services/protocol-deviations-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { requireEditorAccessForWrites } from '../middleware/orgMembership';

const router = Router();
// A viewer reads a protocol and changes nothing on it (11.10(d), (g)).
// 2026-09-28: gated by P11-C-1; the coverage-gap sweep's GP-P-1 is the same
// finding and is closed here. The mount (register-inline-routes.ts) carries
// authMiddleware only, so this line is the router's whole write authority.
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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Deviations ──────────────────────────────────────────────────────────────

const deviationSchema = z.object({
  protocolDocumentId: z.number().int().positive(),
  description: z.string().min(1).max(8000),
  category: z.enum(DEVIATION_CATEGORIES).optional(),
  severity: z.enum(DEVIATION_SEVERITIES).optional(),
  affectsSafety: z.boolean().optional(),
  rootCause: z.string().max(4000).optional(),
  deviationNumber: z.string().max(120).optional(),
  discoveredDate: z.string().max(40).optional(),
  reason,
});
router.post('/deviations', async (req, res) => {
  const parsed = deviationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const result = await createDeviationTx(client, orgId, userId, parsed.data);
    // The ledger and the metric record what was ASSESSED — "not_assessed" when
    // nobody assessed it. Both used to record a defaulted 'minor'.
    recordDeviationReported(parsed.data.severity ?? 'not_assessed');
    return {
      target: `protocol-deviation:${result.id}`,
      payload: { severity: parsed.data.severity ?? null, affectsSafety: parsed.data.affectsSafety ?? null, assessed: result.assessed, reportabilityStatus: result.status },
      body: result as unknown as Record<string, unknown>,
    };
  });
});

// ─── Assessment ──────────────────────────────────────────────────────────────

/* A person's assessment: severity, effect on subject safety, and why. The only
   way an unassessed deviation (including every legacy row) becomes closable. */
const assessmentSchema = z.object({
  severity: z.enum(DEVIATION_SEVERITIES),
  affectsSafety: z.boolean(),
  rationale: z.string().trim().min(8, 'Give the rationale for this assessment (at least 8 characters).').max(4000),
  reason,
});
router.post('/deviations/:id/assessment', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = assessmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const result = await assessDeviationTx(client, orgId, userId, id, parsed.data);
    return {
      target: `protocol-deviation:${id}`,
      payload: { severity: parsed.data.severity, affectsSafety: parsed.data.affectsSafety, reportabilityStatus: result.status },
      body: result as unknown as Record<string, unknown>,
    };
  });
});

router.get('/deviations', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const docIdRaw = typeof req.query.protocolDocumentId === 'string' ? Number(req.query.protocolDocumentId) : undefined;
  try { res.json(await listDeviations(orgId, Number.isInteger(docIdRaw) ? docIdRaw : undefined)); } catch (err) { fail(res, err); }
});

/**
 * GET /deviations/trends?protocolDocumentId=&windowMonths= — one protocol's
 * deviations trended by month, category and severity, with the engine's
 * signals (trendDeviations; ICH E6(R3) RBQM). Registered before /deviations/:id
 * so "trends" is never read as an id. The clock is read HERE and handed to the
 * engine as a date. A protocol with no deviations answers with null shares,
 * never 0%.
 */
router.get('/deviations/trends', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const docId = typeof req.query.protocolDocumentId === 'string' ? Number(req.query.protocolDocumentId) : NaN;
  if (!Number.isInteger(docId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'protocolDocumentId is required.' } });
  const windowRaw = typeof req.query.windowMonths === 'string' ? Number(req.query.windowMonths) : undefined;
  if (windowRaw !== undefined && !(Number.isInteger(windowRaw) && windowRaw >= 1 && windowRaw <= 36)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'windowMonths must be a whole number between 1 and 36.' } });
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    res.json(await deviationTrendsForProtocol(requestPgClient(req), orgId, docId, { today, windowMonths: windowRaw }));
  } catch (err) { fail(res, err); }
});

router.get('/deviations/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const dev = await getDeviation(orgId, id);
    if (!dev) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deviation not found.' } });
    res.json(dev);
  } catch (err) { fail(res, err); }
});

// ─── CAPA actions ────────────────────────────────────────────────────────────

const capaSchema = z.object({ action: z.string().min(1).max(4000), owner: z.string().max(300).optional(), dueDate: z.string().max(40).optional(), reason });
router.post('/deviations/:id/capa', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = capaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid } = await addCapaActionTx(client, orgId, userId, id, parsed.data);
    recordCapaActionAdded();
    return { target: `protocol-deviation:${id}`, payload: { capaId: cid }, body: { deviationId: id, capaId: cid } };
  });
});

const capaStatusSchema = z.object({ status: z.enum(CAPA_ACTION_STATUSES), reason });
router.patch('/capa/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = capaStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await setCapaStatusTx(client, orgId, id, parsed.data.status);
    return { target: `protocol-capa:${id}`, payload: { status: parsed.data.status }, body: { id } };
  });
});

// ─── Closure ─────────────────────────────────────────────────────────────────

router.post('/deviations/:id/close', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId) => {
    const result = await closeDeviationTx(client, orgId, id);
    recordDeviationClosed();
    return { target: `protocol-deviation:${id}`, body: { deviationId: id, ...result } };
  });
});

export default router;
