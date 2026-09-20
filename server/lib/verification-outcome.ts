/**
 * The third state of a verification: it could not be run.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * WO-16B (2026-09-10) found ten Part 11 surfaces that collapse three outcomes
 * into two. A chain verifier whose store failed to initialise reported
 * `INTEGRITY_FAILURE` / `NON_COMPLIANT` against four named regulations. A
 * signature verifier that never compared anything reported `valid: true`. A
 * release-signature lookup that threw was reported to the operator as "the
 * signature was superseded or rolled back". An exported ledger whose audit
 * query failed said `<AuditLog count="0">`. Each is the same defect:
 *
 *     a verdict was reported for a check that did not run.
 *
 * "Could not verify" is not "failed" and it is not "passed". A regulated user
 * acts on a verdict, so both collapses are worse than an error.
 *
 * ── The shape, and where it comes from ───────────────────────────────────────
 * `server/routes/innovation-routes.ts` shipped this vocabulary first, for the
 * tenant-ownership guards:
 *
 *     type GuardOutcome = { ran: true; rows } | { ran: false; reason: string }
 *     class GuardUnavailableError   -> guarded(res, fn) answers 503, never a deny
 *     AnaToolExecutor               -> status: 'ownership_unverifiable'
 *
 * This module is that shape generalised so the Part 11 surfaces do not grow a
 * second vocabulary for the same idea. `ran: false` always carries a `reason`
 * an operator can act on; it is never a silent empty result.
 *
 * ── How a caller uses it ─────────────────────────────────────────────────────
 *   - A service returns `VerificationOutcome<T>` and never throws for "could
 *     not run"; the `ran` discriminant forces every caller to decide.
 *   - A boundary that must stop (an export that cannot record itself, a lookup
 *     whose absence would be read as a verdict) throws
 *     `VerificationUnavailableError`; the route maps it to **503**, distinct
 *     from a 4xx precondition and from a 5xx crash.
 *   - Where the output is a DOCUMENT rather than a response, the state must
 *     reach the document: `<AuditLog unavailable="true" reason="…"/>` is a
 *     different artefact from `<AuditLog count="0">`, and only one is honest.
 */

/** A verification either ran — and carries its result — or did not run. */
export type VerificationOutcome<T extends object> =
  | ({ ran: true } & T)
  | { ran: false; reason: string };

/**
 * Thrown by a boundary that cannot proceed without a verification it could
 * not run. Same role as `GuardUnavailableError` in innovation-routes; a route
 * that catches it answers 503 and says the check did not run.
 */
export class VerificationUnavailableError extends Error {
  constructor(
    /** What could not be verified, in operator words: "release-signature lookup". */
    readonly what: string,
    /** Why, in operator words: the Postgres code and message, or "no database pool". */
    readonly detail: string,
  ) {
    super(`${what} could not be run: ${detail}`);
    this.name = 'VerificationUnavailableError';
  }
}

/** Structural check — survives module duplication and mocked import graphs. */
export function isVerificationUnavailable(err: unknown): err is VerificationUnavailableError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'VerificationUnavailableError'
  );
}

/** A one-line, operator-facing reason from a thrown value: `42P01: relation … does not exist`. */
export function describeFailure(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' && code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

/** The `ran: false` arm, built from a thrown value. */
export function didNotRun(err: unknown): { ran: false; reason: string } {
  return { ran: false, reason: describeFailure(err) };
}

/** The subset of a scoped logger this module needs. `console` satisfies it too. */
export interface UnavailableLog {
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Answer 503 for a verification that did not run — the sibling of
 * `serverError` in server/lib/api-response for this one outcome.
 *
 * Same containment rule as that helper (and the `ci:server-error-leaks`
 * gate): the underlying failure text goes to the LOG, keyed by the request id
 * the requestId middleware set and echoed as `X-Request-Id`. The client gets a
 * stable code, one sentence that says nothing was verified and nothing failed,
 * and that id — so an operator can find the real reason with one log lookup,
 * and a regulatory reader never receives the internal shape of a store.
 */
export function respondVerificationUnavailable(
  res: {
    status: (code: number) => { json: (body: unknown) => unknown };
    getHeader?: (name: string) => unknown;
  },
  log: UnavailableLog,
  what: string,
  err: unknown,
  opts: { code?: string; message?: string; extra?: Record<string, unknown> } = {},
): unknown {
  const header = typeof res.getHeader === 'function' ? res.getHeader('X-Request-Id') : undefined;
  const correlationId = typeof header === 'string' && header ? header : null;
  log.error(`${what} could not be run`, {
    ...opts.extra,
    reason: describeFailure(err),
    correlationId,
  });
  return res.status(503).json({
    success: false,
    error: opts.code ?? 'VERIFICATION_UNAVAILABLE',
    message:
      opts.message ??
      `${what} could not be run. This is not a verdict: nothing was verified and nothing failed verification.` +
        (correlationId ? ' Quote the reference below if you contact support.' : ''),
    ...(correlationId ? { correlationId } : {}),
  });
}
