// @vitest-environment jsdom
/**
 * `useLiveRows().rows` must be referentially stable between renders.
 *
 * ── Why this is a correctness property, not a performance one ─────────────────
 * `rows` is the natural dependency for the effect a list surface writes to seed
 * its local working set from the live file:
 *
 *   useEffect(() => { if (live.rows !== seeded.current) { … setRows(live.rows) } },
 *             [live.loading, live.error, live.rows]);
 *
 * That is the shape used by the CMC registers, the Module 3 program-records
 * chain, specifications and batch records. It is correct only if `rows` changes
 * identity exactly when the fetch re-resolves.
 *
 * The hook returned `Array.isArray(st.data) ? st.data : []`. When the payload IS
 * an array the reference comes from state and is stable. When it is NOT — a 204,
 * or a `{ success: true, data: null }` success, both of which the honest-empty
 * contract explicitly allows — every render produced a BRAND NEW `[]`. The
 * effect then fires on every render, sets state, causes a render, and fires
 * again: an unbounded loop that pins the tab, on the honest-empty path
 * specifically. No error is thrown, so it looks like a slow surface rather than
 * a defect.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { useLiveRows } from '../dataConnect';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

/** Renders the hook and reports the `rows` reference seen on each render. */
function Probe({ onRows }: { onRows: (rows: unknown[]) => void }) {
  const [, force] = React.useState(0);
  const live = useLiveRows<{ id: number }>('/api/probe');
  onRows(live.rows);
  // A re-render with no change to the fetch — exactly what a parent re-render,
  // a sibling state change, or a context update produces.
  (Probe as unknown as { force?: () => void }).force = () => force((n) => n + 1);
  return <div data-loading={live.loading ? '1' : '0'} />;
}

describe('useLiveRows — rows identity', () => {
  it('keeps one reference across re-renders when the payload is a real array', async () => {
    apiRequest.mockResolvedValue(res({ success: true, data: [{ id: 1 }] }));
    const seen: unknown[][] = [];
    render(<Probe onRows={(r) => seen.push(r)} />);
    await waitFor(() => expect(seen.some((r) => r.length === 1)).toBe(true));
    const before = seen[seen.length - 1];
    act(() => (Probe as unknown as { force: () => void }).force());
    expect(seen[seen.length - 1]).toBe(before);
  });

  it.each([
    ['a null-payload success', { success: true, data: null }, 200],
    ['a 204 No Content', null, 204],
  ])('keeps one reference across re-renders on %s', async (_name, payload, status) => {
    apiRequest.mockResolvedValue(res(payload, status));
    const seen: unknown[][] = [];
    render(<Probe onRows={(r) => seen.push(r)} />);
    await waitFor(() => expect(document.querySelector('[data-loading="0"]')).toBeTruthy());

    const before = seen[seen.length - 1];
    act(() => (Probe as unknown as { force: () => void }).force());
    const after = seen[seen.length - 1];

    // Before the fix this was a fresh [] each render, so any effect keyed on
    // `rows` re-ran forever on the honest-empty path.
    expect(after).toBe(before);
    expect(after).toEqual([]);
  });

  it('a consumer effect keyed on rows settles instead of looping', async () => {
    apiRequest.mockResolvedValue(res({ success: true, data: null }));
    let effectRuns = 0;

    function Consumer() {
      const live = useLiveRows<{ id: number }>('/api/probe');
      const [rows, setRows] = React.useState<{ id: number }[]>([]);
      const seeded = React.useRef<{ id: number }[] | null>(null);
      React.useEffect(() => {
        if (live.loading || live.error) return;
        if (live.rows !== seeded.current) {
          effectRuns += 1;
          seeded.current = live.rows;
          setRows(live.rows);
        }
      }, [live.loading, live.error, live.rows]);
      return <div data-count={rows.length} />;
    }

    render(<Consumer />);
    await waitFor(() => expect(effectRuns).toBeGreaterThan(0));
    // Let any runaway loop have plenty of opportunity to run.
    await new Promise((r) => setTimeout(r, 60));
    // Seeding a resolved payload happens ONCE. Unbounded growth here is the
    // loop; a small constant is the fix holding.
    expect(effectRuns).toBe(1);
  });
});
