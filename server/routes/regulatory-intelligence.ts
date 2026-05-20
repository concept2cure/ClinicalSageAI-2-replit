/**
 * Regulatory Intelligence API.
 *
 * Public surface for AnA 1.0 RI — the predictive CRL/RTF layer that compounds
 * with every submission outcome that flows through the platform.
 *
 *   POST   /api/regulatory-intelligence/score
 *          Score an in-flight submission draft. Returns rule-based completeness,
 *          predictive CRL/RTF/first-cycle probabilities, and a blended readiness
 *          score with recommendations.
 *
 *   POST   /api/regulatory-intelligence/outcomes/recorded
 *          Notify the layer that one or more submission outcomes have landed.
 *          Triggers feature extraction, precedent ingestion, model retraining,
 *          and network-prior rebuild.
 *
 *   GET    /api/regulatory-intelligence/network-insights
 *          Look up the cross-tenant prior for a (target, submission_type,
 *          agency, therapeutic_area, completeness_bin) combination. Rates are
 *          differentially-private and k-anonymized.
 *
 *   POST   /api/regulatory-intelligence/retrain
 *          Force-retrain a target. Returns the new version's metrics. Gated
 *          on min sample size inside the model; tiny corpora are no-ops.
 *
 *   POST   /api/regulatory-intelligence/network-priors/rebuild
 *          Force a network-prior rebuild. Use after large outcome backfills.
 *
 *   GET    /api/regulatory-intelligence/model-info
 *          Inspect the active model versions: sample size, log loss, AUC,
 *          Brier, last-trained timestamp.
 *
 * Every route is tenant-scoped via the standard `requireAuthedOrgId` guard.
 *
 * @module server/routes/regulatory-intelligence
 */

import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger.js';
import { requireAuthedOrgId } from '../utils/authedOrgId.js';
import {
  scoreSubmissionDraft,
  onOutcomeRecorded,
  trainModel,
  rebuildNetworkPriors,
  lookupNetworkPrior,
  getModelInfo,
  REGULATORY_INTELLIGENCE_VERSION,
} from '../services/intelligence/regulatory-intelligence.js';
import type { RiskTarget } from '../services/intelligence/risk-model.js';
import type { CompletenessBin } from '../services/intelligence/outcome-feature-extraction.js';
import {
  recordInteraction,
  extractFailurePatterns,
  getSuggestedCorrections,
  getAgencyRequirements,
  promotePatternToRequirement,
  OUTCOMES,
  type Outcome,
} from '../services/intelligence/ana-failure-learning.js';

const log = createScopedLogger('regulatory-intelligence-routes');
const router: Router = express.Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const ALLOWED_TARGETS: ReadonlyArray<RiskTarget> = ['rtf', 'crl', 'first_cycle_approval'];
function isRiskTarget(value: unknown): value is RiskTarget {
  return typeof value === 'string' && (ALLOWED_TARGETS as readonly string[]).includes(value);
}
function isCompletenessBin(value: unknown): value is CompletenessBin {
  return value === 'low' || value === 'medium' || value === 'high';
}

// ─── POST /score ─────────────────────────────────────────────────────────────

router.post('/score', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;

  const body = req.body ?? {};
  const submissionType = typeof body.submissionType === 'string' ? body.submissionType : null;
  const presentSections = Array.isArray(body.presentSections) ? body.presentSections.map(String) : null;
  if (!submissionType || !presentSections) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'submissionType (string) and presentSections (string[]) are required',
    });
  }

  const projectId = Number.isFinite(Number(body.projectId)) ? Number(body.projectId) : undefined;
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : undefined;
  const targetAgency = typeof body.targetAgency === 'string' ? body.targetAgency : undefined;
  const therapeuticArea = typeof body.therapeuticArea === 'string' ? body.therapeuticArea : null;

  const sectionScores =
    body.sectionScores && typeof body.sectionScores === 'object' && !Array.isArray(body.sectionScores)
      ? (body.sectionScores as Record<string, number>)
      : undefined;

  const harmonizeIssueCount = Number.isFinite(Number(body.harmonizeIssueCount))
    ? Number(body.harmonizeIssueCount)
    : undefined;
  const openEscalations = Number.isFinite(Number(body.openEscalations))
    ? Number(body.openEscalations)
    : undefined;

  const result = await scoreSubmissionDraft({
    organizationId: guard.orgId,
    projectId,
    submissionId,
    submissionType,
    targetAgency,
    therapeuticArea,
    presentSections,
    sectionScores,
    harmonizeIssueCount,
    openEscalations,
  });

  res.json({ success: true, data: result });
}));

