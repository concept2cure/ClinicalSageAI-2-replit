/**
 * Regulatory Precedent Intelligence API Routes
 *
 * REST endpoints for the full regulatory precedent intelligence engine:
 *
 * CRL Trigger Patterns:
 *   POST /api/regulatory-precedent-intelligence/crl/search
 *   GET  /api/regulatory-precedent-intelligence/crl/:id
 *   POST /api/regulatory-precedent-intelligence/crl
 *   POST /api/regulatory-precedent-intelligence/crl/risk-assessment
 *   POST /api/regulatory-precedent-intelligence/crl/trajectories/search
 *   POST /api/regulatory-precedent-intelligence/crl/trajectories
 *   GET  /api/regulatory-precedent-intelligence/crl/stats/by-category
 *
 * RTF Trigger Patterns:
 *   POST /api/regulatory-precedent-intelligence/rtf/search
 *   GET  /api/regulatory-precedent-intelligence/rtf/:id
 *   POST /api/regulatory-precedent-intelligence/rtf
 *   POST /api/regulatory-precedent-intelligence/rtf/prevention-report
 *   GET  /api/regulatory-precedent-intelligence/rtf/:id/recovery-playbook
 *   GET  /api/regulatory-precedent-intelligence/rtf/stats/by-center
 *
 * EMA Question Taxonomy:
 *   POST /api/regulatory-precedent-intelligence/ema/search
 *   GET  /api/regulatory-precedent-intelligence/ema/:id
 *   POST /api/regulatory-precedent-intelligence/ema
 *   POST /api/regulatory-precedent-intelligence/ema/preparation-report
 *   POST /api/regulatory-precedent-intelligence/ema/clock-stop-prediction
 *
 * Advisory Committee:
 *   POST /api/regulatory-precedent-intelligence/advisory-committee/search
 *   GET  /api/regulatory-precedent-intelligence/advisory-committee/:id
 *   POST /api/regulatory-precedent-intelligence/advisory-committee
 *   POST /api/regulatory-precedent-intelligence/advisory-committee/risk-assessment
 *   GET  /api/regulatory-precedent-intelligence/advisory-committee/committee-types
 *
 * Confidence Calibration:
 *   POST /api/regulatory-precedent-intelligence/confidence/rules/search
 *   POST /api/regulatory-precedent-intelligence/confidence/rules
 *   POST /api/regulatory-precedent-intelligence/confidence/calculate
 *   POST /api/regulatory-precedent-intelligence/confidence/predictions
 *   POST /api/regulatory-precedent-intelligence/confidence/predictions/:id/resolve
 *   GET  /api/regulatory-precedent-intelligence/confidence/calibration-report
 *
 * Cross-Jurisdictional:
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/frameworks/search
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/frameworks
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/divergences/search
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/divergences
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/reliance/search
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/reliance
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/filing-strategies/search
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/filing-strategies
 *   POST /api/regulatory-precedent-intelligence/cross-jurisdictional/optimize-filing
 *
 * Health:
 *   GET  /api/regulatory-precedent-intelligence/health
 *
 * @module server/routes/regulatory-precedent-intelligence
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import {
  crlTriggerService,
  rtfTriggerService,
  emaQuestionTaxonomyService,
  advisoryCommitteeService,
  confidenceCalibrationService,
  crossJurisdictionalService,
} from '../services/regulatory-precedent-intelligence';

const router = Router();
const log = createScopedLogger('regulatory-precedent-intel-routes');

router.use((req: Request, res: Response, next) => {
  if (req.path === '/health' || orgIdOf(req)) return next();
  res.status(403).json({ error: 'Organization context required' });
});

// ─── Helper ──────────────────────────────────────────────────────────────────

/* The request body is spread FIRST and the organisation (and a route's :id)
   written after it, on every route below. They were written first, so a body
   naming organizationId searched, created or resolved another organisation's
   records. And a request with no organisation was served from, and wrote into,
   a tenant named 'default' that every such request shared; it is refused
   (2026-10-15). */
function orgIdOf(req: Request): string | null {
  const explicit = (req as Request & { organizationId?: number | string }).organizationId;
  if (explicit) return String(explicit);
  const fromUser =
    req.user?.organizationId ?? (req as Request & { tenantId?: number | string }).tenantId;
  return fromUser ? String(fromUser) : null;
}

/** The caller's organisation. The guard at the top of the router has already refused a request without one. */
function getOrgId(req: Request): string {
  const org = orgIdOf(req);
  if (!org) throw new Error('Organization context required');
  return org;
}

