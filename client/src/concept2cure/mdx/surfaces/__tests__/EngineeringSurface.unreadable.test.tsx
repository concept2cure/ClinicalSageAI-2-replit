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
  riskFile = riskFileKeyed([]);
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

/* Since fold F1 slice B the ISO 14971 matrix is the risk register's, which
   reads the project's risk file itself (GET /api/mdx/risk-items?program_id=,
   v2/surfaces/RiskRegister.tsx). `riskFile` is that read's answer; every other
   request is Engineering's own route. */
const RISK_PATH = `/api/mdx/risk-items?program_id=${PROGRAM.id}`;
const HAZARD = {
  id: 1, ref_code: 'HZ-01', hazard: 'Sensor drift', hazardous_situation: null, harm: 'Missed hypoglycaemia',
  sequence_of_events: null, severity: 4, probability: 3, detectability: 3, residual_probability: 2,
  control_strategy: 'design_reduce', source: 'fmea', status: 'open', acceptable: null,
};
const riskFileKeyed = (rows: unknown[]) => ({
  ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ({ data: rows, meta: { count: rows.length, scope: 'program', programId: PROGRAM.id } }),
  text: async () => '',
});
const RISK_FILE_FAILED = {
  ok: false, status: 500, headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ({ error: { code: 'INTERNAL', message: 'The risk file could not be read.' } }), text: async () => '',
};
let riskFile: unknown = riskFileKeyed([]);

function respond(unavailable: string[], scopes?: Record<string, string>) {
  fetchMock.mockImplementation(async (url: string) => (String(url) === RISK_PATH ? riskFile : {
    ok: true,
    status: 200,
    json: async () => ({ data: EMPTY_DATA, meta: scopes ? { unavailable, scopes } : { unavailable } }),
    text: async () => '',
  }));
}

/** Every blocker source keyed to the project — the shape slice 19 brings. */
const ALL_KEYED = {
  risks: 'program', trace: 'program', dhf: 'program',
  ecrs: 'program', issues: 'program', documents: 'program',
};

/** The sub-head of "What's blocking your documents". */
function blockerSub(c: HTMLElement): string {
  const head = Array.from(c.querySelectorAll('.section-head')).find((h) =>
    /What.s blocking your documents/.test(h.querySelector('h2')?.textContent ?? ''),
  );
  expect(head, 'the blocker section head must render').toBeTruthy();
  return head?.querySelector('.section-sub')?.textContent ?? '';
}

/** The checkCircle icon's path: the all-clear's success mark. */
const CHECK_CIRCLE_PATH = 'M9 11l3 3 8-8';

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

  it('says an empty read has nothing to check', async () => {
    // Slice 0 audit: sources that read empty hold nothing assessed, which is
    // not the all-clear. `eng-no-blockers` is shared by both states, so the
    // testid alone cannot tell them apart; the copy and the mark can. The real
    // all-clear (records read, none blocking) is pinned by
    // EngineeringSurface.projectKeyed.test.tsx.
    respond([]);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    const state = container.querySelector('[data-testid="eng-no-blockers"]') as HTMLElement | null;
    expect(state).not.toBeNull();
    expect(state?.textContent ?? '').toMatch(/No risk records for this project yet/);
    expect(state?.textContent ?? '').toMatch(/so there is nothing to check yet/);
    expect(state?.textContent ?? '').not.toMatch(/Nothing is blocking your documents|were found/);
    expect(state?.innerHTML ?? '').not.toContain(CHECK_CIRCLE_PATH);
  });

  /* Fold F1 slice B: the matrix moved from the accordion's residual heatmap
     (`.eng-heat`) to the risk register (`.riskmx`), which reads the risk file
     itself. The two properties are the same: no matrix over a failed read,
     and the matrix once the read is clean. */
  it('does not draw an all-zero ISO 14971 matrix over a failed risk read', async () => {
    respond(['risks', 'summary']);
    riskFile = RISK_FILE_FAILED;
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/Couldn't load the risk file/));
    expandAwareness(container);

    expect(container.querySelector('.riskmx')).toBeNull();
    expect(container.querySelector('.eng-heat')).toBeNull();
  });

  it('draws the matrix when the risk file read cleanly', async () => {
    respond([]);
    riskFile = riskFileKeyed([HAZARD]);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('.riskmx')).not.toBeNull());
    expect(container.querySelectorAll('.riskmx .riskmx-cell')).toHaveLength(25);
  });

  it('does not report a hazard count over a risk file it could not read', async () => {
    // Was: no "0 of 0 shown" under the four-row list. The register's count is
    // its "Hazards identified" metric and the "N of M" benefit-risk line.
    respond(['risks', 'summary']);
    riskFile = RISK_FILE_FAILED;
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/Couldn't load the risk file/));
    expandAwareness(container);

    expect(/0 of 0 shown/.test(container.textContent ?? '')).toBe(false);
    expect(/Hazards identified|Residual acceptable|of 0 residual risk/.test(container.textContent ?? '')).toBe(false);
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

/* Audit 2 of slice 0: the sub-head above the blocker feed printed its counts
   whatever the read state. `blockers` goes through readyRows, which yields []
   for a failed or loading read as well as an empty one, so "0 review-pending"
   sat directly above "Could not load blocker sources" — and, once slice 19 keys
   the stores, "0 hard blockers" would print over a DHF or non-conformance read
   that failed. */
describe('EngineeringSurface — the blocker sub-head counts only what was read', () => {
  it('prints no review-pending count over a risk file it could not read', async () => {
    respond(['risks', 'summary']);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/Could not load blocker sources/));

    const sub = blockerSub(container);
    expect(sub).not.toMatch(/\d+ review-pending/);
    expect(sub).not.toMatch(/\d+ hard blockers/);
    expect(sub).toMatch(/Not counted until the risk file is read/);
  });

  it('prints no hard-blocker count over sources it could not read, once every source is keyed', async () => {
    respond(['dhf', 'risks', 'ecrs', 'issues', 'summary'], ALL_KEYED);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/Could not load blocker sources/));

    const sub = blockerSub(container);
    expect(sub).not.toMatch(/\d+ hard blockers/);
    expect(sub).not.toMatch(/\d+ review-pending/);
    expect(sub).toMatch(
      /Not counted until the design history, risk file, change requests and non-conformances are read/,
    );
  });

  it('prints no counts while the sources are still loading', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/Loading blocker sources/));

    const sub = blockerSub(container);
    expect(sub).not.toMatch(/\d+ review-pending/);
    expect(sub).not.toMatch(/\d+ hard blockers/);
  });

  it('prints the counts once the sources have been read', async () => {
    // Over-correction guard: a read that resolved is a count, and says so.
    respond([], ALL_KEYED);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    const sub = blockerSub(container);
    expect(sub).toMatch(/\d+ hard blockers/);
    expect(sub).toMatch(/\d+ review-pending/);
    expect(sub).not.toMatch(/Not counted until/);
  });
});