// ─── POST /outcomes/recorded ────────────────────────────────────────────────

router.post('/outcomes/recorded', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;

  const body = req.body ?? {};
  const retrain = body.retrain === undefined ? true : !!body.retrain;

  log.info(`Outcome ingestion triggered by org=${guard.orgId} retrain=${retrain}`);
  const result = await onOutcomeRecorded({ retrain });
  res.json({ success: true, data: result, engineVersion: REGULATORY_INTELLIGENCE_VERSION });
}));

// ─── GET /network-insights ───────────────────────────────────────────────────

router.get('/network-insights', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;

  const target = req.query.target;
  if (!isRiskTarget(target)) {
    return res.status(400).json({ error: 'invalid_request', message: `target must be one of ${ALLOWED_TARGETS.join(', ')}` });
  }
  const submissionType = req.query.submissionType;
  const agency = req.query.agency;
  if (typeof submissionType !== 'string' || typeof agency !== 'string') {
    return res.status(400).json({ error: 'invalid_request', message: 'submissionType and agency are required' });
  }
  const therapeuticArea = typeof req.query.therapeuticArea === 'string' ? req.query.therapeuticArea : null;
  const cbRaw = req.query.completenessBin;
  const completenessBin = isCompletenessBin(cbRaw) ? cbRaw : null;

  const result = await lookupNetworkPrior({
    target,
    submissionType,
    agency,
    therapeuticArea,
    completenessBin,
  });
  res.json({ success: true, data: result });
}));

// ─── POST /retrain ───────────────────────────────────────────────────────────

router.post('/retrain', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;

  const body = req.body ?? {};
  const target = body.target;
  if (!isRiskTarget(target)) {
    return res.status(400).json({ error: 'invalid_request', message: `target must be one of ${ALLOWED_TARGETS.join(', ')}` });
  }
  const markActive = body.markActive === undefined ? true : !!body.markActive;
  const result = await trainModel({ target, markActive });
  log.info(`Retrain ${target} by org=${guard.orgId} trained=${result.trained} reason=${result.reason ?? 'ok'}`);
  res.json({ success: true, data: result });
}));

// ─── POST /network-priors/rebuild ────────────────────────────────────────────

router.post('/network-priors/rebuild', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;

  const body = req.body ?? {};
  const epsilon = Number.isFinite(Number(body.epsilon)) ? Number(body.epsilon) : undefined;
  const result = await rebuildNetworkPriors({ epsilon });
  log.info(`Network prior rebuild by org=${guard.orgId} published=${result.published} suppressed=${result.suppressed}`);
  res.json({ success: true, data: result });
}));

// ─── GET /model-info ─────────────────────────────────────────────────────────

router.get('/model-info', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const info = await getModelInfo();
  res.json({ success: true, data: info, engineVersion: REGULATORY_INTELLIGENCE_VERSION });
}));

// ─── AnA Failure Learning ────────────────────────────────────────────────────
//
// POST  /interactions               record an AnA interaction outcome
// GET   /corrections                retrieve cross-tenant corrections matching
//                                   (agency, documentType, intent)
// POST  /patterns/extract           run the cluster-promotion job
// GET   /agency-requirements        discovered per-agency rules
// POST  /patterns/:id/promote       promote a pattern into a requirement
//
// These let AnA's chat path self-correct: on every turn, hit /corrections to
// fetch any known fixes for the (agency × doc_type × intent) tuple and
// prepend them to the system prompt. After the user responds, POST the
// outcome back to /interactions so the loop closes.

function isOutcome(v: unknown): v is Outcome {
  return typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);
}

