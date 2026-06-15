/**
 * Global Regulatory Intelligence (RI) REST surface.
 *
 * Deterministic, expert-level cross-market regulatory services for RA strategy:
 *   - Regional Module 1 requirements + readiness (per market).
 *   - Global review-timeline projection (per region/procedure).
 *   - Expedited/accelerated program matching (per region).
 *   - Regulatory pathway/strategy recommendation (product × markets).
 *
 * Mounted at /api/global-ri with authenticateToken applied at mount time.
 * All services are pure/deterministic over the request body.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  assessRegionalModule1,
  getRegionalModule1Requirements,
  type RegulatoryMarket,
} from '../services/global-ri/regional-module1-requirements';
import { projectReviewTimeline } from '../services/global-ri/global-review-timeline';
import { matchExpeditedPrograms, EXPEDITED_PROGRAMS } from '../services/global-ri/expedited-programs';
import { recommendPathway } from '../services/global-ri/regulatory-pathway-advisor';
import { recommendMeetings, meetingsForMarket, MEETING_CATALOG, type MeetingMarket } from '../services/global-ri/ha-meetings';
import { assessDesignationEligibility, getDesignationCriteria } from '../services/global-ri/special-designations';
import { buildStrategyBrief } from '../services/global-ri/regulatory-strategy-brief';
import { estimateFees, getFeeSchedule, type FeeMarket } from '../services/global-ri/regulatory-fee-estimator';
import { assessLabeling, getLabelingRequirements, type LabelMarket } from '../services/global-ri/labeling-requirements';
import { assessCtaReadiness, getCtaRequirements, type CtaMarket } from '../services/global-ri/clinical-trial-application-requirements';
import { classifyChange, getChangeVehicles, CHANGE_CATEGORIES, type ChangeMarket } from '../services/global-ri/post-approval-changes';
import { ICH_GUIDELINES, getGuideline, guidelinesByCategory, searchGuidelines, listCategories } from '../services/global-ri/ich-guideline-catalog';
import { computeExclusivity, getExclusivityRules, PRODUCT_CLASSES, type ExclusivityMarket } from '../services/global-ri/exclusivity-periods';
import { classifyDossier, getLegalBases, type DossierRegion } from '../services/global-ri/dossier-classifier';
import { getPediatricObligation, assessPediatricPlan, PEDIATRIC_MARKETS, type PediatricMarket } from '../services/global-ri/pediatric-requirements';
import { getNonclinicalRequirements, recommendToxDuration, NONCLINICAL_PHASES, type NonclinicalPhase } from '../services/global-ri/nonclinical-requirements';
import { getSubmissionFormat, assessSubmissionReadiness, SUBMISSION_MARKETS, type SubmissionMarket } from '../services/global-ri/electronic-submission-format';
import { getInspectionProfile, getReadinessDomains, assessInspectionReadiness, INSPECTION_MARKETS, type InspectionMarket } from '../services/global-ri/inspection-readiness';
import { getGuidanceFor, listGuidanceTopics } from '../services/global-ri/regulatory-guidance-map';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('global-ri-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function fail(res: Response, err: unknown): void {
  logger.error('global-ri route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Global RI request failed.' } });
}

// ── Regional Module 1 requirements ────────────────────────────────────────────

/**
 * Assess a sponsor's Module 1 components against a market's required set.
 * Body: { market, providedComponents: string[] }.
 */
router.post('/module1/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedComponents)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedComponents[] are required.' } });
  }
  try {
    res.json(assessRegionalModule1({ market: b.market as RegulatoryMarket, providedComponents: b.providedComponents }));
  } catch (err) {
    fail(res, err);
  }
});

