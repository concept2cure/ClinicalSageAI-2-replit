/**
 * Types for the shared, path-keyed API fixtures.
 *
 * `bodyFor` THROWS on an unregistered path rather than returning a default.
 * That is the whole design: a blanket fallback body is what produced nine
 * phantom crashes and nine dead-end investigations.
 */

export const FIXTURES: Array<[test: RegExp, body: unknown]>;

/** The body this path's endpoint really returns. Throws if unregistered. */
export function bodyFor(url: string): unknown;
