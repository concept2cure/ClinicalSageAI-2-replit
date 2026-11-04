/**
 * /api/biopharma/submissions — multi-region build+submit planning.
 *
 * Thin read layer over the submission resolver, which composes the existing
 * registry + regional packager + gateways into an explicit (filing × region)
 * plan. The existing resolver owns filing, product and regional support;
 * this boundary validates request shape without selecting another workflow.
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

/** An omitted selector uses the existing resolver default. A PRESENT but
 * blank, repeated or structured selector is not omission: silently treating
 * it as such could plan a different filing or region than the caller chose.
 * Keep semantic/catalog resolution in the shared resolver, not this route.
 */
class SubmissionQueryError extends Error {}

function readSelectionQuery(query: unknown, allowed: readonly string[]): Record<string, string> {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new SubmissionQueryError();
  const input = query as Record<string, unknown>;
  const output: Record<string, string> = Object.create(null);
  for (const key of Object.keys(input)) {
    // Do not silently ignore a misspelled selector or a filter /coverage
    // cannot apply and then advertise an unfiltered default as the answer.
    if (!allowed.includes(key)) throw new SubmissionQueryError();
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) throw new SubmissionQueryError();
    output[key] = value.trim();
  }
  return output;
}

function readRegions(value: string | undefined): Region[] | undefined {
  if (value === undefined) return undefined;
  const regions = value.split(',').map(region => region.trim().toUpperCase());
  if (regions.some(region => !region) || new Set(regions).size !== regions.length) {
    throw new SubmissionQueryError();
  }
  // Unknown nonempty codes remain the resolver's unsupported-region result;
  // there is no second regional catalog or gateway eligibility rule here.
  return regions as Region[];
}

function invalidSelection(res: Response) {
  return res.status(400).json({
    error: 'SUBMISSION_QUERY_INVALID',
    message: 'Use supported query fields with one nonempty value each. Regions must be a comma-separated list without empty or repeated entries.',
  });
}

// GET /plan — resolve the per-region build+submit plan for a filing.
router.get('/plan', (req: Request, res: Response) => {
  try {
    const q = readSelectionQuery(req.query, ['filingType', 'applicationFamily', 'productClass', 'regions']);
    const regions = readRegions(q.regions);
    const input: ResolveInput = {
      filingType: q.filingType,
      applicationFamily: q.applicationFamily as ApplicationFamily | undefined,
      productClass: q.productClass as ProductClass | undefined,
      regions,
    };
    return res.json(resolveSubmissionPlan(input));
  } catch (err) {
    if (err instanceof SubmissionQueryError) return invalidSelection(res);
    // Raw errors may include caller text or credentials from a collaborator.
    console.error('[biopharma/submissions] GET /plan: SUBMISSION_PLAN_FAILED');
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /coverage — the (filing × region) build+submit coverage matrix.
router.get('/coverage', (req: Request, res: Response) => {
  try {
    const q = readSelectionQuery(req.query, ['regions']);
    const regions = readRegions(q.regions);
    return res.json(submissionCoverageMatrix(regions));
  } catch (err) {
    if (err instanceof SubmissionQueryError) return invalidSelection(res);
    console.error('[biopharma/submissions] GET /coverage: SUBMISSION_COVERAGE_FAILED');
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