/** List a market's required Module 1 components (checklist). */
router.get('/module1/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as RegulatoryMarket;
  const requirements = getRegionalModule1Requirements(market);
  if (requirements.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No Module 1 requirements modeled for market "${market}".` } });
  }
  res.json({ market, requirements });
});

// ── Global review-timeline projection ─────────────────────────────────────────

/**
 * Project the regulatory review timeline for a region/procedure.
 * Body: { region, procedure, startDate }.
 */
router.post('/review-timeline', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !b.procedure || !b.startDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region, procedure and startDate are required.' } });
  }
  try {
    res.json(projectReviewTimeline({ region: b.region, procedure: String(b.procedure), startDate: b.startDate }));
  } catch (err) {
    // An unknown region/procedure throws — surface as a 400 validation error.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region/procedure.' } });
  }
});

// ── Expedited / accelerated programs ──────────────────────────────────────────

/** The full catalog of modeled expedited programs. */
router.get('/expedited-programs', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ programs: EXPEDITED_PROGRAMS });
});

/**
 * Match a product's profile to a region's expedited programs.
 * Body: { region, seriousOrLifeThreatening?, unmetMedicalNeed?, ... }.
 */
router.post('/expedited-programs/match', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region is required.' } });
  }
  try {
    res.json(matchExpeditedPrograms(b));
  } catch (err) {
    fail(res, err);
  }
});

// ── Regulatory pathway / strategy ─────────────────────────────────────────────

/**
 * Recommend the regulatory pathway per target market for a product.
 * Body: { productType, targetMarkets: Market[], developmentPhase? }.
 */
router.post('/pathway', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.productType || !Array.isArray(b.targetMarkets)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'productType and targetMarkets[] are required.' } });
  }
  try {
    res.json(recommendPathway({ productType: b.productType, targetMarkets: b.targetMarkets, developmentPhase: b.developmentPhase }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Health Authority meetings ─────────────────────────────────────────────────

/** The full modeled HA meeting catalog (optionally filtered by ?market=). */
router.get('/meetings', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = typeof req.query.market === 'string' ? (req.query.market as MeetingMarket) : null;
  res.json({ meetings: market ? meetingsForMarket(market) : MEETING_CATALOG });
});

/**
 * Recommend the appropriate HA meeting(s) for a market + development milestone.
 * Body: { market, milestone }.
 */
router.post('/meetings/recommend', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.milestone) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and milestone are required.' } });
  }
  try {
    res.json(recommendMeetings({ market: b.market, milestone: b.milestone }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Special designations (orphan / pediatric) ─────────────────────────────────

/** A market's orphan/pediatric designation criteria reference. */
router.get('/designations/criteria/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market);
  const criteria = getDesignationCriteria(market as any);
  if (!criteria) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No designation criteria modeled for "${market}".` } });
  }
  res.json({ market, criteria });
});

/**
 * Assess orphan + pediatric designation eligibility for a market.
 * Body: { market, usPrevalence?, euPrevalencePer10k?, jpPrevalence?, ... }.
 */
router.post('/designations/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(assessDesignationEligibility(b));
  } catch (err) {
    fail(res, err);
  }
});

// ── Regulatory strategy brief (cross-market orchestration) ─────────────────────

/**
 * Build a cross-market regulatory strategy brief: pathway + designations +
 * expedited programs + HA meetings + Module 1 per target market.
 * Body: { productType, targetMarkets, developmentPhase?, nextMilestone?, disease?, pediatricDevelopment? }.
 */
router.post('/strategy-brief', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.productType || !Array.isArray(b.targetMarkets)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'productType and targetMarkets[] are required.' } });
  }
  try {
    res.json(buildStrategyBrief(b));
  } catch (err) {
    fail(res, err);
  }
});

// ── Regulatory fee estimation ─────────────────────────────────────────────────

