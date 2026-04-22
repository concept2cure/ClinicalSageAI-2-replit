/**
 * AnA RI catalog / lookup endpoints — pure reads against static taxonomies.
 * No tenant scoping, no side effects; served from in-process data.
 *
 * Extracted from ana-ri.ts. Mounted via {@link mountLookupRoutes}.
 *
 * @module server/routes/ana-ri/lookups
 */

import type { Request, Response, Router } from 'express';

import {
  DEFICIENCY_TAXONOMY,
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  getDeficiencyCategories,
  type SubmissionType,
} from '../../services/ana-ri/deficiency-taxonomy.js';
import { getAllActions, getActionsForLens } from '../../services/ana-ri/document-actions.js';
import { getFullRubric } from '../../services/ana-ri/evaluation.js';
import type { IntentLens } from '../../services/ana-ri/index.js';
import { sendSuccess } from './shared.js';

/** Register catalog / lookup endpoints on the given router. */
export function mountLookupRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/deficiencies — Query Deficiency Taxonomy
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/deficiencies', (_req: Request, res: Response) => {
    const { submission_type, category, severity } = _req.query;

    let results = [...DEFICIENCY_TAXONOMY];

    if (submission_type) {
      results = getDeficienciesBySubmissionType(submission_type as SubmissionType);
    }

    if (category) {
      results = results.filter(
        d => d.category.toLowerCase() === (category as string).toLowerCase()
      );
    }

    if (severity) {
      results = results.filter(d => d.severity === severity);
    }

    return sendSuccess(res, {
      count: results.length,
      deficiencies: results,
      categories: getDeficiencyCategories(),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/deficiencies/critical — Critical deficiencies only
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/deficiencies/critical', (_req: Request, res: Response) => {
    const { submission_type } = _req.query;
    const type = (submission_type as SubmissionType) || 'general';
    const critical = getCriticalDeficiencies(type);

    return sendSuccess(res, {
      count: critical.length,
      submissionType: type,
      deficiencies: critical,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/actions — Available Document Actions
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/actions', (_req: Request, res: Response) => {
    const { lens } = _req.query;

    const actions = lens ? getActionsForLens(lens as IntentLens) : getAllActions();

    return sendSuccess(res, {
      count: actions.length,
      actions: actions.map(a => ({
        type: a.type,
        label: a.label,
        description: a.description,
        icon: a.icon,
        template: a.template,
      })),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/rubric — Evaluation Rubric
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/rubric', (_req: Request, res: Response) => {
    const rubric = getFullRubric();
    return sendSuccess(res, { dimensions: rubric });
  });
}
