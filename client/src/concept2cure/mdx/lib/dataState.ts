/**
 * dataState — the single truth primitive for every MDX surface.
 *
 * ## Why this exists
 *
 * Every MDX surface used to resolve its live source with a fixture:
 *
 *     const devices = live.devices ?? UDI_DEVICES;   // ← hazard
 *
 * That one line collapses five genuinely different situations into a
 * single indistinguishable render:
 *
 *   1. the fetch has not started (no program selected)
 *   2. the fetch is in flight
 *   3. the fetch failed (401, 500, network, parse)
 *   4. the fetch succeeded and the tenant legitimately has no rows
 *   5. the fetch succeeded and returned the tenant's real regulated data
 *
 * Cases 1–4 all rendered canonical example content that looks exactly
 * like case 5. In a regulated device/IVD product that is not a cosmetic
 * problem: a user can read example predicate devices, an example risk
 * file, or an example UDI record and believe it is their own submission
 * evidence. Filing decisions get made off that screen.
 *
 * `DataState<T>` makes the five cases irreducible — you cannot render
 * without saying which one you are in. Fixtures are no longer reachable
 * by accident; they are reachable only in an explicitly enabled sample
 * mode (see ./sampleMode), and only with a standing banner.
 *
 * ## Usage
 *
 *     const live = useUdi(programId);
 *     const devices = toDataState(live.devices, live.loading, live.error);
 *
 *     <DataGate state={devices} label="UDI records">
 *       {(rows) => <DeviceTable rows={rows} />}
 *     </DataGate>
 *
 * The children render function only ever receives non-empty real data,
 * so surface code loses all its `?.length ? … : …` defensive branching.
 */

/** What a surface is allowed to be showing at any moment. */
export type DataState<T> =
  /** No request has been issued — usually a required input is unresolved. */
  | { status: 'idle'; reason?: string }
  /** Request in flight. */
  | { status: 'loading' }
  /** Request failed. `message` is the operator-facing detail. */
  | { status: 'error'; message: string }
  /** Request succeeded; the tenant genuinely has no records. */
  | { status: 'empty' }
  /** Request succeeded with real tenant data. */
  | { status: 'ready'; data: T };

/**
 * Collapse a hook's `(data, loading, error)` triple into a DataState.
 *
 * Precedence is deliberate and must not be reordered:
 *   error  → an error is never masked by a stale success
 *   loading → in-flight beats a previous result
 *   idle    → `null` data with no error and not loading means "never asked"
 *             (useFetchJson returns exactly this when url === null)
 *   empty   → a resolved array/collection with zero entries
 *   ready   → everything else
 *
 * @param data     The resolved payload, or null when unresolved.
 * @param loading  True while the fetch is in flight.
 * @param error    Error message, or null.
 * @param opts.idleReason Human-readable reason shown in the idle state,
 *                        e.g. "Select a program to see its risk file".
 */
export function toDataState<T>(
  data: T | null | undefined,
  loading: boolean,
  error: string | null | undefined,
  opts: { idleReason?: string } = {},
): DataState<T> {
  if (error) return { status: 'error', message: error };
  if (loading) return { status: 'loading' };
  if (data === null || data === undefined) {
    return { status: 'idle', reason: opts.idleReason };
  }
  if (isEmptyCollection(data)) return { status: 'empty' };
  return { status: 'ready', data };
}

/**
 * True when `value` is a collection with nothing in it. Scalars and
 * objects are never "empty" — a summary object of all-zero counters is
 * a real, meaningful result and must render as `ready`.
 */
function isEmptyCollection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  return false;
}

/**
 * Combine several DataStates into one, for panels fed by more than one
 * source. Worst-status-wins using the same precedence as toDataState,
 * so a panel with one failed source reports `error` rather than
 * rendering three-quarters of itself as though it were complete.
 *
 * `empty` only wins when *every* input is empty — a panel where one of
 * four tables has rows is still meaningfully populated.
 */
export function combineDataStates(
  ...states: DataState<unknown>[]
): Exclude<DataState<void>, { status: 'ready' }> | { status: 'ready' } {
  const firstError = states.find((s) => s.status === 'error');
  if (firstError && firstError.status === 'error') {
    return { status: 'error', message: firstError.message };
  }
  if (states.some((s) => s.status === 'loading')) return { status: 'loading' };
  const firstIdle = states.find((s) => s.status === 'idle');
  if (firstIdle && firstIdle.status === 'idle') {
    return { status: 'idle', reason: firstIdle.reason };
  }
  if (states.length > 0 && states.every((s) => s.status === 'empty')) {
    return { status: 'empty' };
  }
  return { status: 'ready' };
}

/**
 * Narrow helper for call sites that need the rows but are not rendering
 * through DataGate (chart inputs, CSV export builders, aggregate counts).
 * Returns `null` for every non-ready state so the caller cannot mistake
 * an error for an empty result.
 */
export function readyData<T>(state: DataState<T>): T | null {
  return state.status === 'ready' ? state.data : null;
}

/**
 * Rows for a surface that must always render a container (a table with
 * a persistent header, a chart axis). Returns `[]` for every non-ready
 * state. Use only where the surrounding DataGate has already declared
 * the state to the user — otherwise this reintroduces the exact
 * ambiguity this module exists to remove.
 */
export function readyRows<T>(state: DataState<T[]>): T[] {
  return state.status === 'ready' ? state.data : [];
}
