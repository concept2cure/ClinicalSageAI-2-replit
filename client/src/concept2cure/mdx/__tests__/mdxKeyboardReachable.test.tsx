// @vitest-environment jsdom
/**
 * Two controls in the MDX kit that no keyboard could reach.
 *
 *   K510Surface     The predicates a 510(k) claims substantial equivalence
 *                   against were selected through a <span className="cbox">
 *                   with a data-on attribute, inside a <td> and a <tr> that
 *                   both carried click handlers. No input, no role, no tab
 *                   stop: there was no keyboard path to the selection at all,
 *                   on the step that decides what the submission argues from.
 *
 *   AnaDrafter      Activating a reviewer deficiency was a click handler on a
 *                   <div>, and which one was open was carried by a CSS class,
 *                   so assistive technology could neither reach it nor tell.
 *
 * ── Why this test turns sample mode on ───────────────────────────────────────
 * The first attempt at this rendered device-510k against the empty API response
 * the other MDX tests stub, and found zero checkboxes — so every assertion about
 * them passed while proving nothing. The predicate table only has rows when it
 * has predicates. Sample mode is the supported way to get canonical rows without
 * inventing a payload, and `expect(rows.length).toBeGreaterThan(0)` below is a
 * positive control: if the table is ever empty again, this test fails instead of
 * quietly passing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MdxSurfaceHost } from '../MdxSurfaceHost';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

const SAMPLE_KEY = 'c2c_mdx_sample_data';

beforeEach(() => {
  window.localStorage.setItem(SAMPLE_KEY, 'on');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(SAMPLE_KEY);
});

function renderNav(nav: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost
        {...({ surface: { id: nav }, onAsk: () => {}, onNav: () => {}, segment: 'medtech' } as unknown as SurfaceViewProps)}
        nav={nav as never}
      />
    </QueryClientProvider>,
  );
}

describe('510(k) predicate selection is operable without a mouse', () => {
  it('exposes each predicate as a real checkbox control', async () => {
    const { container } = renderNav('device-510k');
    await waitFor(() => expect(container.querySelector('.cbox')).toBeTruthy());

    const boxes = Array.from(container.querySelectorAll('.cbox'));
    // Positive control: an empty table would make everything below vacuous.
    expect(boxes.length).toBeGreaterThan(0);

    for (const b of boxes) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('role')).toBe('checkbox');
      expect(b.getAttribute('aria-checked')).toMatch(/^(true|false)$/);
      // A control a screen reader cannot name is a control it cannot offer.
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('reports the selection through aria-checked, not a data attribute alone', async () => {
    const { container } = renderNav('device-510k');
    await waitFor(() => expect(container.querySelector('.cbox')).toBeTruthy());

    /* Toggle an UNCHECKED one. `toggle` deliberately refuses to leave the
       selection empty — `if (n.size === 0) n.add(k)` — because the surface
       compares predicates side by side and one seeded selection is the floor.
       Clicking the already-checked box is therefore a no-op by design, and an
       earlier version of this test read that correct behaviour as a failure. */
    const boxes = () => Array.from(container.querySelectorAll('.cbox')) as HTMLButtonElement[];
    const target = boxes().find((b) => b.getAttribute('aria-checked') === 'false');
    expect(target, 'expected at least one unselected predicate to toggle').toBeTruthy();
    const label = target!.getAttribute('aria-label');

    fireEvent.click(target!);

    await waitFor(() => {
      const again = boxes().find((b) => b.getAttribute('aria-label') === label);
      expect(again!.getAttribute('aria-checked')).toBe('true');
    });
  });
});