/** A market's indicative fee schedule. */
router.get('/fees/schedule/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as FeeMarket;
  const schedule = getFeeSchedule(market);
  if (!schedule) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No fee schedule modeled for "${market}".` } });
  }
  res.json({ market, schedule });
});

/**
 * Estimate agency fees for a marketing application, applying waivers.
 * Body: { market, requiresClinicalData?, orphan?, smallBusiness?, programYears?, feeScheduleOverride? }.
 */
router.post('/fees/estimate', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(estimateFees(b));
  } catch (err) {
    fail(res, err);
  }
});

// ── Cross-market labeling (PI / SmPC / package insert) ────────────────────────

/** A market's required labeling sections. */
router.get('/labeling/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as LabelMarket;
  const sections = getLabelingRequirements(market);
  if (sections.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No labeling requirements modeled for "${market}".` } });
  }
  res.json({ market, sections });
});

/** Assess provided labeling sections against a market's required set. Body: { market, providedSections }. */
router.post('/labeling/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedSections)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedSections[] are required.' } });
  }
  try {
    res.json(assessLabeling({ market: b.market, providedSections: b.providedSections }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Clinical-trial-application requirements (IND / CTA / CTN) ──────────────────

/** A market's required clinical-trial-application components. */
router.get('/cta/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as CtaMarket;
  const requirements = getCtaRequirements(market);
  if (requirements.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No CTA requirements modeled for "${market}".` } });
  }
  res.json({ market, requirements });
});

/** Assess CTA readiness for a market. Body: { market, providedComponents }. */
router.post('/cta/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedComponents)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedComponents[] are required.' } });
  }
  try {
    res.json(assessCtaReadiness({ market: b.market, providedComponents: b.providedComponents }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Post-approval changes / variations ────────────────────────────────────────

/** The modeled change-category list + a market's change-vehicle catalog. */
router.get('/changes/vehicles/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as ChangeMarket;
  const vehicles = getChangeVehicles(market);
  if (!vehicles) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No change vehicles modeled for "${market}".` } });
  }
  res.json({ market, categories: CHANGE_CATEGORIES, vehicles });
});

/**
 * Classify a post-approval change into the correct regulatory vehicle.
 * Body: { market, category }.
 */
router.post('/changes/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.category) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and category are required.' } });
  }
  try {
    res.json(classifyChange({ market: b.market, category: b.category }));
  } catch (err) {
    // Unmodeled market/category → 400 validation.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid change.' } });
  }
});

// ── ICH guideline reference catalog ───────────────────────────────────────────

/** The ICH guideline catalog; ?category= filters, ?q= searches. */
router.get('/ich-guidelines', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  let guidelines = ICH_GUIDELINES;
  if (q) guidelines = searchGuidelines(q);
  else if (category) guidelines = guidelinesByCategory(category as any);
  res.json({ categories: listCategories(), guidelines });
});

/** A single ICH guideline by code. */
router.get('/ich-guidelines/:code', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const code = String(Array.isArray(req.params.code) ? req.params.code[0] : req.params.code);
  const guideline = getGuideline(code);
  if (!guideline) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No ICH guideline "${code}".` } });
  }
  res.json(guideline);
});

// ── Regulatory exclusivity & loss-of-exclusivity (LOE) ────────────────────────

/** A market's modeled exclusivity rules (base regime per product class + orphan). */
router.get('/exclusivity/rules/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as ExclusivityMarket;
  const rules = getExclusivityRules(market);
  if (!rules) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No exclusivity rules modeled for "${market}".` } });
  }
  res.json({ market, productClasses: PRODUCT_CLASSES, ...rules });
});

/**
 * Compute the binding regulatory exclusivity and project the LOE date.
 * Body: { market, productClass, orphan?, pediatricExtension?, approvalDate? }.
 */
router.post('/exclusivity/compute', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.productClass) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and productClass are required.' } });
  }
  try {
    res.json(computeExclusivity(b));
  } catch (err) {
    // Unmodeled market/class or invalid approvalDate → 400 validation.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid exclusivity request.' } });
  }
});

// ── Marketing-application legal-basis / dossier-type classifier ────────────────

