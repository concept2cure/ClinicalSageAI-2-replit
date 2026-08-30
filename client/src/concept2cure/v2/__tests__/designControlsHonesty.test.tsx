// @vitest-environment jsdom
/**
 * The DHF surface may not describe work that its own traceability roll-up says
 * does not exist, and may not report a populated design history file as empty.
 *
 * ── Finding 1 — the lead promised missing V&V over a fully traced DHF ────────
 * `reassure` was a single static string sitting outside every branch:
 *
 *   "I'll draft the missing V&V protocols, link each to the input it covers,
 *    and flag any orphan output before the review -- you sign off."
 *
 * One prop above it, the headline had already said, in the same render, "Every
 * design input traces cleanly to output -> verification -> validation. The DHF
 * is audit-ready on traceability" — which is reached only when no row lacks an
 * output, a passing verification or a passing validation. So the surface
 * asserted outstanding V&V work and orphan outputs against a matrix in which it
 * had just counted neither. To a regulatory director preparing a design review
 * that is a fabricated open item on a governed record (21 CFR 820.30(j)).
 *
 * The fix is not deletion — the sentence is TRUE when inputs are untraced, and
 * a lead that can never offer to close a gap is the same defect inverted. Both
 * directions are pinned below.
 *
 * ── Finding 2 — the empty state painted over a successful, non-empty read ────
 * `inputs` was a local mirror of `live.rows`, seeded by a `useEffect`. Effects
 * run after the render they belong to, so in the render where `live.loading`
 * first flipped false the real rows were in hand and `inputs` was still `[]` —
 * and that render painted "No design inputs defined yet ... Add your first with
 * New design input above" over a design history file that had records in it.
 *
 * That paint is a single commit and is gone from the DOM by the time an
 * assertion could read it, so it is caught at the point it happens instead:
 * `EmptyState` is wrapped to record every render of itself. Given a read that
 * returns three real design inputs, the "no design inputs" panel must never be
 * constructed at all. The wrapper is a probe, not a fixture — the component
 * under test is the real one, the hook under it is the real `useLiveRows`, and
 * the recorded titles are the surface's own strings.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/** Titles of every EmptyState the surface rendered, in commit order. */
const emptyRenders = vi.hoisted(() => [] as string[]);
vi.mock('../dataConnect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dataConnect')>();
  const react = await import('react');
  return {
    ...actual,
    EmptyState: (props: { title: string }) => {
      emptyRenders.push(props.title);
      return react.createElement(actual.EmptyState as never, props as never);
    },
  };
});

import { DesignControls } from '../surfaces/DesignControls';

/** A design input traced end to end: output linked, verification and validation
 *  both recorded as passing. This is the positive evidence the surface treats as
 *  "an assessment ran" — a result somebody entered, not an empty list. */
const traced = (id: string) => ({
  id,
  cat: 'performance',
  req: 'Battery lasts a full 14-day wear period',
  riskRef: 'HZ-02',
  outputs: [{ id: 'DO-' + id, desc: 'Power budget specification' }],
  ver: 'pass',
  verRef: 'VER-' + id,
  val: 'pass',
  valRef: 'VAL-' + id,
});

/** A design input with no output and no V&V result — a real traceability gap. */
const untraced = (id: string) => ({
  id,
  cat: 'safety',
  req: 'Alarm is audible at 1 m in a 60 dBA ward',
  riskRef: null,
  outputs: [],
  ver: null,
  verRef: null,
  val: null,
  valRef: null,
});

function respondWith(rows: unknown[]) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (String(method) === 'GET' && String(url) === '/api/design-controls') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: rows }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
  });
}

function mount() {
  render(
    <DesignControls
      {...({ surface: { id: 'design-controls' }, onAsk: vi.fn(), onNav: vi.fn() } as any)}
    />,
  );
}

const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  emptyRenders.length = 0;
});
afterEach(() => cleanup());

describe('Design controls — the lead may not invent open V&V work', () => {
  it('withholds the "missing V&V protocols" offer when every input is fully traced', async () => {
    respondWith([traced('DI-01'), traced('DI-02'), traced('DI-03')]);
    mount();

    await waitFor(() => expect(text()).toMatch(/audit-ready on traceability/i));

    // The two claims the finding named. Both are about work the roll-up
    // immediately above them counted as zero.
    expect(/missing V&V protocols/i.test(text()), 'must not offer to draft protocols it has counted as complete').toBe(false);
    expect(/orphan output/i.test(text()), 'must not offer to flag orphan outputs when no input lacks an output').toBe(false);

    // ── Over-correction guard (a) ────────────────────────────────────────────
    // Clearance must remain REACHABLE and must still say something. A lead that
    // fell silent, or that could never reach the clear headline, would defeat
    // the surface: the DHF being fully traced is the outcome it exists to show.
    expect(text()).toMatch(/Every design input traces cleanly/i);
    expect(text()).toMatch(/Nothing is outstanding on traceability/i);
  });

  it('still offers to draft them when inputs are genuinely untraced', async () => {
    // ── Over-correction guard (b) ────────────────────────────────────────────
    // The sentence is true here, so deleting it rather than gating it would be
    // the fix failing in the other direction.
    respondWith([traced('DI-01'), untraced('DI-02')]);
    mount();

    await waitFor(() => expect(text()).toMatch(/not yet fully traced/i));

    expect(text()).toMatch(/missing V&V protocols/i);
    expect(/audit-ready on traceability/i.test(text()), 'one untraced input is not audit-ready').toBe(false);
    expect(/Nothing is outstanding on traceability/i.test(text()), 'must not reassure with a gap on file').toBe(false);
  });
});

describe('Design controls — a populated read is never reported as an empty DHF', () => {
  it('never renders "No design inputs defined yet" over a read that returned rows', async () => {
    respondWith([traced('DI-01'), untraced('DI-02'), untraced('DI-03')]);
    mount();

    await waitFor(() => expect(screen.getAllByText('DI-03').length).toBeGreaterThan(0));

    expect(
      emptyRenders.filter((t) => /No design inputs defined yet/i.test(t)),
      'the "add your first design input" panel was painted over a successful read of three real 820.30(c) records',
    ).toEqual([]);
    // And the matrix the read actually returned is what the user ends up on.
    expect(text()).toMatch(/3 design inputs/i);
  });

  it('still shows the honest empty state when the store genuinely holds nothing', async () => {
    // ── Over-correction guard (c) ────────────────────────────────────────────
    // Sourcing the render from the live rows must not cost the real empty
    // state, and an empty DHF must not inherit the clear branch: 0 fully traced
    // of 0 total is an arithmetic tie, not an audit-ready design history file.
    respondWith([]);
    mount();

    await waitFor(() => expect(text()).toMatch(/No design inputs defined yet/i));

    expect(/audit-ready on traceability/i.test(text()), 'an empty DHF is not audit-ready on traceability').toBe(false);
    expect(/Nothing is outstanding on traceability/i.test(text()), 'nothing has been assessed, so nothing may be reassured').toBe(false);
  });
});
