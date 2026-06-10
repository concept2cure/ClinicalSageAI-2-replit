/**
 * Small, shared formatting helpers for the IND services (forms + lifecycle).
 * Pure and deterministic.
 */

/** Join non-empty address parts into a single one-line address string. */
export function composeAddress(parts: Array<string | null | undefined>): string | undefined {
  const joined = parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0).join(', ');
  return joined.length > 0 ? joined : undefined;
}

/** Build a full name, appending credentials when present (e.g. "Pat Smith, MD"). */
export function fullName(first: string, last: string, credentials?: string | null): string {
  const base = `${first} ${last}`.trim();
  return credentials ? `${base}, ${credentials}` : base;
}
