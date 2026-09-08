/**
 * Informed Consent Form API — Capability C2C-18d
 *
 * Governed consent authoring: create a form (auto-seeded with the required elements
 * of consent per 45 CFR 46.116), edit an element's content + presence, read forms /
 * a single form with elements, read completeness, and approve behind the
 * deterministic completeness gate. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Mounted at /api/protocol-consent.
 *
 * @module server/routes/protocol-consent
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createConsentFormTx,
  updateElementTx,
  approveConsentFormTx,
  getCompleteness,
  listConsentForms,
  getConsentForm,
} from '../services/protocol-consent/protocol-consent-service';
import {
  recordConsentFormCreated, recordConsentElementUpdated, recordConsentFormApproved,
} from '../services/protocol-consent-metrics';
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

// ─── Forms ───────────────────────────────────────────────────────────────────

const formSchema = z.object({
  title: z.string().min(1).max(500),
  protocolDocumentId: z.number().int().positive().optional(),
  version: z.string().max(40).optional(),
  language: z.string().max(40).optional(),
  readingLevel: z.string().max(40).optional(),
  reason,
});
router.post('/forms', async (req, res) => {
  const parsed = formSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, elementsSeeded } = await createConsentFormTx(client, orgId, userId, parsed.data);
    recordConsentFormCreated();
    return { target: `consent-form:${id}`, payload: { elementsSeeded }, body: { id, elementsSeeded } };
  });
});

router.get('/forms', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const pid = req.query.protocolDocumentId;
  const protocolDocumentId = typeof pid === 'string' && /^\d+$/.test(pid) ? Number(pid) : undefined;
  try { res.json(await listConsentForms(orgId, protocolDocumentId)); } catch (err) { fail(res, err); }
});

router.get('/forms/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const form = await getConsentForm(orgId, id);
    if (!form) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Consent form not found.' } });
    res.json(form);
  } catch (err) { fail(res, err); }
});

router.get('/forms/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getCompleteness(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── Elements ──────────────────────────────────────────────────────────────

const elementSchema = z.object({ content: z.string().max(50000).optional(), present: z.boolean().optional(), reason });
router.patch('/elements/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = elementSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    // The element's prose is attributed to the person saving it (lineage gate
    // inside updateElementTx, ledger L158); governed() already refuses a
    // request with no identified user.
    await updateElementTx(client, orgId, id, parsed.data, userId);
    recordConsentElementUpdated();
    return { target: `consent-element:${id}`, payload: { present: parsed.data.present }, body: { id } };
  });
});

// ─── Approve ───────────────────────────────────────────────────────────────

router.post('/forms/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await approveConsentFormTx(client, orgId, userId, id);
    recordConsentFormApproved();
    return { target: `consent-form:${id}`, payload: { requiredPresentPct: result.completeness.requiredPresentPct }, body: { formId: id, ...result } };
  });
});

export default router;
