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
  studyId: 'STUDY-MINE', programId: null, title: 'BX-204 pivotal in T2D', phase: '3', indication: 'type 2 diabetes', status: 'draft', updatedAt: null,
  readiness: { percent: 85, checks: [{ key: 'alpha', label: 'Alpha stated', ok: true }], plannedSampleSize: 400, power: 0.9, alpha: 0.04, primaryEndpoint: 'HbA1c change' },
};
const SOMEONE_ELSES = {
  studyId: 'STUDY-OTHER', programId: null, title: 'BX-204 OS study in NSCLC', phase: '3', indication: 'NSCLC', status: 'draft', updatedAt: null,
  readiness: { percent: 30, checks: [], plannedSampleSize: 1200, power: 0.8, alpha: 0.05, primaryEndpoint: 'Overall survival' },
};

/** The list read's real payload shape: `{ data: rows }` with a status. */
function answerDesigns(rows: unknown[]) {
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: rows }) }));
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
    answerDesigns([MINE, SOMEONE_ELSES]);

    renderTab('STUDY-MINE');

    expect(await screen.findByText(/BX-204 pivotal in T2D/)).toBeTruthy();
    // The other design is in the same API response and must not be rendered.
    expect(screen.queryByText(/BX-204 OS study in NSCLC/)).toBeNull();
    expect(screen.queryByText(/Overall survival/)).toBeNull();
  });

  it('shows the bound design’s numbers, not the first row of the list', async () => {
    answerDesigns([SOMEONE_ELSES, MINE]);

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
    answerDesigns([MINE, SOMEONE_ELSES]);

    renderTab(null);

    expect(await screen.findByText(/No study design is bound to this protocol/i)).toBeTruthy();
    expect(screen.queryByText(/BX-204 pivotal in T2D/)).toBeNull();
    expect(screen.queryByText(/BX-204 OS study in NSCLC/)).toBeNull();
  });

  it('points the author at the Study design tab rather than leaving a dead end', async () => {
    answerDesigns([]);

    renderTab('');

    expect(await screen.findByText(/Bind one on the Study design tab/i)).toBeTruthy();
  });

  it('reports a bound design it cannot read as UNRESOLVED, not as no design', async () => {
    answerDesigns([SOMEONE_ELSES]);

    renderTab('STUDY-GONE');

    expect(await screen.findByText(/could not be read/i)).toBeTruthy();
    expect(screen.getByText(/The link is unresolved/i)).toBeTruthy();
    // Distinct from the nothing-bound state.
    expect(screen.queryByText(/No study design is bound to this protocol/i)).toBeNull();
  });

  it('reports a failed read as a failure, never as an empty or unbound state', async () => {
    apiRequest.mockImplementation(async () => { throw new Error('design store down'); });

    renderTab('STUDY-MINE');

    await waitFor(() => expect(screen.getByText(/Couldn't load study designs/i)).toBeTruthy());
    expect(screen.queryByText(/No study design is bound to this protocol/i)).toBeNull();
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });
});