router.post('/interactions', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const body = req.body ?? {};
  if (!isOutcome(body.outcome)) {
    return res.status(400).json({
      error: 'invalid_request',
      message: `outcome must be one of ${OUTCOMES.join(', ')}`,
    });
  }
  if (typeof body.agency !== 'string' || typeof body.documentType !== 'string' || typeof body.intent !== 'string') {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'agency, documentType, and intent are required strings',
    });
  }
  const result = await recordInteraction({
    organizationId: guard.orgId,
    projectId: Number.isFinite(Number(body.projectId)) ? Number(body.projectId) : undefined,
    userId: Number.isFinite(Number(body.userId)) ? Number(body.userId) : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    artifactId: typeof body.artifactId === 'string' ? body.artifactId : undefined,
    agency: body.agency,
    documentType: body.documentType,
    submissionType: typeof body.submissionType === 'string' ? body.submissionType : undefined,
    intent: body.intent,
    outcome: body.outcome,
    anaConfidence: Number.isFinite(Number(body.anaConfidence)) ? Number(body.anaConfidence) : undefined,
    userCorrected: typeof body.userCorrected === 'boolean' ? body.userCorrected : undefined,
    promptSummary: typeof body.promptSummary === 'string' ? body.promptSummary : undefined,
    responseSummary: typeof body.responseSummary === 'string' ? body.responseSummary : undefined,
    correctionText: typeof body.correctionText === 'string' ? body.correctionText : undefined,
  });
  res.status(201).json({ success: true, data: result });
}));

router.get('/corrections', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const agency = req.query.agency;
  const documentType = req.query.documentType;
  const intent = req.query.intent;
  if (typeof agency !== 'string' || typeof documentType !== 'string' || typeof intent !== 'string') {
    return res.status(400).json({ error: 'invalid_request', message: 'agency, documentType, intent are required' });
  }
  const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : undefined;
  const data = await getSuggestedCorrections({ agency, documentType, intent, limit });
  res.json({ success: true, data });
}));

router.post('/patterns/extract', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const body = req.body ?? {};
  const result = await extractFailurePatterns({
    minTenantCount: Number.isFinite(Number(body.minTenantCount)) ? Number(body.minTenantCount) : undefined,
    minFailureCount: Number.isFinite(Number(body.minFailureCount)) ? Number(body.minFailureCount) : undefined,
    correctionQuorum: Number.isFinite(Number(body.correctionQuorum)) ? Number(body.correctionQuorum) : undefined,
    lookbackDays: Number.isFinite(Number(body.lookbackDays)) ? Number(body.lookbackDays) : undefined,
  });
  log.info(`Pattern extraction triggered by org=${guard.orgId} evaluated=${result.evaluated} promoted=${result.promoted}`);
  res.json({ success: true, data: result });
}));

router.get('/agency-requirements', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const agency = req.query.agency;
  if (typeof agency !== 'string') {
    return res.status(400).json({ error: 'invalid_request', message: 'agency is required' });
  }
  const documentType = typeof req.query.documentType === 'string' ? req.query.documentType : undefined;
  const includeUnvalidated = req.query.includeUnvalidated === 'false' ? false : true;
  const data = await getAgencyRequirements({ agency, documentType, includeUnvalidated });
  res.json({ success: true, data });
}));

router.post('/patterns/:id/promote', asyncHandler(async (req: Request, res: Response) => {
  const guard = requireAuthedOrgId(req, res);
  if (!guard.ok) return;
  const patternId = req.params.id;
  if (typeof patternId !== 'string' || patternId.length === 0) {
    return res.status(400).json({ error: 'invalid_request', message: 'pattern id is required' });
  }
  const body = req.body ?? {};
  if (typeof body.requirementSummary !== 'string' || body.requirementSummary.trim().length === 0) {
    return res.status(400).json({ error: 'invalid_request', message: 'requirementSummary is required' });
  }
  const result = await promotePatternToRequirement({
    patternId,
    requirementSummary: body.requirementSummary,
    requirementDetail: typeof body.requirementDetail === 'string' ? body.requirementDetail : undefined,
    submissionType: typeof body.submissionType === 'string' ? body.submissionType : undefined,
    validateImmediately: !!body.validateImmediately,
    validatedBy: typeof body.validatedBy === 'string' ? body.validatedBy : `org:${guard.orgId}`,
  });
  res.status(201).json({ success: true, data: result });
}));

export default router;
