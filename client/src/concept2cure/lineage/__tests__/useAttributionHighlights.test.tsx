// @vitest-environment jsdom
/**
 * useAttributionHighlights — when it paints, and when it refuses (ledger L179).
 *
 * jsdom has no CSS Custom Highlight API, so the registry is stubbed. That is
 * enough to check everything that can actually go wrong here, because the risk
 * is not "does the browser draw a wash" — it is WHICH RANGES get handed to it,
 * and whether the hook keeps painting after the offsets stopped meaning what
 * they meant.
 *
 * What is NOT covered: the painted appearance. These tests cannot see colour or
 * contrast, and the CSS is unverified by them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAttributionHighlights, type AttributionSpan } from '../useAttributionHighlights';

const TEXT = 'The endpoint was met. Adverse events were mild.';

/** Records what each highlight name was handed. */
let sets: Array<{ name: string; ranges: Range[] }>;
let deletes: string[];

class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

function installRegistry() {
  sets = [];
  deletes = [];
  (globalThis as any).Highlight = FakeHighlight;
  (globalThis as any).CSS = {
    highlights: {
      set: (name: string, hl: any) => sets.push({ name, ranges: hl.ranges }),
      delete: (name: string) => deletes.push(name),
    },
  };
}

function removeRegistry() {
  delete (globalThis as any).Highlight;
  delete (globalThis as any).CSS;
}

function mount(text = TEXT): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<p>${text}</p>`;
  document.body.appendChild(root);
  return root;
}

function span(over: Partial<AttributionSpan> = {}): AttributionSpan {
  return {
    charStart: 0,
    charEnd: 21,
    provenanceKind: 'cre_evidence_source',
    usage: 'quoted',
    sourceTitle: 'csr.pdf',
    stale: false,
    ...over,
  };
}

beforeEach(installRegistry);
afterEach(() => {
  removeRegistry();
  document.body.innerHTML = '';
});

describe('useAttributionHighlights', () => {
  it('paints each span into the registry for its kind', () => {
    const root = mount();
    const { result } = renderHook(() =>
      useAttributionHighlights(root, TEXT, [
        span(),
        span({ charStart: 22, charEnd: 46, provenanceKind: 'author_assertion' }),
      ]),
    );

    expect(result.current).toEqual({ status: 'painted', painted: 2, dropped: 0 });
    const names = sets.map((s) => s.name).sort();
    expect(names).toEqual(['attribution-author', 'attribution-source']);
    // And the ranges actually cover the words the offsets name.
    const sourceSet = sets.find((s) => s.name === 'attribution-source')!;
    expect(sourceSet.ranges[0].toString()).toBe('The endpoint was met.');
  });

  it('routes a stale citation to its own registry, not the clean one', () => {
    const root = mount();
    renderHook(() => useAttributionHighlights(root, TEXT, [span({ stale: true })]));
    expect(sets.map((s) => s.name)).toEqual(['attribution-stale']);
  });

  it('routes unaccepted machine text to the loud registry', () => {
    const root = mount();
    renderHook(() =>
      useAttributionHighlights(root, TEXT, [span({ provenanceKind: 'machine_draft' })]),
    );
    expect(sets.map((s) => s.name)).toEqual(['attribution-machine-unaccepted']);
  });

  it('REFUSES to paint once the rendered text is no longer the text the offsets describe', () => {
    // The author typed. Every offset below the caret now means something else.
    const root = mount('The endpoint was NOT met. Adverse events were mild.');
    const { result } = renderHook(() => useAttributionHighlights(root, TEXT, [span()]));

    expect(result.current).toEqual({ status: 'stale-text' });
    expect(sets).toHaveLength(0);
  });

  it('drops a span it cannot locate exactly rather than approximating it', () => {
    const root = mount();
    const { result } = renderHook(() =>
      useAttributionHighlights(root, TEXT, [
        span(),
        span({ charStart: 10, charEnd: 9_999 }), // past the end of the text
      ]),
    );

    expect(result.current).toEqual({ status: 'painted', painted: 1, dropped: 1 });
    expect(sets).toHaveLength(1);
  });

  it('says so when the browser has no highlight API, rather than silently doing nothing', () => {
    removeRegistry();
    const root = mount();
    const { result } = renderHook(() => useAttributionHighlights(root, TEXT, [span()]));
    expect(result.current).toEqual({ status: 'unsupported' });
  });

  it('paints nothing, and says empty, when there are no spans', () => {
    const root = mount();
    const { result } = renderHook(() => useAttributionHighlights(root, TEXT, []));
    expect(result.current).toEqual({ status: 'empty' });
    expect(sets).toHaveLength(0);
  });

  it('does not re-run forever when the caller passes an inline array', () => {
    // The bug this pins: depending on the spans array BY REFERENCE means an
    // inline array — the obvious way to call this — makes every render produce
    // a new one, so effect → setState → render → new array → effect. It
    // presents as the tab locking up rather than as an error, and it reached
    // the test run as an out-of-memory kill.
    const root = mount();
    let renders = 0;
    renderHook(() => {
      renders += 1;
      // A NEW array and NEW objects every render, on purpose.
      return useAttributionHighlights(root, TEXT, [span(), span({ charStart: 22, charEnd: 46 })]);
    });

    // Settles immediately: one render, one state update, done.
    expect(renders).toBeLessThan(5);
    expect(sets.length).toBeLessThan(5);
  });

  it('clears every registry when disabled, so a paused highlight does not linger', () => {
    const root = mount();
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useAttributionHighlights(root, TEXT, [span()], on),
      { initialProps: { on: true } },
    );
    expect(sets).toHaveLength(1);

    deletes = [];
    rerender({ on: false });
    // Every name is cleared, not just the one that was set — a rename in the
    // CSS must not leave a wash painted over text nobody is attributing.
    expect(new Set(deletes)).toEqual(
      new Set([
        'attribution-source',
        'attribution-author',
        'attribution-machine-accepted',
        'attribution-machine-unaccepted',
        'attribution-stale',
      ]),
    );
  });
});
