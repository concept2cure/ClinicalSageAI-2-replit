/**
 * Authoring → PDF rendering REST surface.
 *
 * Renders built authoring artifacts to submission-ready, navigable PDF leaves.
 * Mounted at /api/authoring-pdf with authenticateToken applied at mount time
 * (see server/bootstrap/register-ind-lifecycle-routes.ts).
 *
 *  - POST /m2-summary/pdf   render an M2 CTD summary (2.3/2.4/2.5/2.7) to PDF.
 *
 * The renderers are pure/deterministic over the supplied built summary, so a
 * re-render does not perturb a sequence's index-md5.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { renderM2SummaryPdf } from '../services/authoring/m2-summary-renderer';
import { runM2SummaryQc } from '../services/authoring/m2-summary-qc';
import type { M2Summary } from '../services/m2-summary-builders';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('authoring-pdf-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function fail(res: Response, err: unknown): void {
  logger.error('authoring-pdf route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Render failed.' } });
}

/** Render a built M2 CTD summary to a navigable PDF leaf. Body: an M2Summary. */
router.post('/m2-summary/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Partial<M2Summary>;
  if (!b.sectionKey || !b.title) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'sectionKey and title are required (supply a built M2Summary).' } });
  }
  try {
    const summary: M2Summary = {
      sectionKey: b.sectionKey,
      title: b.title,
      narrative: b.narrative ?? '',
      tables: b.tables ?? [],
      inputSectionKeys: b.inputSectionKeys ?? [],
      completeness: b.completeness ?? 0,
      gaps: b.gaps ?? [],
      generatedAt: b.generatedAt ?? new Date(0).toISOString(),
    };
    const pdf = await renderM2SummaryPdf(summary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="m2-${summary.sectionKey}.pdf"`);
    res.status(200).send(pdf);
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Cross-summary Module 2 QC over a set of built M2 summaries (ICH M4).
 * Body: { summaries: M2Summary[], expectedSummaries?, minCompleteness?,
 * availableUpstreamKeys? }. Returns the verdict + findings.
 */
router.post('/m2-summary/qc', limiter, requireRole(AUTHOR), (req, res) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.summaries)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'summaries[] (built M2Summary objects) is required.' } });
  }
  try {
    res.json(
      runM2SummaryQc({
        summaries: b.summaries,
        expectedSummaries: b.expectedSummaries,
        minCompleteness: b.minCompleteness,
        availableUpstreamKeys: b.availableUpstreamKeys,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

export default router;
