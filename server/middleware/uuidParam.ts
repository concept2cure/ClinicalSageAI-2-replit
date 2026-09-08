/**
 * Refuse a malformed uuid path parameter before it reaches SQL.
 *
 * ── The defect this closes ───────────────────────────────────────────────────
 * Found by calling every endpoint the v2 client uses against a real Postgres.
 * A path segment that is not uuid-shaped went straight into a query against a
 * uuid column, Postgres raised 22P02, and the route's catch reported it as a
 * 500 with the driver's text attached:
 *
 *   GET /api/governed-intelligence/contradictions/scan/
 *     → 500 {"error":"Failed to get contradiction",
 *            "details":"invalid input syntax for type uuid: \"scan\""}
 *
 * `scan` is not a bad id at all: it is the literal segment of a sibling route
 * (`POST /contradictions/scan/:projectId`) reached with the wrong method and a
 * trailing slash, so it falls through to `GET /contradictions/:id`. Nothing was
 * broken except the routing, and the product answered "internal server error".
 *
 * ── Where this is NOT registered, and why ────────────────────────────────────
 * It was briefly added to routes/authoring.router.ts too, and taken back out.
 * That router's ids are uuid, but no client sends a malformed one — the
 * non-uuid ids that appear against those routes (`D1`, `S1`) live only in test
 * fixtures, which drive mocked pools and so never reach Postgres or raise
 * 22P02. The guard fixed nothing reachable there and turned 21 passing tests
 * red by refusing their fixtures. Register this where a malformed id is
 * actually reachable, not everywhere a column happens to be uuid.
 *
 * Three things are wrong with that shape:
 *   • it reports a malformed REQUEST as a server fault, so a client bug pages
 *     whoever watches the 5xx rate;
 *   • it discloses the column type and the driver's phrasing to the caller,
 *     which the house rule forbids (no schema object in client-facing text);
 *   • it spends a database round trip to discover something the string itself
 *     already said.
 *
 * ── Why a `router.param` factory ─────────────────────────────────────────────
 * Express runs `router.param` handlers once per named parameter, before any
 * route handler, so one registration covers every current AND future route on
 * that router that names the parameter. The alternative — a check repeated in
 * each of forty handlers — is the shape that let this exist in the first place.
 *
 * Registering it is a claim about the schema: only attach a name here when the
 * columns it is matched against really are uuid. Both current call sites were
 * checked against the live catalog rather than assumed.
 */
import type { Request, Response } from 'express';

/** Canonical 8-4-4-4-12 hex form. Case-insensitive; braces/urn forms rejected. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** The minimal surface of `express.Router` this needs, so callers stay typed. */
interface ParamRegistrar {
  param(
    name: string,
    handler: (req: Request, res: Response, next: (err?: unknown) => void, value: string) => void,
  ): unknown;
}

/**
 * Register a uuid guard for each named path parameter on `router`.
 *
 * The refusal names the parameter and nothing else: a caller learns which part
 * of their URL was wrong without learning the column's type or the table it
 * belongs to.
 *
 * @param router  the Express router to register on
 * @param names   parameter names whose backing columns are uuid
 */
export function requireUuidParams(router: ParamRegistrar, names: readonly string[]): void {
  for (const name of names) {
    router.param(name, (_req, res, next, value) => {
      if (isUuid(value)) return next();
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: `The ${name} in this request is not a valid identifier.`,
      });
    });
  }
}

export default requireUuidParams;
