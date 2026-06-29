/**
 * Medicare Coverage Analysis API — Capability C2C-15
 *
 * Governed CRUD across the coverage-analysis lifecycle: analyses, the NCD 310.1
 * qualifying-trial determination, items, deterministic item classification,
 * ICD-10 validation, the exportable billing grid, and a gated finalize. Every
 * mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped. Creating
 * an analysis under an IRB submission threads irb_submission → coverage_analysis
 * provenance. Mounted at /api/coverage-analysis.
 *
 * Advisory only: the deterministic engine makes the billing designation; the
 * suggest endpoint and any AI text are advisory. Final billing / False Claims
 * Act compliance remains the institution's responsibility.
 *
 * @module server/routes/coverage-analysis
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createAnalysisTx,
  setQualifyingDeterminationTx,
  addItemTx,
  classifyItemTx,
  setItemIcd10Tx,
  finalizeAnalysisTx,
  listAnalyses,
  getAnalysis,
  listItems,
  getBillingGrid,
  suggestItemClassifications,
} from '../services/coverage-analysis/coverage-service';
import { recordCoverageAnalysisCreated, recordCoverageQualifyingDetermination, recordCoverageItemAdded, recordCoverageItemClassified, recordCoverageFinalized } from '../services/coverage-metrics';
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
const CATEGORY = z.enum(['procedure', 'lab', 'imaging', 'drug_administration', 'visit', 'device', 'other']);

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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'coverage' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Analyses ────────────────────────────────────────────────────────────────

const analysisSchema = z.object({
  title: z.string().min(1).max(500),
  studyId: z.number().int().positive().optional(),
  irbSubmissionId: z.number().int().positive().optional(),
  nctId: z.string().max(40).optional(),
  sponsor: z.string().max(300).optional(),
  reason,
});
router.post('/analyses', async (req, res) => {
  const parsed = analysisSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, provenanceLinkId } = await createAnalysisTx(client, orgId, userId, parsed.data);
    recordCoverageAnalysisCreated();
    return { target: `coverage-analysis:${id}`, payload: { provenanceLinkId }, body: { id, provenanceLinkId } };
  });
});

router.get('/analyses', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listAnalyses(orgId)); } catch (err) { fail(res, err); }
});

router.get('/analyses/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const a = await getAnalysis(orgId, id);
    if (!a) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Coverage analysis not found.' } });
    res.json(a);
  } catch (err) { fail(res, err); }
});

const qualifyingSchema = z.object({
  hasTherapeuticIntent: z.boolean(),
  enrollsDiagnosisTreatment: z.boolean(),
  hasMedicareBenefitCategory: z.boolean(),
  deemedQualifying: z.boolean().optional(),
  desirableCharacteristicsCount: z.number().int().min(0).max(7).optional(),
  reason,
});
router.patch('/analyses/:id/qualifying', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = qualifyingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    const result = await setQualifyingDeterminationTx(client, orgId, id, parsed.data);
    recordCoverageQualifyingDetermination(result.determination);
    return { target: `coverage-analysis:${id}`, payload: { determination: result.determination }, body: { id, ...result } };
  });
});

// ─── Items ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  itemDescription: z.string().min(1).max(1000),
  category: CATEGORY.optional(),
  cptHcpcsCode: z.string().max(20).optional(),
  icd10Code: z.string().max(20).optional(),
  isStandardOfCare: z.boolean().optional(),
  sponsorPaidInBudget: z.boolean().optional(),
  reason,
});
router.post('/analyses/:id/items', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = itemSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: itemId } = await addItemTx(client, orgId, userId, id, parsed.data);
    recordCoverageItemAdded(parsed.data.category ?? 'other');
    return { target: `coverage-analysis:${id}`, payload: { itemId, category: parsed.data.category }, body: { analysisId: id, itemId } };
  });
});

router.get('/analyses/:id/items', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await listItems(orgId, id)); } catch (err) { fail(res, err); }
});

const classifySchema = z.object({
  isStandardOfCare: z.boolean(),
  sponsorPaidInBudget: z.boolean(),
  ncdCitation: z.string().max(200).optional(),
  lcdCitation: z.string().max(200).optional(),
  coverageDocUrl: z.string().max(500).optional(),
  reason,
});
router.patch('/items/:id/classify', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = classifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    const result = await classifyItemTx(client, orgId, id, parsed.data);
    recordCoverageItemClassified(result.classification);
    return { target: `coverage-item:${id}`, payload: { classification: result.classification, billingDesignation: result.billingDesignation }, body: { id, ...result } };
  });
});

const icd10Schema = z.object({ icd10Code: z.string().min(1).max(20), validated: z.boolean().optional(), reason });
router.patch('/items/:id/icd10', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = icd10Schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    // ICD-10 validation is performed by the caller (route consumers / AnA use the ICD-10 service);
    // here we persist the supplied validation verdict. Default to false when not asserted.
    await setItemIcd10Tx(client, orgId, id, { icd10Code: parsed.data.icd10Code, validated: !!parsed.data.validated });
    return { target: `coverage-item:${id}`, payload: { icd10Code: parsed.data.icd10Code }, body: { id, icd10Code: parsed.data.icd10Code, validated: !!parsed.data.validated } };
  });
});

// ─── Billing grid & suggestions (read-only) ──────────────────────────────────

router.get('/analyses/:id/billing-grid', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getBillingGrid(orgId, id)); } catch (err) { fail(res, err); }
});

router.get('/analyses/:id/suggest', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await suggestItemClassifications(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── Finalize (gated) ────────────────────────────────────────────────────────

router.post('/analyses/:id/finalize', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const { readiness } = await finalizeAnalysisTx(client, orgId, userId, id);
    recordCoverageFinalized();
    return { target: `coverage-analysis:${id}`, payload: { finalized: true }, body: { id, finalized: true, readiness } };
  });
});

export default router;
