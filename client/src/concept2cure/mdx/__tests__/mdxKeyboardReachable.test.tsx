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
 * ── Why this test serves candidates from the live endpoint ─────────────────
 * The first attempt rendered device-510k against the empty API response the
 * other MDX tests stub, and found zero checkboxes — so every assertion about
 * them passed while proving nothing. The predicate table only has rows when it
 * has predicates.
 *
 * The second attempt turned sample mode on and read K510_PREDICATES. That set
 * is gone: it paired real FDA clearances with an invented `match` score against
 * the sponsor's device, and nothing on screen said the rows were examples. So
 * the rows now arrive the way they do in production — from
 * /api/predicate-intelligence/candidates, for an open program — and
 * `expect(boxes.length).toBeGreaterThan(0)` below is still the positive
 * control: if the table is ever empty again, this test fails instead of
 * quietly passing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { K510Surface } from '../surfaces/K510Surface';
import type { Program } from '../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'TEST-1 Sensor',
  code: 'TEST-1',
  stageIdx: 2,
  status: 'active',
} as unknown as Program;

/* Three candidates in the wire shape the predicate service returns. Test data:
   it lives here, is served through the real endpoint, and no surface can reach
   it. The K-numbers are deliberately not real clearances. */
const CANDIDATES = {
  candidates: [
    { k_number: 'K000001', device_name: 'Test Device A', applicant: 'Test Co', decision_date: '2024-01-02', product_code: 'AAA', match_score: 0.9 },
    { k_number: 'K000002', device_name: 'Test Device B', applicant: 'Test Co', decision_date: '2023-05-06', product_code: 'AAA', match_score: 0.7 },
    { k_number: 'K000003', device_name: 'Test Device C', applicant: 'Test Co', decision_date: '2022-08-09', product_code: 'AAA', match_score: 0.5 },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/predicate-intelligence/candidates') ? CANDIDATES : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSurface() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <K510Surface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />
    </QueryClientProvider>,
  );
}

describe('510(k) predicate selection is operable without a mouse', () => {
  it('exposes each predicate as a real checkbox control', async () => {
    const { container } = renderSurface();
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
    const { container } = renderSurface();
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
