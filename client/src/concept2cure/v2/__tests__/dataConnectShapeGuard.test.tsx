// @vitest-environment jsdom
/**
 * A 200 is not a contract. `liveGetOrNull<T>` casts the parsed body to `T`, and
 * this is what makes that cast safe to rely on.
 *
 * ── The failure being closed ──────────────────────────────────────────────────
 * A route returning `{ data: [] }` where the surface expects `{ program, tree }`
 * unwraps to a bare `[]`. `[]` is TRUTHY, so it walks past every `if (!data)`
 * guard the surface already wrote, satisfies no field it then reads, and the
 * first `data.tree.map(...)` throws inside `useMemo` during render. React unwinds
 * the subtree and the user is told "this surface didn't finish loading" — when
 * the accurate, already-written answer was "we couldn't load this".
 *
 * Adapters were being patched one at a time for this. A guard at the boundary
 * closes it for a call site in one argument, and routes the outcome into the
 * error branch each surface already renders.
 *
 * ── The two halves ────────────────────────────────────────────────────────────
 * Rejecting bad shapes is the easy half and the less important one. A guard that
 * is too eager is WORSE than no guard: it reports "couldn't load" for data that
 * loaded fine, which is a fabricated error, and this codebase's whole data
 * convention exists to stop surfaces asserting things that are not true. So the
 * cases below are weighted toward what must NOT be rejected — a present-but-null
 * field, a genuinely empty list, an absent payload, a 204.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import {
  liveGetOrNull,
  useLiveData,
  useLiveRows,
  hasKeys,
  isRowsWith,
  shapeMismatch,
} from '../dataConnect';
import { BatchDraft } from '../surfaces/BatchDraft';

interface Spine {
  program: unknown;
  tree: unknown[];
}
const isSpine = hasKeys<Spine>('program', 'tree');

let nextBody: unknown = null;
let nextStatus = 200;

beforeEach(() => {
  nextBody = null;
  nextStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(nextStatus === 204 ? null : JSON.stringify(nextBody), {
          status: nextStatus,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('liveGetOrNull shape guard — rejects what is not the contract', () => {
  it('rejects the empty-list-for-an-object case that caused the crashes', async () => {
    nextBody = { data: [] };
    const r = await liveGetOrNull<Spine>('/api/batch-draft/spine', isSpine);

    expect(r.data, 'the truthy [] was handed through as if it were a Spine').toBeNull();
    expect(r.error).toBe(shapeMismatch('/api/batch-draft/spine'));
  });

  it('names the path in the error, so the failing route is identifiable from a log', async () => {
    nextBody = { data: [] };
    const r = await liveGetOrNull<Spine>('/api/some/specific/route', isSpine);
    expect(r.error).toContain('/api/some/specific/route');
  });

  it.each([
    ['a JSON scalar', 'unexpected'],
    ['a bare array', [{ id: 1 }]],
    ['an object missing a required key', { data: { program: 'p' } }],
    ['a 200 carrying an error body', { error: 'Something went wrong' }],
  ])('rejects %s', async (_label, body) => {
    nextBody = body;
    const r = await liveGetOrNull<Spine>('/api/x', isSpine);
    expect(r.data).toBeNull();
    expect(r.error).toBe(shapeMismatch('/api/x'));
  });

  it('reports the HTTP status alongside the rejection', async () => {
    // The response WAS a 200 — the rejection is about the body, and a caller
    // distinguishing transport failure from contract failure needs both facts.
    nextBody = { data: [] };
    const r = await liveGetOrNull<Spine>('/api/x', isSpine);
    expect(r.status).toBe(200);
  });
});

describe('liveGetOrNull shape guard — does not reject what is legitimate', () => {
  it('accepts the well-formed payload (the guard did not gut the happy path)', async () => {
    nextBody = { data: { program: { id: 'p1' }, tree: [{ id: 'm1' }] } };
    const r = await liveGetOrNull<Spine>('/api/batch-draft/spine', isSpine);

    expect(r.error).toBeUndefined();
    expect(r.data).toEqual({ program: { id: 'p1' }, tree: [{ id: 'm1' }] });
  });

  it('accepts present-but-null fields — "no program selected yet" is real data', async () => {
    nextBody = { data: { program: null, tree: [] } };
    const r = await liveGetOrNull<Spine>('/api/batch-draft/spine', isSpine);

    expect(r.error, 'a legitimate empty program was reported as a broken response').toBeUndefined();
    expect(r.data).toEqual({ program: null, tree: [] });
  });

  it('does not guard an ABSENT payload — that is the honest empty state', async () => {
    // `{ data: null }` means the backend has nothing yet. Reporting an error
    // here would replace a true empty state with a false failure.
    nextBody = { data: null };
    const r = await liveGetOrNull<Spine>('/api/batch-draft/spine', isSpine);

    expect(r.data).toBeNull();
    expect(r.error).toBeUndefined();
  });

  it('does not guard a 204', async () => {
    nextStatus = 204;
    const r = await liveGetOrNull<Spine>('/api/batch-draft/spine', isSpine);
    expect(r.status).toBe(204);
    expect(r.error).toBeUndefined();
  });

  it('is unchanged when no guard is passed (the 100+ existing call sites)', async () => {
    // Back-compat is load-bearing: every call site that has not opted in must
    // behave exactly as before, including the truthy-[] case.
    nextBody = { data: [] };
    const r = await liveGetOrNull<Spine>('/api/batch-draft/spine');
    expect(r.error).toBeUndefined();
    expect(r.data).toEqual([]);
  });
});

describe('hasKeys / isRowsWith', () => {
  it('hasKeys rejects arrays and null, accepts an object with the keys', () => {
    const g = hasKeys<{ a: unknown }>('a');
    expect(g({ a: 1 })).toBe(true);
    expect(g({ a: undefined })).toBe(true); // present, explicitly unset
    expect(g({ b: 1 })).toBe(false);
    expect(g([])).toBe(false);
    expect(g(null)).toBe(false);
    expect(g('a')).toBe(false);
  });

  it('isRowsWith accepts an EMPTY array — zero rows is a real answer', () => {
    const g = isRowsWith<{ id: unknown }>('id');
    expect(g([]), 'an empty list was rejected as a malformed shape').toBe(true);
    expect(g([{ id: 1 }])).toBe(true);
    expect(g([{ nope: 1 }])).toBe(false);
    expect(g({ id: 1 })).toBe(false);
  });
});

describe('the hooks carry the guard through', () => {
  it('useLiveData surfaces a shape rejection as error, not as data', async () => {
    nextBody = { data: [] };
    const { result } = renderHook(() => useLiveData<Spine>('/api/spine', ['/api/spine'], isSpine));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(shapeMismatch('/api/spine'));
    // `empty` means "loaded fine, nothing to show". This did not load fine, and
    // a surface branching on empty-before-error would otherwise claim it did.
    expect(result.current.empty, 'a failed load was reported as an empty one').toBe(false);
  });

  it('useLiveRows reports a non-array as an error instead of a false empty state', async () => {
    // Without a guard this flattens to zero rows and renders "nothing here yet",
    // which is an empty state that is not true.
    nextBody = { data: { rows: [] } };
    const { result } = renderHook(() =>
      useLiveRows<{ id: string }>('/api/rows', ['/api/rows'], isRowsWith<{ id: string }>('id')),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(shapeMismatch('/api/rows'));
    expect(result.current.empty).toBe(false);
    expect(result.current.rows).toEqual([]); // still safe to .map
  });

  it('useLiveRows still reports a genuinely empty list as empty', async () => {
    nextBody = { data: [] };
    const { result } = renderHook(() =>
      useLiveRows<{ id: string }>('/api/rows', ['/api/rows'], isRowsWith<{ id: string }>('id')),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeUndefined();
    expect(result.current.empty).toBe(true);
  });

  it('an INLINE guard does not re-trigger the fetch on every render', async () => {
    // A new function identity each render is the normal way to write this at a
    // call site. If `guard` were a dependency it would loop forever, so it is
    // held in a ref — assert that directly rather than trusting the reader.
    nextBody = { data: { program: null, tree: [] } };
    const { result, rerender } = renderHook(() =>
      useLiveData<Spine>('/api/spine', ['/api/spine'], hasKeys<Spine>('program', 'tree')),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const afterFirstLoad = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;

    rerender();
    rerender();
    rerender();

    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
      'the inline guard re-triggered the fetch — it is being treated as a dependency',
    ).toBe(afterFirstLoad);
  });
});

describe('a guarded surface reports instead of crashing', () => {
  /*
   * The unit tests above prove the mechanism. This proves the wiring, on the
   * surface and the route that produced the original crash.
   *
   * BatchDraft reads `/api/batch-draft/spine` and writes `spine ? spine.tree :
   * EMPTY_TREE`. Given `{ data: [] }` that is `[] ? [].tree : …` → `undefined`,
   * which `bdFlatten` then walks. Before the guard this threw during render;
   * `SurfaceBoundary` would catch it and tell the user their surface failed to
   * load, when the accurate answer — already written, three lines below — is
   * that the spine could not be read.
   */
  // BatchDraft reads only onAsk/onNav/segment. Typing the component by what the
  // test actually supplies keeps this from depending on every field of
  // `UiSurface`, which would make the file churn on unrelated registry changes.
  const Surface = BatchDraft as unknown as React.ComponentType<Record<string, unknown>>;

  const renderSurface = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
      </QueryClientProvider>,
    );
  };

  it('BatchDraft renders its error state for the payload that used to crash it', async () => {
    nextBody = { data: [] };
    // render() rethrows anything thrown during render, so reaching the
    // assertions at all is half the proof.
    const { container } = renderSurface();

    await waitFor(() =>
      expect(container.querySelector('.c2c-empty-state.tone-error')).not.toBeNull(),
    );
    // And it is the honest message, not the boundary's "didn't finish loading".
    expect(container.querySelector('.surface-degraded')).toBeNull();
  });

  it('BatchDraft still renders its real content for a well-formed spine', async () => {
    // The other side of the ratchet: a guard that rejects everything would pass
    // the test above and ship a permanently broken surface.
    nextBody = {
      data: {
        program: 'BX204',
        standard: 'eCTD',
        tree: [
          { id: 'd1', num: '2.7.1', title: 'Biopharmaceutic Studies', status: 'draft', pct: 20 },
        ],
      },
    };
    const { container } = renderSurface();

    await waitFor(() => expect(container.querySelector('.c2c-empty-state.tone-error')).toBeNull());
    expect(container.textContent).toContain('Biopharmaceutic Studies');
  });
});