function handleError(res: Response, error: unknown, context: string) {
  log.error(`Error in ${context}`, {
    error: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json({ error: `Failed to ${context}` });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRL TRIGGER PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/crl/search', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const results = await crlTriggerService.searchPatterns({ ...req.body, organizationId: orgId });
    res.json({ patterns: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search CRL patterns');
  }
});

router.get('/crl/stats/by-category', async (req: Request, res: Response) => {
  try {
    const stats = await crlTriggerService.getStatsByCategory(getOrgId(req));
    res.json({ stats });
  } catch (error) {
    handleError(res, error, 'get CRL stats');
  }
});

router.get('/crl/:id', async (req: Request, res: Response) => {
  try {
    const pattern = await crlTriggerService.getPattern(String(req.params.id), getOrgId(req));
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (error) {
    handleError(res, error, 'get CRL pattern');
  }
});

router.post('/crl', async (req: Request, res: Response) => {
  try {
    const pattern = await crlTriggerService.createPattern({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(pattern);
  } catch (error) {
    handleError(res, error, 'create CRL pattern');
  }
});

router.post('/crl/risk-assessment', async (req: Request, res: Response) => {
  try {
    const assessment = await crlTriggerService.assessCRLRisk({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(assessment);
  } catch (error) {
    handleError(res, error, 'assess CRL risk');
  }
});

router.post('/crl/trajectories/search', async (req: Request, res: Response) => {
  try {
    const results = await crlTriggerService.searchTrajectories({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ trajectories: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search CRL trajectories');
  }
});

router.post('/crl/trajectories', async (req: Request, res: Response) => {
  try {
    const record = await crlTriggerService.recordTrajectory({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(record);
  } catch (error) {
    handleError(res, error, 'record CRL trajectory');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RTF TRIGGER PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/rtf/search', async (req: Request, res: Response) => {
  try {
    const results = await rtfTriggerService.searchPatterns({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ patterns: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search RTF patterns');
  }
});

router.get('/rtf/stats/by-center', async (req: Request, res: Response) => {
  try {
    const stats = await rtfTriggerService.getStatsByCenter(getOrgId(req));
    res.json({ stats });
  } catch (error) {
    handleError(res, error, 'get RTF stats');
  }
});

router.get('/rtf/:id', async (req: Request, res: Response) => {
  try {
    const pattern = await rtfTriggerService.getPattern(String(req.params.id), getOrgId(req));
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (error) {
    handleError(res, error, 'get RTF pattern');
  }
});

router.post('/rtf', async (req: Request, res: Response) => {
  try {
    const pattern = await rtfTriggerService.createPattern({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(pattern);
  } catch (error) {
    handleError(res, error, 'create RTF pattern');
  }
});

router.post('/rtf/prevention-report', async (req: Request, res: Response) => {
  try {
    const report = await rtfTriggerService.generatePreventionReport({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(report);
  } catch (error) {
    handleError(res, error, 'generate RTF prevention report');
  }
});

router.get('/rtf/:id/recovery-playbook', async (req: Request, res: Response) => {
  try {
    const playbook = await rtfTriggerService.getRecoveryPlaybook(String(req.params.id), getOrgId(req));
    if (!playbook) return res.status(404).json({ error: 'Pattern not found' });
    res.json(playbook);
  } catch (error) {
    handleError(res, error, 'get RTF recovery playbook');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMA QUESTION TAXONOMY
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/ema/search', async (req: Request, res: Response) => {
  try {
    const results = await emaQuestionTaxonomyService.searchPatterns({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ patterns: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search EMA patterns');
  }
});

router.get('/ema/:id', async (req: Request, res: Response) => {
  try {
    const pattern = await emaQuestionTaxonomyService.getPattern(String(req.params.id), getOrgId(req));
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (error) {
    handleError(res, error, 'get EMA pattern');
  }
});

router.post('/ema', async (req: Request, res: Response) => {
  try {
    const pattern = await emaQuestionTaxonomyService.createPattern({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(pattern);
  } catch (error) {
    handleError(res, error, 'create EMA pattern');
  }
});

router.post('/ema/preparation-report', async (req: Request, res: Response) => {
  try {
    const report = await emaQuestionTaxonomyService.generatePreparationReport({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(report);
  } catch (error) {
    handleError(res, error, 'generate EMA preparation report');
  }
});

router.post('/ema/clock-stop-prediction', async (req: Request, res: Response) => {
  try {
    const prediction = await emaQuestionTaxonomyService.predictClockStop({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(prediction);
  } catch (error) {
    handleError(res, error, 'predict EMA clock stop');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADVISORY COMMITTEE
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/advisory-committee/search', async (req: Request, res: Response) => {
  try {
    const results = await advisoryCommitteeService.searchPatterns({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ patterns: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search AC patterns');
  }
});

router.get('/advisory-committee/committee-types', async (req: Request, res: Response) => {
  try {
    const types = await advisoryCommitteeService.getCommitteeTypes(getOrgId(req));
    res.json({ committeeTypes: types });
  } catch (error) {
    handleError(res, error, 'get committee types');
  }
});

router.get('/advisory-committee/:id', async (req: Request, res: Response) => {
  try {
    const pattern = await advisoryCommitteeService.getPattern(String(req.params.id), getOrgId(req));
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    res.json(pattern);
  } catch (error) {
    handleError(res, error, 'get AC pattern');
  }
});

router.post('/advisory-committee', async (req: Request, res: Response) => {
  try {
    const pattern = await advisoryCommitteeService.createPattern({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(pattern);
  } catch (error) {
    handleError(res, error, 'create AC pattern');
  }
});

router.post('/advisory-committee/risk-assessment', async (req: Request, res: Response) => {
  try {
    const assessment = await advisoryCommitteeService.assessRisk({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(assessment);
  } catch (error) {
    handleError(res, error, 'assess AC risk');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE CALIBRATION
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/confidence/rules/search', async (req: Request, res: Response) => {
  try {
    const results = await confidenceCalibrationService.searchRules({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ rules: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search confidence rules');
  }
});

router.post('/confidence/rules', async (req: Request, res: Response) => {
  try {
    const rule = await confidenceCalibrationService.createRule({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(rule);
  } catch (error) {
    handleError(res, error, 'create confidence rule');
  }
});

router.post('/confidence/calculate', async (req: Request, res: Response) => {
  try {
    const score = await confidenceCalibrationService.calculateConfidence({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(score);
  } catch (error) {
    handleError(res, error, 'calculate confidence');
  }
});

router.post('/confidence/predictions', async (req: Request, res: Response) => {
  try {
    const entry = await confidenceCalibrationService.recordPrediction({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(entry);
  } catch (error) {
    handleError(res, error, 'record prediction');
  }
});

router.post('/confidence/predictions/:id/resolve', async (req: Request, res: Response) => {
  try {
    const entry = await confidenceCalibrationService.resolvePrediction({
      ...req.body,
      id: String(req.params.id),
      organizationId: getOrgId(req),
    });
    res.json(entry);
  } catch (error) {
    handleError(res, error, 'resolve prediction');
  }
});

router.get('/confidence/calibration-report', async (req: Request, res: Response) => {
  try {
    const ruleId = req.query.ruleId as string | undefined;
    const report = await confidenceCalibrationService.getCalibrationReport(getOrgId(req), ruleId);
    res.json(report);
  } catch (error) {
    handleError(res, error, 'get calibration report');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-JURISDICTIONAL
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/cross-jurisdictional/frameworks/search', async (req: Request, res: Response) => {
  try {
    const results = await crossJurisdictionalService.searchFrameworks({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ frameworks: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search frameworks');
  }
});

router.post('/cross-jurisdictional/frameworks', async (req: Request, res: Response) => {
  try {
    const fw = await crossJurisdictionalService.createFramework({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(fw);
  } catch (error) {
    handleError(res, error, 'create framework');
  }
});

router.post('/cross-jurisdictional/divergences/search', async (req: Request, res: Response) => {
  try {
    const results = await crossJurisdictionalService.searchDivergences({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ divergences: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search divergences');
  }
});

router.post('/cross-jurisdictional/divergences', async (req: Request, res: Response) => {
  try {
    const div = await crossJurisdictionalService.createDivergence({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(div);
  } catch (error) {
    handleError(res, error, 'create divergence');
  }
});

router.post('/cross-jurisdictional/reliance/search', async (req: Request, res: Response) => {
  try {
    const results = await crossJurisdictionalService.searchReliancePathways({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json({ pathways: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search reliance pathways');
  }
});

router.post('/cross-jurisdictional/reliance', async (req: Request, res: Response) => {
  try {
    const pw = await crossJurisdictionalService.createReliancePathway({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(pw);
  } catch (error) {
    handleError(res, error, 'create reliance pathway');
  }
});

router.post(
  '/cross-jurisdictional/filing-strategies/search',
  async (req: Request, res: Response) => {
    try {
      const results = await crossJurisdictionalService.searchFilingStrategies({
        ...req.body,
        organizationId: getOrgId(req),
      });
      res.json({ strategies: results, count: results.length });
    } catch (error) {
      handleError(res, error, 'search filing strategies');
    }
  }
);

router.post('/cross-jurisdictional/filing-strategies', async (req: Request, res: Response) => {
  try {
    const strategy = await crossJurisdictionalService.createFilingStrategy({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.status(201).json(strategy);
  } catch (error) {
    handleError(res, error, 'create filing strategy');
  }
});

router.post('/cross-jurisdictional/optimize-filing', async (req: Request, res: Response) => {
  try {
    const result = await crossJurisdictionalService.optimizeFilingSequence({
      ...req.body,
      organizationId: getOrgId(req),
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'optimize filing sequence');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'regulatory-precedent-intelligence',
    status: 'healthy',
    modules: [
      'crl-trigger-patterns',
      'rtf-trigger-patterns',
      'ema-question-taxonomy',
      'advisory-committee',
      'confidence-calibration',
      'cross-jurisdictional',
    ],
    timestamp: new Date().toISOString(),
  });
});

export default router;
