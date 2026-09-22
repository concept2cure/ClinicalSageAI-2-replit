// @vitest-environment jsdom
/**
 * The protocol workspace's Statistics tab is scoped to THIS protocol's design.
 *
 * It was not. `useBridgeDesigns()` narrows to the open PROGRAM (see
 * `bridgeDesignsPath`) — or, with no program open, to the whole organization —
 * and the pane rendered that list unfiltered. Opening protocol A therefore
 * showed protocol B's sample size, power and alpha under a heading that said
 * "Statistics" on A's workspace. The numbers were right; they answered a
 * question the user had not asked by navigating there.
 *
 * These tests hold the scoping AND the three absences, which mean different
 * things to an author: nothing bound, a bound link that cannot be read, and a
 * read that failed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { StudyDesignStatisticsTab } from '../surfaces/biostatBridge';

const MINE = {
  studyId: 'STUDY-MINE', title: 'BX-204 pivotal in T2D',
  readiness: { percent: 85, checks: [{ key: 'alpha', label: 'Alpha stated', ok: true }], plannedSampleSize: 400, power: 0.9, alpha: 0.04, primaryEndpoint: 'HbA1c change' },
};
const SOMEONE_ELSES = {
  studyId: 'STUDY-OTHER', title: 'BX-204 OS study in NSCLC',
  readiness: { percent: 30, checks: [], plannedSampleSize: 1200, power: 0.8, alpha: 0.05, primaryEndpoint: 'Overall survival' },
};

/**
 * The pane resolves the bound design BY ID, so the mock answers the
 * per-design assessment route. `designsInScope` is what the OLD implementation
 * read — the program-narrowed list — and it is still answered here so a
 * regression back to filtering that list is visible: those rows deliberately
 * contain a design the assessment route does NOT return.
 */
function answerAssessment(byId: Record<string, unknown>, designsInScope: unknown[] = []) {
  apiRequest.mockImplementation(async (_m: string, path: string) => {
    const m = /\/api\/biostat-bridge\/designs\/([^/]+)\/assessment$/.exec(path);
    if (m) {
      const found = byId[decodeURIComponent(m[1])];
      if (!found) return { ok: false, status: 404, json: async () => ({ error: { message: 'No such design in this organization.' } }) };
      return { ok: true, status: 200, json: async () => ({ data: found }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: designsInScope }) };
  });
}

function renderTab(boundStudyId: string | null) {
  const Tab = StudyDesignStatisticsTab as unknown as React.ComponentType<Record<string, unknown>>;
  return render(<Tab onNav={() => undefined} boundStudyId={boundStudyId} />);
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('Statistics tab — scoped to the bound design', () => {
  it('shows the protocol’s OWN design and not another design in the same scope', async () => {
    answerAssessment({ 'STUDY-MINE': MINE, 'STUDY-OTHER': SOMEONE_ELSES }, [MINE, SOMEONE_ELSES]);

    renderTab('STUDY-MINE');

    expect(await screen.findByText(/BX-204 pivotal in T2D/)).toBeTruthy();
    // The other design is in the same API response and must not be rendered.
    expect(screen.queryByText(/BX-204 OS study in NSCLC/)).toBeNull();
    expect(screen.queryByText(/Overall survival/)).toBeNull();
  });

  it('shows the bound design’s numbers, not the first row of the list', async () => {
    answerAssessment({ 'STUDY-MINE': MINE, 'STUDY-OTHER': SOMEONE_ELSES }, [SOMEONE_ELSES, MINE]);

    renderTab('STUDY-MINE');

    expect(await screen.findByText(/400/)).toBeTruthy();
    expect(screen.queryByText(/1200/)).toBeNull();
  });
});

describe('Statistics tab — the three absences stay distinct', () => {
  /*
   * The important one. With nothing bound, the old pane fell back to listing
   * the program's designs. Falling back to that list is the original defect
   * wearing a different label, so the test asserts the OTHER designs are
   * absent even though the API returned them.
   */
  it('says nothing is bound, and does NOT fall back to listing the program’s designs', async () => {
    answerAssessment({ 'STUDY-MINE': MINE, 'STUDY-OTHER': SOMEONE_ELSES }, [MINE, SOMEONE_ELSES]);

    renderTab(null);

    expect(await screen.findByText(/No study design is bound to this protocol/i)).toBeTruthy();
    expect(screen.queryByText(/BX-204 pivotal in T2D/)).toBeNull();
    expect(screen.queryByText(/BX-204 OS study in NSCLC/)).toBeNull();
  });

  it('points the author at the Study design tab rather than leaving a dead end', async () => {
    answerAssessment({}, []);

    renderTab('');

    expect(await screen.findByText(/Bind one on the Study design tab/i)).toBeTruthy();
  });

  /*
   * A 404 from the per-design route IS the unresolved case, but
   * `useDesignAssessment` collapses every non-ok response into `error`, so the
   * pane cannot tell a missing design from a dead store without matching on
   * the message text — which would be brittle. It carries the SERVER'S OWN
   * words instead, and for a 404 those already say exactly the right thing:
   * "No such design in this organization." A vaguer in-house sentence would be
   * a worse answer than the specific one the server already gave.
   */
  it('carries the server\u2019s own words when the bound design is not readable', async () => {
    answerAssessment({ 'STUDY-OTHER': SOMEONE_ELSES }, [SOMEONE_ELSES]);

    renderTab('STUDY-GONE');

    expect(await screen.findByText(/No such design in this organization/i)).toBeTruthy();
    // And it is NOT confused with the nothing-bound state.
    expect(screen.queryByText(/No study design is bound to this protocol/i)).toBeNull();
  });

  it('reports a failed read as a failure, never as an empty or unbound state', async () => {
    apiRequest.mockImplementation(async () => { throw new Error('design store down'); });

    renderTab('STUDY-MINE');

    await waitFor(() => expect(screen.getByText(/Couldn't load the bound study design/i)).toBeTruthy());
    expect(screen.queryByText(/No study design is bound to this protocol/i)).toBeNull();
    expect(screen.queryByText(/No such design in this organization/i)).toBeNull();
  });
});

/*
 * The regression this file exists to prevent, stated as its own case.
 *
 * The first repair filtered the PROGRAM-NARROWED design list by the bound id.
 * Binding is org-scoped and cdisc_prm_studies.program_id is nullable, so a
 * correctly bound design outside the open program produced zero rows and the
 * author was told the link was unresolved. This asserts the pane reads the
 * per-design assessment route, which is tenant-scoped and has no program
 * filter — a design absent from the list but present by id must RENDER.
 */
describe('Statistics tab — resolves by id, not by the program list', () => {
  it('renders a bound design that the program-narrowed list does not contain', async () => {
    answerAssessment({ 'STUDY-MINE': MINE }, [SOMEONE_ELSES]);

    renderTab('STUDY-MINE');

    expect(await screen.findByText(/BX-204 pivotal in T2D/)).toBeTruthy();
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });

  it('asks the per-design route for the bound id', async () => {
    answerAssessment({ 'STUDY-MINE': MINE }, []);

    renderTab('STUDY-MINE');
    await screen.findByText(/BX-204 pivotal in T2D/);

    expect(apiRequest.mock.calls.some((c) => String(c[1]).includes('/api/biostat-bridge/designs/STUDY-MINE/assessment'))).toBe(true);
  });
});
