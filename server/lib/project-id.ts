/**
 * Canonical fail-closed parser for a request-supplied project identifier that
 * MUST address the integer `projects.id` space.
 *
 * The ADR-0011 hazard: the product runs two project-management stacks on
 * incompatible key types — the live v2 surfaces carry a `regulatory_programs`
 * UUID, the legacy stack is keyed on integer `projects.id`. Coercing a UUID with
 * `parseInt`/`Number` does NOT fail loudly:
 *
 *   parseInt('7abb1c22-…'.replace(/^proj_/, ''), 10)  ===  7   // valid, WRONG row
 *   Number('7abb1c22-…')                              ===  NaN // silent miss
 *
 * A `!Number.isFinite` guard does not catch the first case, so a program UUID
 * loads a different project in the same org. This parser accepts ONLY an optional
 * `proj_` prefix followed by a run of digits — a UUID (or any non-integer ident)
 * returns `null`, so callers can fail closed (400 / honest empty) instead of
 * reading or writing the wrong record.
 *
 * @param raw a request param / query / body value (string or number).
 * @returns a positive safe integer `projects.id`, or `null` when the input is not
 *          an integer project id (UUID, NaN, non-positive, malformed).
 */
export function parseIntegerProjectId(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const m = /^(?:proj_)?(\d+)$/.exec(raw.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** True when `raw` looks like a `regulatory_programs` UUID rather than an integer
 * project id — useful for choosing a 400 message that names the real cause. */
export function looksLikeProgramUuid(raw: unknown): boolean {
  return (
    typeof raw === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.trim())
  );
}
