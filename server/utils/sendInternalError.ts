/**
 * Helper for route handlers that catch their own errors and call
 * `res.status(5xx).json(...)` directly instead of delegating to the
 * central errorHandler middleware via `next(err)`.
 *
 * Background: the central errorHandler in server/middleware/errorHandler.ts
 * scrubs raw error.message from 5xx responses in production (internal
 * SQL fragments, env names, stack data). But many route handlers in
 * server/routes/* short-circuit that by responding directly out of a
 * try/catch — bypassing the scrub. Those handlers should either:
 *
 *   1. Call `next(err)` to delegate to the central handler (cleanest), or
 *   2. Use this helper, which mirrors the central handler's scrubbing
 *      behavior but lets the route own the response shape.
 *
 * Behavior:
 *   - Always logs the raw error server-side through the supplied scoped
 *     logger (which redacts known sensitive keys).
 *   - Production: response body uses the supplied `userMessage` only;
 *     `detail` / `cause` / `stack` are never echoed.
 *   - Non-production: response body includes `detail` for the dev
 *     feedback loop.
 *
 * Usage:
 *   } catch (err) {
 *     return sendInternalError(res, logger, 'Failed to fetch program', err);
 *   }
 */

import type { Response } from 'express';
import { config } from '../config/environment';

interface ScopedLoggerLike {
  error(message: string, context?: Record<string, unknown>): void;
}

export function sendInternalError(
  res: Response,
  logger: ScopedLoggerLike,
  userMessage: string,
  err: unknown,
  statusCode = 500,
): Response {
  const rawMessage = err instanceof Error ? err.message : String(err);

  logger.error(userMessage, { err: rawMessage });

  const body: Record<string, unknown> = { error: userMessage };
  if (!config.isProduction) {
    body.detail = rawMessage;
  }

  return res.status(statusCode).json(body);
}