/** The modeled legal bases for a region (reference catalog). */
router.get('/dossier/legal-bases/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as DossierRegion;
  const legalBases = getLegalBases(region);
  if (!legalBases) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No legal bases modeled for region "${region}".` } });
  }
  res.json({ region, legalBases });
});

/**
 * Classify a product's marketing-application legal basis for a region.
 * Body: { region, isBiologic?, referencesApprovedProduct?, reliesOnOthersData?, differsFromReference?, ... }.
 */
router.post('/dossier/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region is required.' } });
  }
  try {
    res.json(classifyDossier(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

// ── Pediatric study-plan obligations (PREA iPSP / EMA PIP) ────────────────────

/** A market's pediatric study-plan obligation reference. */
router.get('/pediatric/obligation/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as PediatricMarket;
  if (!PEDIATRIC_MARKETS.includes(market)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No pediatric obligation modeled for "${market}".` } });
  }
  res.json({ market, obligation: getPediatricObligation(market) });
});

/**
 * Assess a product's pediatric study-plan status for a market.
 * Body: { market, triggersRequirement?, planSubmitted?, waiverRequested?, deferralRequested? }.
 */
router.post('/pediatric/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(assessPediatricPlan(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

// ── Nonclinical requirements (ICH M3(R2)) ─────────────────────────────────────

/** The nonclinical package generally expected to support a clinical phase. */
router.get('/nonclinical/requirements/:phase', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const phase = String(Array.isArray(req.params.phase) ? req.params.phase[0] : req.params.phase) as NonclinicalPhase;
  if (!NONCLINICAL_PHASES.includes(phase)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No nonclinical requirements modeled for phase "${phase}".` } });
  }
  res.json(getNonclinicalRequirements(phase));
});

/**
 * Recommend the minimum repeat-dose toxicity study duration for an intended
 * clinical-trial dosing duration (ICH M3(R2) Table 1). Body: { clinicalDurationDays }.
 */
router.post('/nonclinical/tox-duration', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.clinicalDurationDays !== 'number') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'clinicalDurationDays (number) is required.' } });
  }
  try {
    res.json(recommendToxDuration(b.clinicalDurationDays));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid clinicalDurationDays.' } });
  }
});

// ── Electronic submission format (eCTD / gateway / validation) ─────────────────

/** A market's electronic submission format + gateway + validation profile. */
router.get('/submission-format/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as SubmissionMarket;
  const format = getSubmissionFormat(market);
  if (!format) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No submission format modeled for "${market}".` } });
  }
  res.json({ market, format, markets: SUBMISSION_MARKETS });
});

/**
 * Assess electronic-submission readiness for a market.
 * Body: { market, format?, gatewayEnrolled?, validationPassed? }.
 */
router.post('/submission-format/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(assessSubmissionReadiness(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

// ── Inspection readiness (PAI / GMP / BIMO) ───────────────────────────────────

/** A market's inspection profile (inspection types + readiness domains). */
router.get('/inspection/profile/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as InspectionMarket;
  if (getReadinessDomains(market).length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No inspection profile modeled for "${market}".` } });
  }
  res.json({ market, markets: INSPECTION_MARKETS, profile: getInspectionProfile(market) });
});

/**
 * Assess inspection readiness against a market's required readiness domains.
 * Body: { market, providedDomains: string[] }.
 */
router.post('/inspection/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedDomains)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedDomains[] are required.' } });
  }
  try {
    res.json(assessInspectionReadiness({ market: b.market, providedDomains: b.providedDomains }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

// ── Regulatory guidance map (grounding) ───────────────────────────────────────

/** The list of modeled guidance topics. */
router.get('/guidance/topics', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ topics: listGuidanceTopics() });
});

/** Governing ICH guidelines + regulations for a topic. 404 when unmodeled. */
router.get('/guidance/:topic', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const topic = String(Array.isArray(req.params.topic) ? req.params.topic[0] : req.params.topic);
  const guidance = getGuidanceFor(topic);
  if (!guidance.found) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No guidance modeled for topic "${topic}".` } });
  }
  res.json(guidance);
});

export default router;
