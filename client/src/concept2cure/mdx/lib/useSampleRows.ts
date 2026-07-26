/**
 * useSampleRows / useSampleValue — the guard that stops a fixture from
 * standing in for a tenant's regulated data.
 *
 * ## The pattern this replaces
 *
 * Every MDX surface resolved its live source like this:
 *
 *     const kpis = live.kpis ?? ADM_KPIS;
 *
 * The fallback fires on exactly the occasions the user cannot detect it:
 * an empty tenant, an expired token, a 500, a panel whose fetch has not
 * started. Canonical example content then renders as though it were the
 * user's own — example predicate devices, an example risk file, example
 * GUDID states.
 *
 * ## What these do instead
 *
 *     const kpis = useSampleRows(live.kpis, ADM_KPIS);
 *
 * Live data wins when present. Otherwise the fixture appears only if the
 * user has explicitly switched on sample mode (see ./sampleMode) — which
 * is never possible in a production build. In every other case the
 * surface receives an empty collection and renders its empty state.
 *
 * ## Relationship to DataGate
 *
 * `DataGate` is the fuller treatment: it distinguishes loading from
 * error from empty and offers a retry, and surfaces that have been
 * converted to it (engineering, UDI, postmarket) should keep using it.
 * These hooks are the narrower guarantee — no silent fixture — applied
 * uniformly wherever a surface has not yet been converted. They exist so
 * that "not yet converted" never means "still showing fiction".
 */

import { useSampleMode } from '../components/DataGate';

/** Stable identity so an empty result does not retrigger memo/effect deps. */
const EMPTY: readonly never[] = Object.freeze([]);

/**
 * Resolve a list panel.
 *
 * @param live   Rows from the backend, or null when unresolved.
 * @param sample Canonical example rows for this panel.
 * @returns `live` when present; `sample` only in explicit sample mode;
 *          otherwise an empty array.
 */
export function useSampleRows<T>(live: T[] | null | undefined, sample: readonly T[]): T[] {
  const sampleOn = useSampleMode();
  if (live) return live;
  return sampleOn ? (sample as T[]) : (EMPTY as unknown as T[]);
}

/**
 * Resolve a single-object panel (a settings blob, an SSO config).
 *
 * Returns `null` rather than an empty object when there is nothing to
 * show, so the call site is forced to handle absence explicitly instead
 * of rendering a shell of blank fields that looks like real, empty
 * configuration.
 */
export function useSampleValue<T>(live: T | null | undefined, sample: T): T | null {
  const sampleOn = useSampleMode();
  if (live !== null && live !== undefined) return live;
  return sampleOn ? sample : null;
}
