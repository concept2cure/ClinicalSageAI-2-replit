/**
 * MDX module health endpoint.
 *
 * Mounted at: /api/mdx
 *
 *   GET /health   probe table provisioning + shadow service config +
 *                  pathway coverage; returns the full readiness report.
 *
 * Used by ops to verify the module is paying-client-ready after
 * applying migrations + seeds. No tenant scoping — this reports the
 * deployment-wide state of the MDX backend, not per-org data.
 *
 * Response envelope: { data: MdxHealthReport } via the canonical
 * api-response helpers.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, serverError } from '../lib/api-response';
import { probeMdxHealth } from '../services/mdx-health.service';

const router = Router();
const log = createScopedLogger('mdx-health');

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const report = await probeMdxHealth();
    return ok(res, report);
  } catch (e) {
    return serverError(res, log, 'health', e);
  }
});

export default router;
