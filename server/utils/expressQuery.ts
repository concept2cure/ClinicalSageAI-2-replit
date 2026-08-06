/**
 * Express 5 compatibility: replacing `req.query`.
 *
 * ── The failure ───────────────────────────────────────────────────────────────
 * In Express 4 `req.query` was an own data property and validation middleware
 * could simply reassign it. In Express 5 (this repo is on 5.2.1) it is exposed
 * through a prototype GETTER with no setter, so
 *
 *   req.query = schema.parse(req.query)
 *
 * throws `TypeError: Cannot set property query of #<IncomingMessage> which has
 * only a getter`. In strict-mode ESM that is a hard throw, not a silent no-op.
 *
 * Observed live: GET /api/evidence returned 500 with exactly that message. The
 * same assignment appears in five places, so every route behind
 * validateQuery — including the shared middleware in server/middleware/
 * validation.ts and server/middleware/apiValidation.ts — failed the moment it
 * was used.
 *
 * ── Why not scrub in place ────────────────────────────────────────────────────
 * server/middleware/enterprise-security.ts hit the same wall and solved it by
 * mutating the object in place, which is right for a sanitizer: it only needs to
 * delete dangerous keys. It is NOT sufficient here. Zod validation is also a
 * COERCION step — `z.coerce.number()` turns the string "10" into 10, defaults
 * materialize keys that were never sent, and `.strip()` drops unknown ones. The
 * validated result must genuinely replace the query object, or handlers keep
 * reading raw strings while believing they were given parsed values.
 *
 * ── The mechanism ─────────────────────────────────────────────────────────────
 * Define an own data property on the request. An own property shadows the
 * prototype getter, so this both succeeds and makes subsequent reads return the
 * validated object. `configurable: true` keeps it replaceable, so two validation
 * layers can run in sequence.
 */
import type { Request } from 'express';

/**
 * Replace `req.query` with `value`, working on Express 4 and 5 alike.
 *
 * Use this anywhere the parsed/coerced result must become what handlers read.
 * For sanitizing that only deletes keys, prefer mutating in place.
 */
export function setRequestQuery(req: Request, value: unknown): void {
  Object.defineProperty(req, 'query', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
