/**
 * Design controls (DHF) + Risk Management File (ISO 14971) routes.
 * Mounted at /api/design-risk.
 *
 *   Design controls
 *     GET  /design-inputs           POST /design-inputs
 *     GET  /design-outputs          POST /design-outputs
 *     GET  /design-verifications    POST /design-verifications
 *     GET  /design-validations      POST /design-validations
 *     GET  /design-reviews          POST /design-reviews
 *     GET  /design-changes          POST /design-changes
 *     POST /design-plan
 *     GET  /dhf/assessment?program_id=...     (21 CFR 820.30 completeness)
 *
 *   Risk management
 *     GET  /rmf                       POST /rmf
 *     POST /rmf/:id/items
 *     POST /risk-items/:id/controls
 *     GET  /rmf/:id/summary           (ISO 14971 residual-risk + benefit-risk)
 *
 * All endpoints require an authenticated user with an organization context.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import auditService from '../services/auditService';
import {
  createDesignInput, listDesignInputs,
  createDesignOutput, listDesignOutputs,
  createDesignVerification, listDesignVerifications,
  createDesignValidation, listDesignValidations,
  createDesignReview, listDesignReviews,
  createDesignChange, listDesignChanges,
  upsertDesignPlan,
  assessDhf,
  createRmf, getRmf, listRmfs, createRiskItem, addRiskControl, summarizeRmf,
} from '../services/design-risk/design-risk.service';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): string | null {
  const raw = (req as any).user?.id;
  return raw === undefined || raw === null ? null : String(raw);
}
function q(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}
function pathParam(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}
function reqStr(body: any, key: string): string | null {
  return typeof body[key] === 'string' && body[key].trim().length > 0 ? body[key] : null;
}
function fail(res: Response, e: unknown): Response {
  const msg = e instanceof Error ? e.message : 'unknown';
  if (msg.includes('not found in tenant')) return res.status(404).json({ error: msg });
  return res.status(500).json({ error: 'Operation failed', detail: msg });
}

const SEVERITY = ['negligible', 'minor', 'serious', 'critical', 'catastrophic'];
const PROBABILITY = ['improbable', 'remote', 'occasional', 'probable', 'frequent'];
const CONTROL_OPTIONS = ['inherent_safety_by_design', 'protective_measure', 'information_for_safety'];
const INPUT_CATEGORIES = ['intended_use', 'user_need', 'functional', 'performance', 'safety', 'regulatory', 'usability', 'interface'];

// ─── Design inputs ──────────────────────────────────────────────────────────
router.get('/design-inputs', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listDesignInputs(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/design-inputs', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const requirement = reqStr(b, 'requirement');
  if (!requirement) return res.status(422).json({ error: 'requirement is required' });
  if (!INPUT_CATEGORIES.includes(b.category)) return res.status(422).json({ error: `category must be one of: ${INPUT_CATEGORIES.join(', ')}` });
  try {
    const row = await createDesignInput(orgId, { programId: b.programId, requirement, category: b.category, riskItemRef: b.riskItemRef ?? null });
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'design.input.create', resourceType: 'design_input', resourceId: row.id });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Design outputs ─────────────────────────────────────────────────────────
router.get('/design-outputs', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listDesignOutputs(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/design-outputs', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const description = reqStr(b, 'description');
  if (!description) return res.status(422).json({ error: 'description is required' });
  try {
    const row = await createDesignOutput(orgId, {
      programId: b.programId, description,
      satisfiesInputIds: Array.isArray(b.satisfiesInputIds) ? b.satisfiesInputIds : [],
      hasAcceptanceCriteria: b.hasAcceptanceCriteria === true,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Design verifications ───────────────────────────────────────────────────
router.get('/design-verifications', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listDesignVerifications(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/design-verifications', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const description = reqStr(b, 'description');
  if (!description) return res.status(422).json({ error: 'description is required' });
  if (b.result !== undefined && b.result !== null && !['pass', 'fail', 'pending'].includes(b.result)) {
    return res.status(422).json({ error: 'result must be pass|fail|pending' });
  }
  try {
    const row = await createDesignVerification(orgId, {
      programId: b.programId, description,
      verifiesOutputIds: Array.isArray(b.verifiesOutputIds) ? b.verifiesOutputIds : [],
      result: b.result ?? null,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Design validations ─────────────────────────────────────────────────────
router.get('/design-validations', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listDesignValidations(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/design-validations', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const description = reqStr(b, 'description');
  if (!description) return res.status(422).json({ error: 'description is required' });
  if (b.result !== undefined && b.result !== null && !['pass', 'fail', 'pending'].includes(b.result)) {
    return res.status(422).json({ error: 'result must be pass|fail|pending' });
  }
  try {
    const row = await createDesignValidation(orgId, {
      programId: b.programId, description,
      validatesInputIds: Array.isArray(b.validatesInputIds) ? b.validatesInputIds : [],
      productionEquivalent: b.productionEquivalent === true,
      result: b.result ?? null,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Design reviews ─────────────────────────────────────────────────────────
router.get('/design-reviews', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listDesignReviews(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/design-reviews', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const phase = reqStr(b, 'phase');
  if (!phase) return res.status(422).json({ error: 'phase is required' });
  try {
    const row = await createDesignReview(orgId, {
      programId: b.programId, phase,
      independentReviewerPresent: b.independentReviewerPresent === true,
      actionItemsOpen: Number.isInteger(b.actionItemsOpen) ? b.actionItemsOpen : 0,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Design changes ─────────────────────────────────────────────────────────
router.get('/design-changes', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listDesignChanges(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/design-changes', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const description = reqStr(b, 'description');
  if (!description) return res.status(422).json({ error: 'description is required' });
  try {
    const row = await createDesignChange(orgId, {
      programId: b.programId, description,
      reviewed: b.reviewed === true, verifiedOrValidated: b.verifiedOrValidated === true,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── Design plan ────────────────────────────────────────────────────────────
router.post('/design-plan', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const title = reqStr(b, 'title');
  if (!title) return res.status(422).json({ error: 'title is required' });
  try {
    const row = await upsertDesignPlan(orgId, {
      programId: b.programId, title, designTransferDocumented: b.designTransferDocumented === true,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── DHF assessment ─────────────────────────────────────────────────────────
router.get('/dhf/assessment', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { res.json(await assessDhf(orgId, q(req, 'program_id'))); }
  catch (e) { fail(res, e); }
});

// ─── Risk management files ──────────────────────────────────────────────────
router.get('/rmf', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try { const rows = await listRmfs(orgId, q(req, 'program_id')); res.json({ rows, count: rows.length }); }
  catch (e) { fail(res, e); }
});
router.post('/rmf', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  const deviceName = reqStr(b, 'deviceName');
  if (!deviceName) return res.status(422).json({ error: 'deviceName is required' });
  if (b.benefitMagnitude !== undefined && b.benefitMagnitude !== null && !['low', 'moderate', 'high'].includes(b.benefitMagnitude)) {
    return res.status(422).json({ error: 'benefitMagnitude must be low|moderate|high' });
  }
  try {
    const row = await createRmf(orgId, {
      programId: b.programId, deviceName,
      benefitDocumented: b.benefitDocumented === true, benefitMagnitude: b.benefitMagnitude ?? null,
    });
    await auditService.logAction({ tenantId: orgId, userId: getUserId(req) ?? undefined, action: 'risk.rmf.create', resourceType: 'risk_management_file', resourceId: row.id });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.get('/rmf/:id', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const row = await getRmf(orgId, pathParam(req, 'id'));
    if (!row) return res.status(404).json({ error: 'RMF not found' });
    res.json(row);
  } catch (e) { fail(res, e); }
});

// ─── Risk items + controls ──────────────────────────────────────────────────
router.post('/rmf/:id/items', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  for (const f of ['hazard', 'hazardousSituation', 'harm']) {
    if (!reqStr(b, f)) return res.status(422).json({ error: `${f} is required` });
  }
  if (!SEVERITY.includes(b.initialSeverity)) return res.status(422).json({ error: `initialSeverity must be one of: ${SEVERITY.join(', ')}` });
  if (!PROBABILITY.includes(b.initialP1)) return res.status(422).json({ error: `initialP1 must be one of: ${PROBABILITY.join(', ')}` });
  if (!PROBABILITY.includes(b.initialP2)) return res.status(422).json({ error: `initialP2 must be one of: ${PROBABILITY.join(', ')}` });
  for (const [f, set] of [['residualSeverity', SEVERITY], ['residualP1', PROBABILITY], ['residualP2', PROBABILITY]] as const) {
    if (b[f] !== undefined && b[f] !== null && !set.includes(b[f])) {
      return res.status(422).json({ error: `${f} must be one of: ${set.join(', ')}` });
    }
  }
  try {
    const row = await createRiskItem(orgId, {
      rmfId: pathParam(req, 'id'),
      hazard: b.hazard, hazardousSituation: b.hazardousSituation, harm: b.harm,
      initialSeverity: b.initialSeverity, initialP1: b.initialP1, initialP2: b.initialP2,
      residualSeverity: b.residualSeverity ?? null, residualP1: b.residualP1 ?? null, residualP2: b.residualP2 ?? null,
      designInputRef: b.designInputRef ?? null,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.post('/risk-items/:id/controls', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const b = req.body ?? {};
  if (!CONTROL_OPTIONS.includes(b.option)) return res.status(422).json({ error: `option must be one of: ${CONTROL_OPTIONS.join(', ')}` });
  const description = reqStr(b, 'description');
  if (!description) return res.status(422).json({ error: 'description is required' });
  try {
    const row = await addRiskControl(orgId, {
      riskItemId: pathParam(req, 'id'), option: b.option, description,
      verified: b.verified === true, verificationRef: b.verificationRef ?? null,
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});

// ─── RMF summary (ISO 14971 §6–8) ───────────────────────────────────────────
router.get('/rmf/:id/summary', async (req, res) => {
  const orgId = getOrgId(req); if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const result = await summarizeRmf(orgId, pathParam(req, 'id'));
    if (!result) return res.status(404).json({ error: 'RMF not found' });
    res.json(result);
  } catch (e) { fail(res, e); }
});

export default router;
