/**
 * payloadShape — what the body actually is, as opposed to what the payload
 * interface claimed it would be.
 *
 * ## The failure this exists for
 *
 * Every MDX hook fetches through `useFetchJson<Payload>(url)` and then reads
 * the payload as though the declared interface were enforced:
 *
 *     const rows = data.data.map(adapt);          // ← the cast is not a contract
 *     devices: state(data?.data.devices);         // ← `?.` covers the envelope,
 *                                                 //   not what's inside it
 *
 * `useFetchJson` returns whatever `res.json()` produced, cast to `Payload`. A
 * 200 is evidence that *something* came back, nothing more. One envelope
 * change, one proxy answering with a login page, one route switched from
 * `ok(res, rows)` to a bare array, and `data.data` is `undefined`, `null`, `{}`
 * or a string — so the first `.map` throws inside `useMemo` during render,
 * React unwinds the subtree, and `SurfaceBoundary` tells the user the surface
 * "didn't finish loading" instead of the truth, which is that we couldn't read
 * what the backend sent.
 *
 * ## What these do
 *
 * They convert that crash into the load-failure state the surface already
 * renders. Nothing here rejects a legitimately empty result: an empty array is
 * a real answer ("this tenant has no records"), and an absent optional field
 * stays absent rather than becoming an error. Only a value that is PRESENT and
 * not the kind of thing the caller reads is reported as a shape failure.
 */

import { toDataState, type DataState } from './dataState';

/** The message a body that arrived in an unreadable shape produces. */
export const shapeMismatch = (source: string) => `unexpected response shape for ${source}`;

/**
 * A non-null, non-array object — the only thing a `{ data: { …panels } }`
 * payload can be. An array passes `typeof x === 'object'`, which is exactly how
 * `{ data: [] }` used to reach a panel read and come back `undefined`.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The first candidate that is genuinely an array, or `null` when none of them
 * is. For the `data.data ?? data.rows ?? []` fallback chains: `??` only skips
 * `null`/`undefined`, so a `data` field holding `{}` or a string won the chain
 * and then failed at `.map`.
 *
 * Returning `null` rather than `[]` keeps "we couldn't read this" separate from
 * "there is nothing here" — a blank board that means the load failed is the
 * quieter half of the same bug.
 */
export function firstArray<T>(...candidates: unknown[]): T[] | null {
  for (const c of candidates) {
    if (Array.isArray(c)) return c as T[];
  }
  return null;
}

/**
 * A row list read off a payload field, as a `DataState`.
 *
 * Absent (`null`/`undefined`) keeps the existing meaning — idle, i.e. the
 * field was never delivered because the fetch hasn't run or the panel isn't
 * part of this payload. Present-but-not-an-array is the case that used to
 * crash the surface one `.map` later, and is reported as an error against
 * `source` so the panel says "couldn't load" rather than "nothing here".
 */
export function toRowsState<T>(
  value: unknown,
  loading: boolean,
  error: string | null | undefined,
  opts: { source: string; idleReason?: string },
): DataState<T[]> {
  if (!error && !loading && value != null && !Array.isArray(value)) {
    return { status: 'error', message: shapeMismatch(opts.source) };
  }
  return toDataState<T[]>(
    Array.isArray(value) ? (value as T[]) : null,
    loading,
    error,
    { idleReason: opts.idleReason },
  );
}
