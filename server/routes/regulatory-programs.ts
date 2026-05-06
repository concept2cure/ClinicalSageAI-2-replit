/**
 * Regulatory Programs API — HTTP routing only.
 *
 * Mounted at:  /api/regulatory-programs
 *
 * This file is the HTTP boundary: it resolves auth/tenant context,
 * validates query params via Zod, calls the typed service functions in
 * server/services/regulatory-programs.service.ts, and wraps the result
 * with the canonical envelope helpers (server/lib/api-response.ts).
 *
 * Business logic — the SQL queries, derivations, adapter mappings —
 * lives in the service module. Each endpoint here is at most a dozen
 * lines: parse query → call service → respond.
 *
 * Endpoints:
 *   GET /                          list programs (filter by ?programType)
 *   GET /:id                       single program
 *   GET /:id/activity              audit-log feed for a program
 *   GET /:id/milestones            derived 8-step timeline
 *   GET /:id/rim-recommendations   structural recs derived from dossier
 *   GET /:id/change-impact         recent edits + cross-section refs
 *   GET /:id/safety-signals        CER signals from safety_signals
 *   GET /:id/literature            year-bucketed literature corpus
 *   GET /:id/pma-modules           cerv2_510k_sections grouped by PMA module
 *   GET /:id/pma-trial-metrics     clinical_ops.studies-derived KPIs
 *   GET /portfolio-insights        cross-portfolio insights
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { resolveOrgId } from '../types/auth-request';
import {
  ok,
  clientError,
  serverError,
  orgRequired,
  notFoundInTenant,
} from '../lib/api-response';
import * as svc from '../services/regulatory-programs.service';

const router = Router();
const log = createScopedLogger('regulatory-programs');

const fail = (res: Response, where: string, err: unknown) =>
  serverError(res, log, where, err);

/* ─── Query-param validators ──────────────────────────────────────────
   GET endpoints pass through Zod schemas to catch typos / invalid
   enums / oversized limits before they hit SQL. */

const listQuerySchema = z.object({
  programType: z.enum(['510K', '510(K)', '510k', 'DE_NOVO', 'PMA', 'CER', 'IND', 'NDA', 'BLA']).optional(),
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ─── Routes ──────────────────────────────────────────────────────── */

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);

    const queryParsed = listQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return clientError(res, 422, 'Invalid query parameters', queryParsed.error.flatten().fieldErrors);
    }

    const data = await svc.listPrograms(orgId, queryParsed.data);
    return ok(res, data);
  } catch (e) {
    return fail(res, 'list', e);
  }
});

/* /portfolio-insights must register BEFORE /:id so the literal path
   wins the route match (Express matches in declaration order). */
router.get('/portfolio-insights', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const insights = await svc.getPortfolioInsights(orgId);
    return ok(res, insights);
  } catch (e) {
    return fail(res, 'portfolio-insights', e);
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const data = await svc.getProgramById(orgId, String(req.params.id));
    if (!data) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'get-one', e);
  }
});

router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);

    const queryParsed = activityQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return clientError(res, 422, 'Invalid query parameters', queryParsed.error.flatten().fieldErrors);
    }

    const data = await svc.getActivity(orgId, String(req.params.id), queryParsed.data.limit);
    if (data === null) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'activity', e);
  }
});

router.get('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const data = await svc.getMilestones(orgId, String(req.params.id));
    if (data === null) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'milestones', e);
  }
});

router.get('/:id/rim-recommendations', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const data = await svc.getRimRecommendations(orgId, String(req.params.id));
    if (data === null) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'rim-recommendations', e);
  }
});

router.get('/:id/change-impact', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const data = await svc.getChangeImpact(orgId, String(req.params.id));
    if (data === null) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'change-impact', e);
  }
});

router.get('/:id/safety-signals', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const data = await svc.getSafetySignals(orgId, String(req.params.id));
    if (data === null) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'safety-signals', e);
  }
});

router.get('/:id/literature', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const result = await svc.getLiterature(orgId, String(req.params.id));
    if (result === null) return notFoundInTenant(res, 'Program');
    return ok(res, result.buckets, { total: result.total, productName: result.productName });
  } catch (e) {
    return fail(res, 'literature', e);
  }
});

router.get('/:id/pma-modules', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const data = await svc.getPmaModules(orgId, String(req.params.id));
    if (data === null) return notFoundInTenant(res, 'Program');
    return ok(res, data);
  } catch (e) {
    return fail(res, 'pma-modules', e);
  }
});

router.get('/:id/pma-trial-metrics', async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrgId(req);
    if (orgId === null) return orgRequired(res);
    const result = await svc.getPmaTrialMetrics(orgId, String(req.params.id));
    if (result === null) return notFoundInTenant(res, 'Program');
    return ok(res, result.metrics, { study: result.study });
  } catch (e) {
    return fail(res, 'pma-trial-metrics', e);
  }
});

export default router;
