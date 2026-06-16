/**
 * Shared primitives for the Global RI sub-routers.
 *
 * A single rate-limiter instance, the AUTHOR role constant, and the fail()
 * helper are shared across every sub-router so behavior is identical to the
 * original monolithic router.
 */

import type { Response } from 'express';
import { createRateLimiter } from '../../middleware/rateLimiter';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('global-ri-routes');

/** Single shared rate limiter used across all Global RI sub-routers. */
export const limiter = createRateLimiter();

/** Role required to access Global RI endpoints. */
export const AUTHOR = 'regulatory-author';

export function fail(res: Response, err: unknown): void {
  logger.error('global-ri route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Global RI request failed.' } });
}
