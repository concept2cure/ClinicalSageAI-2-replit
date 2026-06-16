/**
 * Global RI — ICH guideline catalog, regulatory guidance map, and combined
 * submission economics (fees + review timeline).
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { ICH_GUIDELINES, getGuideline, guidelinesByCategory, searchGuidelines, listCategories } from '../../services/global-ri/ich-guideline-catalog';
import { getGuidanceFor, listGuidanceTopics } from '../../services/global-ri/regulatory-guidance-map';
import { projectSubmissionEconomics } from '../../services/global-ri/submission-economics';

const router = Router();

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

// ── Submission economics (fees + review timeline) ─────────────────────────────

/**
 * Project the combined fee + review-timeline economics for a submission.
 * Body: { market, procedure, startDate, requiresClinicalData?, orphan?, smallBusiness?, programYears? }.
 */
router.post('/submission-economics', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.procedure || !b.startDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market, procedure and startDate are required.' } });
  }
  try {
    res.json(projectSubmissionEconomics(b));
  } catch (err) {
    // Unknown market/procedure → 400 validation (propagated from the timeline projector).
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid submission-economics request.' } });
  }
});

export default router;
