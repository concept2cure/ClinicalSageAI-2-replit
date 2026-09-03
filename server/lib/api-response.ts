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
  status: 400 | 401 | 403 | 404 | 409 | 412 | 422 | 502,
  error: string,
  details?: Record<string, unknown>,
): Response {
  const envelope: ApiErrorEnvelope = details ? { error, details } : { error };
  return res.status(status).json(envelope);
}

/**
 * 500 Internal Server Error.
 *
 * ── What this used to do, and why it was a finding ───────────────────────────
 * It put `err.message` straight into the response body while its own docstring
 * claimed the envelope was "sanitized". It was not. A driver error reaches this
 * helper verbatim, so a route whose table was missing answered the browser with
 *
 *     500 {"error":"relation \"software_lifecycle_items\" does not exist"}
 *
 * — the exact string the MDX work order's verification step says must never
 * appear, arriving at whoever holds the session. 272 call sites across 40 route
 * files send through here, so the leak was not one endpoint's mistake; it was
 * the default for every MDX-owned endpoint that fails.
 *
 * The client-side redaction added later (ErrorState + extractApiError) hid the
 * symptom on screen and left the API shipping Postgres text to anything that
 * reads the response — a proxy log, a browser devtools panel, a saved HAR.
 * Redaction at the render layer is not containment at the boundary.
 *
 * ── What it does now ─────────────────────────────────────────────────────────
 * The real message goes to the LOG, keyed by the request id the `requestId`
 * middleware already set and echoed as `X-Request-Id`. The client gets a stable
 * code, a sentence, and that same id. The operator question — "what actually
 * broke?" — is answered by one log lookup on an id the user can read off the
 * screen and quote. Nothing is lost except the disclosure.
 *
 * This is the same shape `pendingStore()` in server/routes/c2c/projects.ts
 * already uses for its 503; one way of doing this, not two.
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
  /* Route-scoped facts to log alongside the failure — the ids that make one
     log line answer "which record?" without a second lookup (e.g.
     `{ programId }`). Log-only: nothing here reaches the response, so it is
     safe to put internal identifiers in it. Optional so the 272 existing call
     sites are unchanged. */
  extra?: Record<string, unknown>,
): Response {
  const detail = err instanceof Error ? err.message : 'Operation failed';
  /* Set by the requestId middleware (server/middleware/enterprise-security.ts)
     before any route runs, so reading it back off the response needs no change
     at the call sites. Absent only in a unit test that never mounted the
     middleware, where a null id is honest rather than a fabricated one.

     `getHeader` itself is probed rather than called outright: this already
     intended to tolerate a response with no request id, but it assumed the
     METHOD was there, so a route test with a minimal `res` double threw
     "res.getHeader is not a function" from inside the error path — the one
     path a fail-closed test is usually driving. Absent method and absent
     header mean the same thing here, and neither is worth a crash. */
  const header =
    typeof (res as { getHeader?: unknown }).getHeader === 'function'
      ? res.getHeader('X-Request-Id')
      : undefined;
  const correlationId = typeof header === 'string' && header ? header : null;

  log.error(`${where} failed`, {
    ...extra,
    err: detail,
    correlationId,
    code: (err as { code?: string })?.code ?? null,
  });

  const envelope: ApiErrorEnvelope = {
    error: 'INTERNAL_ERROR',
    message:
      `Something went wrong while ${where}. The problem has been logged.` +
      (correlationId ? ' Quote the reference below if you contact support.' : ''),
    ...(correlationId ? { correlationId } : {}),
  };
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
