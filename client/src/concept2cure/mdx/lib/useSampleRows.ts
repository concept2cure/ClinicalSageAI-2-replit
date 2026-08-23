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
 * Sample content substitutes for an unresolved source *and* for a
 * resolved-but-empty one, matching `DataGate` — which renders its
 * `sample` for every non-ready state, `empty` included. Without that
 * alignment the same tenant would see example rows through one helper
 * and a blank panel through the other, purely because `[]` is truthy.
 * A demo on a fresh workspace needs the empty case to populate.
 *
 * Real rows always win, so sample mode can never mask live data.
 *
 * @param live   Rows from the backend, or null when unresolved.
 * @param sample Canonical example rows for this panel.
 */
export function useSampleRows<T>(live: T[] | null | undefined, sample: readonly T[]): T[] {
  const sampleOn = useSampleMode();
  if (live && live.length > 0) return live;
  if (sampleOn) return sample as T[];
  return live ?? (EMPTY as unknown as T[]);
}

/**
 * True exactly when `useSampleRows(live, …)` would substitute the fixture.
 *
 * A surface has to know this to render `<SampleDataBanner>`, and before this
 * existed each one re-derived it — which is how two governed registers came to
 * be gated correctly and marked not at all. `PostmarketSurface`'s vigilance
 * document register and `Workbench`'s submission pipeline both resolved through
 * `useSampleRows`, so neither could leak a fixture outside sample mode, and
 * neither told the user when it was inside it. The rows carried
 * `esigState: 'signed'` with a named signer and a date.
 *
 * Deriving it here means the banner cannot drift from the gate: one predicate,
 * one place, changed together or not at all.
 *
 * @param live The same value passed to `useSampleRows`.
 */
export function useShowingSample(live: unknown[] | null | undefined): boolean {
  const sampleOn = useSampleMode();
  return sampleOn && !(live && live.length > 0);
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
