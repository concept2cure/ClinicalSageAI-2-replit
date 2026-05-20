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

export default router;
