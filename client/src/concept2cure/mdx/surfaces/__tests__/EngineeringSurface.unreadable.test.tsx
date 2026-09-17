// @vitest-environment jsdom
/**
 * A failed read must not become an all-clear.
 *
 * The engineering surface makes exactly one affirmative regulatory claim, and
 * it is the sentence above the fold that the user acts on:
 *
 *   "Nothing is blocking your documents — No draft or blocked DHF sections,
 *    unverified risks, open change requests or non-conformances were found."
 *
 * `blockers` is built from the dhf, risks, ecrs and issues panels through
 * `readyRows`, which yields [] for a FAILED read exactly as it does for an
 * empty one, and the section had no gate — so four unreadable records printed
 * as a clean bill of health. The ISO 14971 residual heatmap sat outside a gate
 * for the same reason, drawing an all-zero matrix (no hazard in any band,
 * including the unacceptable ones) from a read that never happened; and the
 * metrics row was gated on `summary` while four of its cards counted
 * `documents`.
 *
 * These are render-level assertions on purpose: the hook tests already prove
 * the DataState is `error`, and the defect was that the state was correct and
 * the region ignored it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { EngineeringSurface } from '../EngineeringSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'ENG-1 Sensor',
  code: 'ENG-1',
} as unknown as Program;

const EMPTY_DATA = {
  summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
  dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function respond(unavailable: string[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: EMPTY_DATA, meta: { unavailable } }),
    text: async () => '',
  });
}

/** The residual-risk matrix lives inside the "awareness" accordion, which is
 *  collapsed on mount. Without expanding it, `.eng-heat` is absent for a reason
 *  that has nothing to do with the read — which would make the assertions below
 *  pass while proving nothing. */
function expandAwareness(container: HTMLElement) {
  const toggle = container.querySelector('[aria-expanded]') as HTMLElement | null;
  expect(toggle, 'the awareness accordion toggle must exist').not.toBeNull();
  fireEvent.click(toggle as HTMLElement);
}

function mount() {
  return render(
    <EngineeringSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />,
  );
}

describe('EngineeringSurface — an unreadable panel is not an all-clear', () => {
  it('does not claim nothing is blocking when the blocker sources failed', async () => {
    respond(['dhf', 'risks', 'ecrs', 'issues', 'summary']);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    expect(container.querySelector('[data-testid="eng-no-blockers"]')).toBeNull();
    expect(/Nothing is blocking your documents/i.test(container.textContent ?? '')).toBe(false);
  });

  it('still gives the all-clear when the sources genuinely read empty', async () => {
    // Over-correction guard: a clean read with no blockers is good news and
    // must keep saying so.
    respond([]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    expect(container.querySelector('[data-testid="eng-no-blockers"]')).not.toBeNull();
  });

  it('does not draw an all-zero ISO 14971 matrix over a failed risk read', async () => {
    respond(['risks', 'summary']);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));
    expandAwareness(container);

    expect(container.querySelector('.eng-heat')).toBeNull();
  });

  it('draws the heatmap when the risk file read cleanly', async () => {
    respond([]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));
    expandAwareness(container);

    expect(container.querySelector('.eng-heat')).not.toBeNull();
  });

  it('does not report "0 of 0 shown" over a risk file it could not read', async () => {
    respond(['risks', 'summary']);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));
    expandAwareness(container);

    expect(/0 of 0 shown/.test(container.textContent ?? '')).toBe(false);
  });

  it('does not print "Documents in flight 0" when the documents read failed', async () => {
    // summary read fine; documents did not. Gated on summary alone, all four
    // document-derived cards rendered as zeroes under a ready heading.
    respond(['documents']);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    expect(/Documents in flight/i.test(container.textContent ?? '')).toBe(false);
  });
});
