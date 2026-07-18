/**
 * Financial Disclosures API — 21 CFR 54 (Capability C2C-01)
 *
 * Governed CRUD + certify (e-signature) + AI completeness review for clinical
 * investigator financial disclosures (Forms FDA 3454/3455 → Module 1). Every
 * mutation runs BEGIN → <domain>Tx → recordGovernedAction → COMMIT so the row
 * write and the audit/ledger commit together. Org-scoped from the verified
 * request context (never body/params). Mounted at /api/financial-disclosures.
 *
 * @module server/routes/financial-disclosures
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction, verifyReauth } from './c2c/actions';
import { getGateway } from '../services/ai-gateway';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  createInvestigatorTx,
  listInvestigators,
  createDisclosureTx,
  updateDisclosureTx,
  softDeleteDisclosureTx,
  addInterestTx,
  certifyDisclosureTx,
  loadDisclosureSnapshot,
  listDisclosures,
} from '../services/financial-disclosures/fcoi-service';
import { validateDisclosureCompleteness } from '../services/financial-disclosures/fcoi-logic';
import {
  recordFcoiDisclosureCreated,
  recordFcoiCertification,
  recordFcoiSignatureInvalidation,
  recordFcoiReview,
} from '../services/fcoi-metrics';

const router = Router();

// ESM has no module-scope __dirname; recreate it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const reasonSchema = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');

// ─── Investigators ───────────────────────────────────────────────────────────

const investigatorSchema = z.object({
  fullName: z.string().min(1).max(300),
  role: z.enum(['principal_investigator', 'sub_investigator', 'coordinator', 'other']),
  institution: z.string().max(500).optional(),
  studyId: z.number().int().positive().optional(),
  reason: reasonSchema,
});

router.post('/investigators', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = investigatorSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = await createInvestigatorTx(client, orgId, userId, parsed.data);
    const gov = await recordGovernedAction(client, {
      orgId, userId, command: 'create', target: `clinical-investigator:${id}`,
      reason: parsed.data.reason, payload: { fullName: parsed.data.fullName, role: parsed.data.role }, domain: 'fcoi',
    });
    await client.query('COMMIT');
    res.status(201).json({ id, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

router.get('/investigators', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    res.json(await listInvestigators(orgId));
  } catch (err) {
    fail(res, err);
  }
});

// ─── Disclosures ─────────────────────────────────────────────────────────────

const disclosureSchema = z.object({
  investigatorId: z.number().int().positive(),
  submissionId: z.number().int().positive().optional(),
  disclosurePeriodStart: z.string().optional(),
  disclosurePeriodEnd: z.string().optional(),
  hasDisclosableInterests: z.boolean(),
  certificationStatement: z.string().max(4000).optional(),
  reason: reasonSchema,
});

router.post('/disclosures', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = disclosureSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id, formType } = await createDisclosureTx(client, orgId, userId, parsed.data);
    const gov = await recordGovernedAction(client, {
      orgId, userId, command: 'create', target: `financial-disclosure:${id}`,
      reason: parsed.data.reason, payload: { investigatorId: parsed.data.investigatorId, formType }, domain: 'fcoi',
    });
    await client.query('COMMIT');
    recordFcoiDisclosureCreated(formType as 'FDA_3454' | 'FDA_3455');
    res.status(201).json({ id, formType, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

router.get('/disclosures', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    res.json(await listDisclosures(orgId, Number.isFinite(submissionId) ? submissionId : undefined));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/disclosures/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const client = await pool.connect();
  try {
    const snap = await loadDisclosureSnapshot(client, orgId, id);
    const validation = validateDisclosureCompleteness(snap);
    const { row, ...rest } = snap;
    res.json({ disclosure: row, snapshot: rest, validation });
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

const patchSchema = z.object({
  submissionId: z.number().int().positive().nullable().optional(),
  disclosurePeriodStart: z.string().nullable().optional(),
  disclosurePeriodEnd: z.string().nullable().optional(),
  hasDisclosableInterests: z.boolean().optional(),
  certificationStatement: z.string().max(4000).nullable().optional(),
  reason: reasonSchema,
});

router.patch('/disclosures/:id', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { formType, signatureInvalidated } = await updateDisclosureTx(client, orgId, id, parsed.data);
    const gov = await recordGovernedAction(client, {
      orgId, userId, command: 'update', target: `financial-disclosure:${id}`,
      reason: parsed.data.reason, payload: { formType, signatureInvalidated }, domain: 'fcoi',
    });
    await client.query('COMMIT');
    if (signatureInvalidated) recordFcoiSignatureInvalidation();
    res.json({ id, formType, signatureInvalidated, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

const interestSchema = z.object({
  interestType: z.enum(['COMPENSATION_BY_OUTCOME', 'EQUITY_INTEREST', 'PROPRIETARY_INTEREST', 'SIGNIFICANT_PAYMENTS']),
  description: z.string().min(1).max(2000),
  monetaryValue: z.union([z.number(), z.string()]).optional(),
  arrangementsToMinimizeBias: z.string().max(2000).optional(),
  reason: reasonSchema,
});

router.post('/disclosures/:id/interests', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = interestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id: interestId } = await addInterestTx(client, orgId, userId, id, parsed.data);
    const gov = await recordGovernedAction(client, {
      orgId, userId, command: 'update', target: `financial-disclosure:${id}`,
      reason: parsed.data.reason, payload: { addedInterestId: interestId, interestType: parsed.data.interestType }, domain: 'fcoi',
    });
    await client.query('COMMIT');
    res.status(201).json({ disclosureId: id, interestId, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

router.delete('/disclosures/:id', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'Deleted financial disclosure';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await softDeleteDisclosureTx(client, orgId, id);
    const gov = await recordGovernedAction(client, {
      orgId, userId, command: 'delete', target: `financial-disclosure:${id}`, reason, domain: 'fcoi',
    });
    await client.query('COMMIT');
    res.json({ deleted: id, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

// ─── Certify (high-risk: re-auth + governed SIGN) ────────────────────────────

const certifySchema = z.object({
  reason: reasonSchema,
  meaning: z.string().max(120).optional(),
  reauth: z.object({ password: z.string().optional(), totp: z.string().optional() }).optional(),
});

router.post('/disclosures/:id/certify', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = certifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  // Re-authenticate even with an active session (21 CFR 11 signing).
  const reauth = await verifyReauth(userId, parsed.data.reauth);
  if (!reauth.ok) return res.status(401).json({ error: { code: 'REAUTH_REQUIRED', message: reauth.error ?? 'Re-authentication required.' } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The deterministic gate is the floor — never certify an incomplete disclosure.
    const snap = await loadDisclosureSnapshot(client, orgId, id);
    const validation = validateDisclosureCompleteness(snap);
    if (validation.riskLevel === 'high') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'INCOMPLETE', message: 'Disclosure has critical findings and cannot be certified.', findings: validation.findings } });
    }
    const { contentHash, provenanceLinkId } = await certifyDisclosureTx(client, orgId, userId, id, parsed.data.meaning ?? 'Certified');
    const gov = await recordGovernedAction(client, {
      orgId, userId, command: 'sign', target: `financial-disclosure:${id}`,
      reason: parsed.data.reason, payload: { contentHash, provenanceLinkId, meaning: parsed.data.meaning ?? 'Certified' }, domain: 'fcoi',
    });
    await client.query('COMMIT');
    recordFcoiCertification();
    res.json({ id, status: 'signed', contentHash, provenanceLinkId, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

// ─── AI completeness review (deterministic gate + gateway narration) ─────────

router.post('/disclosures/:id/ai-review', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });

  const client = await pool.connect();
  try {
    const snap = await loadDisclosureSnapshot(client, orgId, id);
    // Deterministic 21 CFR 54 gate is the floor.
    const gate = validateDisclosureCompleteness(snap);
    let aiFindings: unknown[] = [];
    let aiRecommendations: unknown[] = [];
    try {
      const prompt = await fs.readFile(
        path.join(__dirname, '..', 'services', 'ai-gateway', 'prompts', 'fcoi-completeness-review', 'v1.0.md'),
        'utf8',
      );
      const response = await getGateway().route({
        taskType: 'regulatory_review',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify({ snapshot: { ...snap, row: undefined }, deterministicFindings: gate.findings }) },
        ],
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 2000,
        promptVersion: 'fcoi-completeness-review@v1.0',
        organizationId: orgId,
        userId,
        callerModule: 'financial-disclosures',
        metadata: { task: 'fcoi-completeness-review', disclosureId: id },
      } as any);
      const parsed = JSON.parse(String((response as any).content ?? '{}'));
      aiFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
      aiRecommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    } catch {
      // Gateway unavailable (e.g. no provider configured): return the deterministic floor.
    }
    recordFcoiReview(gate.riskLevel);
    res.json({ riskLevel: gate.riskLevel, findings: gate.findings, aiFindings, recommendations: aiRecommendations });
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

export default router;
