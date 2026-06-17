/**
 * Platform capabilities — one cross-surface discovery call for the UI shell.
 *
 * GET /api/platform/capabilities returns the unified, normalized catalog across
 * every deterministic platform surface (global-RI, Submission Center, …). Mounted
 * with authenticateToken at mount time.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { getPlatformCatalog } from '../services/platform/platform-capabilities';

const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

/** The unified platform capability catalog (cross-surface). */
router.get('/capabilities', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getPlatformCatalog());
});

export default router;
