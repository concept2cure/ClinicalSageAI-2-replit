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

export default router;
