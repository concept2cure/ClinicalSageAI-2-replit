/**
 * Global RI — Expedited/accelerated programs, regulatory pathway, HA meetings,
 * and special designations (orphan / pediatric).
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import { matchExpeditedPrograms, EXPEDITED_PROGRAMS } from '../../services/global-ri/expedited-programs';
import { recommendPathway } from '../../services/global-ri/regulatory-pathway-advisor';
import { recommendMeetings, meetingsForMarket, MEETING_CATALOG, type MeetingMarket } from '../../services/global-ri/ha-meetings';
import { assessDesignationEligibility, getDesignationCriteria } from '../../services/global-ri/special-designations';

const router = Router();

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

export default router;
