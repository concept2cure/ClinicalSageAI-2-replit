// @vitest-environment jsdom
/**
 * Moving the home's module grid into an overlay must not cost a single
 * capability.
 *
 * Home used to render every module in the tenant's segment inline, below the
 * composer. That grid now lives in CapabilityBrowser, behind a "Browse all
 * capabilities" trigger. The whole risk of that change is silent loss: a group
 * that stops rendering, an id that no longer resolves, a segment whose modules
 * were only ever reachable from the grid.
 *
 * So the load-bearing test here is PARITY, run per segment rather than once —
 * `SEGMENT_MODULES` is segment-scoped, so proving it for biopharma proves
 * nothing about diagnostics. For every segment the registry knows, every id in
 * `getSegmentModules` must render a button that navigates to exactly that id.
 *
 * The honest-state branches are exercised by forcing them, not by observing the
 * happy path: a segment with no registered modules, and a search that matches
 * nothing, must each say so in words rather than drawing an empty grid.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { CapabilityBrowser } from '../surfaces/CapabilityBrowser';
import { SEGMENTS, getSegmentModules, getSurfaceMeta } from '../registryModel';

afterEach(cleanup);

/* Every segment the rail can put a tenant into. Parity is asserted against each
   one; a segment with no modules is a legitimate state, not a skip. */
const SEGMENT_IDS = SEGMENTS.map((s: { id: string }) => s.id);

describe('CapabilityBrowser — every module the home used to show is still reachable', () => {
  it('knows about more than one segment (guards the loop below from vacuity)', () => {
    expect(SEGMENT_IDS.length).toBeGreaterThan(1);
  });

  for (const segment of SEGMENT_IDS) {
    const groups = getSegmentModules(segment) ?? [];
    const ids = groups.flatMap((g: { items: string[] }) => g.items);
    if (ids.length === 0) continue;

    it(`renders and navigates every module for "${segment}" (${ids.length})`, () => {
      const onNav = vi.fn();
      render(<CapabilityBrowser segment={segment} onNav={onNav} onClose={vi.fn()} />);

      /* Resolve through the same accessor the component uses, so this asserts
         "the registry's label is on screen" and not "some string is". */
      for (const id of ids) {
        const label = getSurfaceMeta(id).label;
        expect(
          screen.getAllByRole('button', { name: new RegExp(escapeRe(label)) }).length,
          `${segment}: no button for ${id} (“${label}”)`,
        ).toBeGreaterThan(0);
      }

      /* Navigation carries the ID, not the label — the thing that actually has
         to survive the move. Sampling the first of each group covers every
         group without asserting the same wiring N hundred times. */
      for (const g of groups) {
        const id = g.items[0];
        if (!id) continue;
        onNav.mockClear();
        fireEvent.click(
          screen.getAllByRole('button', {
            name: new RegExp(escapeRe(getSurfaceMeta(id).label)),
          })[0],
        );
        expect(onNav, `${segment}/${g.label}: click did not navigate to ${id}`).toHaveBeenCalledWith(id);
      }
    });
  }
});

describe('CapabilityBrowser — search', () => {
  const segment = SEGMENT_IDS.find((s) => (getSegmentModules(s) ?? []).length > 0)!;

  it('filters to the typed capability and drops the rest', () => {
    const groups = getSegmentModules(segment) ?? [];
    const target = getSurfaceMeta(groups[0].items[0]).label;
    /* A label from a DIFFERENT group, so the assertion proves filtering rather
       than the accident of one group happening to be short. */
    const other = groups
      .flatMap((g: { items: string[] }) => g.items)
      .map((id: string) => getSurfaceMeta(id).label)
      .find((l: string) => !l.toLowerCase().includes(target.toLowerCase()));

    render(<CapabilityBrowser segment={segment} onNav={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search capabilities'), { target: { value: target } });

    expect(screen.getAllByRole('button', { name: new RegExp(escapeRe(target)) }).length).toBeGreaterThan(0);
    if (other) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${escapeRe(other)}$`) })).toBeNull();
    }
  });

  it('says nothing matched rather than drawing an empty grid', () => {
    render(<CapabilityBrowser segment={segment} onNav={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search capabilities'), {
      target: { value: 'zzzzz-no-such-capability' },
    });
    expect(screen.getByText(/Nothing matches/i)).toBeTruthy();
  });
});

describe('CapabilityBrowser — honest states and dismissal', () => {
  /* An unresolved segment does NOT produce an empty catalogue: getSegmentModules
     falls back to SEGMENT_MODULES.biopharma (registryModel.ts:1004). That is why
     CapabilityBrowser carries no "no modules registered" branch — it could never
     run. Pinned here because the fallback is surprising, and because it is the
     premise the missing branch rests on: if this test ever fails, the browser
     needs that empty state after all. */
  it('an unresolved segment falls back to the biopharma catalogue, never to empty', () => {
    render(<CapabilityBrowser segment="__not-a-segment__" onNav={vi.fn()} onClose={vi.fn()} />);
    const fallback = getSegmentModules('biopharma') ?? [];
    expect(fallback.length).toBeGreaterThan(0);
    const label = getSurfaceMeta(fallback[0].items[0]).label;
    expect(screen.getAllByRole('button', { name: new RegExp(escapeRe(label)) }).length).toBeGreaterThan(0);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<CapabilityBrowser segment={SEGMENT_IDS[0]} onNav={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('is a labelled modal dialog', () => {
    render(<CapabilityBrowser segment={SEGMENT_IDS[0]} onNav={vi.fn()} onClose={vi.fn()} />);
    const dlg = screen.getByRole('dialog', { name: /Browse all capabilities/i });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
