/**
 * /api/biopharma/submissions — multi-region build+submit planning.
 *
 * Thin read layer over the submission resolver, which composes the existing
 * registry + regional packager + gateways into an explicit (filing × region)
 * plan and a coverage assertion across FDA (US), EMA (EU), and PMDA (Japan).
 *
 *   GET /api/biopharma/submissions/plan?filingType=BLA&productClass=biologic&regions=US,EU,JP
 *   GET /api/biopharma/submissions/coverage
 *
 * @module server/routes/biopharma/submissions
 */

import { Router, type Request, type Response } from 'express';
import {
  resolveSubmissionPlan,
  submissionCoverageMatrix,
  type ResolveInput,
} from '../../services/regulatory/submission-resolver.js';
import type { Region, ApplicationFamily, ProductClass } from '../../../shared/regulatory/document-taxonomy.js';

const router = Router();

// GET /plan — resolve the per-region build+submit plan for a filing.
router.get('/plan', (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const regions = q.regions
      ? (q.regions.split(',').map((r) => r.trim().toUpperCase()) as Region[])
      : undefined;
    const input: ResolveInput = {
      filingType: q.filingType,
      applicationFamily: q.applicationFamily as ApplicationFamily | undefined,
      productClass: q.productClass as ProductClass | undefined,
      regions,
    };
    return res.json(resolveSubmissionPlan(input));
  } catch (err) {
    console.error('[biopharma/submissions] GET /plan', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /coverage — the (filing × region) build+submit coverage matrix.
router.get('/coverage', (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const regions = q.regions
      ? (q.regions.split(',').map((r) => r.trim().toUpperCase()) as Region[])
      : undefined;
    return res.json(submissionCoverageMatrix(regions));
  } catch (err) {
    console.error('[biopharma/submissions] GET /coverage', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
