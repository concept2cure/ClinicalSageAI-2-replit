/**
 * Standard HTTP response helpers for MDX-owned API endpoints.
 *
 * Every endpoint should send through these helpers — they enforce the
 * canonical envelope shapes:
 *
 *   Success: { data: T | T[], meta?: { ... } }
 *   Error:   { error: string, details?: object }
 *
 * Defined in shared/constants/mdx.ts as ApiEnvelope<T> / ApiErrorEnvelope.
 *
 * Routes that go through these helpers benefit from:
 *   - One place to change the response shape if the contract evolves
 *   - Consistent HTTP status codes (200 list, 201 create, 204 delete,
 *     403 unauthenticated/un-tenanted, 404 missing, 422 validation,
 *     500 server-error)
 *   - Automatic logging on 5xx via createScopedLogger (caller passes
 *     the logger so the error appears under the right scope)
 *
 * This module has zero runtime side effects — pure functions over the
 * Express Response. Safe to import from any route handler.
 */

import type { Response } from 'express';
import type { ApiEnvelope, ApiErrorEnvelope } from '../../shared/constants/mdx';

interface ScopedLogger {
  error: (message: string, context?: unknown) => void;
}

/**
 * 200 OK with the canonical success envelope.
 *
 * @example
 *   return ok(res, programs);                       // { data: programs }
 *   return ok(res, programs, { total: 42 });        // { data: programs, meta: { total: 42 } }
 */
export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  const envelope: ApiEnvelope<T> = meta ? { data, meta } : { data };
  return res.status(200).json(envelope);
}

/**
 * 201 Created with the canonical success envelope. Use after a
 * successful POST that mints a new resource.
 */
export function created<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  const envelope: ApiEnvelope<T> = meta ? { data, meta } : { data };
  return res.status(201).json(envelope);
}

/**
 * 204 No Content — for idempotent DELETE / PUT operations that don't
 * carry a response body.
 */
export function noContent(res: Response): Response {
  return res.status(204).end();
}

/**
 * 4xx Client Error with the canonical error envelope. Use for the full
 * range of expected client-input failures.
 *
 *   - 400 Bad Request           — malformed body / params
 *   - 403 Forbidden             — auth/tenant context missing
 *   - 404 Not Found             — resource id doesn't resolve in tenant
 *   - 409 Conflict              — uniqueness violation
 *   - 422 Unprocessable Entity  — validation failure (Zod, etc.)
 *
 * `details` may carry structured field errors (e.g. Zod's
 * flatten().fieldErrors output) when the status is 422.
 *
 * @example
 *   return clientError(res, 403, 'Organization context required');
 *   return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
 */
export function clientError(
  res: Response,
  status: 400 | 401 | 403 | 404 | 409 | 422,
  error: string,
  details?: Record<string, unknown>,
): Response {
  const envelope: ApiErrorEnvelope = details ? { error, details } : { error };
  return res.status(status).json(envelope);
}

/**
 * 500 Internal Server Error. Logs the underlying error via the caller's
 * scoped logger (preserves the route's `where` label) before responding
 * with a sanitized envelope. The `where` parameter shows up in the log
 * line so ops can grep failures by endpoint.
 *
 * @example
 *   } catch (err) {
 *     return serverError(res, log, 'list', err);
 *   }
 */
export function serverError(
  res: Response,
  log: ScopedLogger,
  where: string,
  err: unknown,
): Response {
  const message = err instanceof Error ? err.message : 'Operation failed';
  log.error(`${where} failed`, { err: message });
  const envelope: ApiErrorEnvelope = { error: message };
  return res.status(500).json(envelope);
}

/* ─── Convenience guards ───────────────────────────────────────────── */

/**
 * Common 403 used by every endpoint when org context isn't attached
 * (auth middleware didn't run, or the JWT lacks an organizationId).
 */
export function orgRequired(res: Response): Response {
  return clientError(res, 403, 'Organization context required');
}

/**
 * Common 404 used by per-id endpoints when the resource isn't visible
 * in the caller's tenant. Avoids leaking whether the resource exists
 * in another tenant.
 */
export function notFoundInTenant(res: Response, label = 'Resource'): Response {
  return clientError(res, 404, `${label} not found`);
}
