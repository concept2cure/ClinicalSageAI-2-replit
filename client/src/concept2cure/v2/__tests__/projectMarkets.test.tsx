// @vitest-environment jsdom
/**
 * Submit: one row per market, each with its own server verdict; the header
 * status line (docs/design/FILING_SPINE.md F9, §6 row 12).
 *
 * The Submit tab showed ONE dispatch verdict per project: the gate read only
 * the submission of the project's own application type
 * (programSequence.ts findProgramSubmission), so a project filing an IND to
 * FDA and an MAA to EMA had a verdict for the IND and nothing for the MAA.
 *
 * Now each market (one submission: an application type to one agency) is a
 * row with its latest sequence and that sequence's own verdict from
 * GET /api/submissions/sequences/:seqId/dispatch-readiness. A failed read on
 * one row is "No verdict" with a retry on that row, never "Cleared", and the
 * other rows stay. The project header carries one line: each market's verdict
 * and the number of documents in review, from the same reads the tabs make.
 *
 * Review fixes (F9 review): the header counts only documents still out for
 * review, by the Review tab's own grouping (approved, declined and
 * changes-requested rows are on the board but not in review); "Add a market"
 * opens New submission in the Submission Center; a 403 on the list is the person's role, not a failed read; a
 * sequence list with no body is no verdict, not "no sequence".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { consumeNavParams, resolveSurfaceIdForTarget } from '../navParams';

const PID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SCOPED = `/api/submissions?programId=${PID}`;
const BOARD = `/api/review/board?scope=all&programId=${PID}&limit=100`;
const VERDICT = '/api/submissions/sequences/905/dispatch-readiness';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = (status = 500) => Object.assign(new Error(status === 403 ? 'Forbidden' : 'Server error'), { status });
const noContent = () => ({ ok: true, status: 204, json: async () => null }) as unknown as Response;

const PROGRAM = { id: PID, name: 'ONC-221', code: 'ONC-221', product_name: 'Vorelinib', program_type: 'IND', status: 'active' };
const IND = {
  id: 61, title: 'ONC-221 IND', productName: 'Vorelinib', applicationType: 'ind', clientType: 'biotech',
  primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PID,
};
const MAA = {
  id: 62, title: 'ONC-221 EU MAA', productName: 'Vorelinib', applicationType: 'maa', clientType: 'biotech',
  primaryRegion: 'eu', status: 'planning', lifecycleStage: 'planning', programId: PID,
};
/* The server's verdict on sequence 0000: blocked, by two blockers it words. */
const BLOCKED = {
  sequenceId: 905, region: 'fda', sequenceStatus: 'assembling', validationErrors: 2,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 2, warnings: 5, infos: 1, findings: [] }, leafCount: 14,
  gate: { cleared: false, blockers: ['2 open error-severity validation findings.', 'No §11.70 release signature on this sequence.'] },
};
const support = (applicationType: string, market: string, summary: string) => ({
  applicationType, asOf: '2026-10-08',
  markets: [{ applicationType, market, region: market, agency: market.toUpperCase(), summary, line: summary, buildable: true, offered: true }],
});
/* Five rows on the board; three are still out for review (two in review, one
   awaiting sign-off). The changes-requested and the approved rows are not. */
const REVIEWS = {
  queue: [
    { id: 'd1', doc: 'Protocol amendment 3', state: 'pending', docStatus: 'IN_REVIEW', comments: 0 },
    { id: 'd2', doc: 'Investigator brochure', state: 'pending', docStatus: 'IN_REVIEW', comments: 1 },
    { id: 'd3', doc: 'Cover letter', state: 'changes-requested', docStatus: 'DRAFT', comments: 2 },
    { id: 'd4', doc: 'Form FDA 1571', state: 'approved', docStatus: 'APPROVED', comments: 0 },
    { id: 'd5', doc: 'Pharmacology summary', state: 'approved', docStatus: 'IN_REVIEW', comments: 0 },
  ],
};
const ALL_APPROVED = {
  queue: Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, doc: `Approved ${i}`, state: 'approved', docStatus: 'APPROVED', comments: 0 })),
};

type Opts = { subs?: unknown[]; verdictFailures?: number; failList?: boolean | number; sequencesNoBody?: boolean; board?: unknown };
/** The server, as a table of paths; each answer is a function so it can fail. */
function routes(opts: Opts, nextVerdict: () => Response): Record<string, () => Response> {
  const indSequences = [{ id: 905, sequenceNumber: '0000', status: 'assembling', type: 'original', region: 'fda' }];
  return {
    [`/api/c2c/projects/${PID}`]: () => ok(PROGRAM),
    [SCOPED]: () => {
      if (opts.failList) throw fail(typeof opts.failList === 'number' ? opts.failList : 500);
      return ok({ data: opts.subs ?? [IND, MAA], meta: { notOffered: 0 } });
    },
    [`/api/submissions/${IND.id}/sequences`]: () => (opts.sequencesNoBody ? noContent() : ok({ data: indSequences })),
    [`/api/submissions/${MAA.id}/sequences`]: () => ok({ data: [] }),
    [VERDICT]: nextVerdict,
    '/api/submissions/market-support?applicationType=ind&market=fda': () => ok(support('ind', 'fda', 'FDA eCTD v4.0 is built and validated here')),
    '/api/submissions/market-support?applicationType=maa&market=eu': () => ok(support('maa', 'eu', 'EU eCTD is built here; the gateway is not connected')),
    [BOARD]: () => ok({ data: opts.board ?? REVIEWS }),
  };
}

function serve(opts: Opts = {}) {
  let verdictFailures = opts.verdictFailures ?? 0;
  const table = routes(opts, () => {
    if (verdictFailures > 0) { verdictFailures -= 1; throw fail(); }
    return ok(BLOCKED);
  });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const answer = table[String(raw ?? '')];
    return answer ? answer() : ok({});
  });
}

const onNav = vi.fn();
function renderHome() {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
}
async function openSubmit() {
  renderHome();
  await waitFor(() => {
    const tab = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Submit'));
    expect(tab).toBeTruthy();
    fireEvent.click(tab as Element);
  });
}
const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));
/** The market rows, by the market each names. */
async function marketRow(words: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getAllByTestId('pj-submission').length).toBeGreaterThan(0));
  const row = screen.getAllByTestId('pj-submission').find((r) => r.textContent?.includes(words));
  expect(row, `a market row naming ${words}`).toBeTruthy();
  return row as HTMLElement;
}

beforeEach(() => {
  onNav.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  delete (window as unknown as { C2C_NAV_PARAMS?: unknown }).C2C_NAV_PARAMS;
});

describe('Submit — one row per market, each with its own server verdict', () => {
  it('an IND to FDA blocked by 2 blockers, and an MAA to EMA with no sequence, each say so on their own row', async () => {
    serve();
    await openSubmit();
    const ind = await marketRow('ONC-221 IND');
    await waitFor(() => expect(ind.textContent).toContain('Dispatch blocked · 2 blockers'));
    expect(ind.textContent).toContain('IND');
    expect(ind.textContent).toContain('FDA (US)');
    expect(ind.textContent).toContain('Sequence 0000');
    expect(ind.textContent).toContain('Assembling');
    // The submission's lifecycle stage, as slice 24's row showed it.
    expect(within(ind).getByTestId('pj-market-stage').textContent).toBe('original stage');
    // The announced verdict names its market.
    expect(within(ind).getByTestId('pj-market-verdict').textContent).toContain('IND · FDA (US): Dispatch blocked');
    // The server's blockers, verbatim.
    expect(ind.textContent).toContain('No §11.70 release signature on this sequence.');
    // What the platform can carry for this market (F19), on the row.
    await waitFor(() => expect(within(ind).getByTestId('market-support').textContent).toContain('FDA eCTD v4.0 is built and validated here'));

    const maa = await marketRow('ONC-221 EU MAA');
    await waitFor(() => expect(maa.textContent).toContain('No sequence yet'));
    expect(maa.textContent).toContain('MAA');
    expect(maa.textContent).toContain('EU (EMA)');
    expect(maa.textContent).not.toContain('Cleared');
    await waitFor(() => expect(within(maa).getByTestId('market-support').textContent).toContain('the gateway is not connected'));

    // Each market's verdict is read from its own sequence; the MAA has none to read.
    expect(urls()).toContain(VERDICT);
    expect(urls().filter((u) => u.endsWith('/dispatch-readiness'))).toHaveLength(1);
  });

  it('a 500 on one verdict shows "No verdict" with a retry on that row only, never "Cleared", and keeps the other row', async () => {
    serve({ verdictFailures: 1 });
    await openSubmit();
    const ind = await marketRow('ONC-221 IND');
    await waitFor(() => expect(ind.textContent).toContain('No verdict'));
    expect(ind.textContent).not.toMatch(/Cleared/);
    const maa = await marketRow('ONC-221 EU MAA');
    await waitFor(() => expect(maa.textContent).toContain('No sequence yet'));
    expect(within(maa).queryByRole('button', { name: /Retry the verdict/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Retry the verdict/ })).toHaveLength(1);

    const retry = within(ind).getByRole('button', { name: /Retry the verdict/ });
    retry.focus();
    fireEvent.click(retry);
    // The Retry unmounts while the read runs; focus stays on the row's verdict, not <body>.
    expect(document.activeElement).toBe(within(ind).getByTestId('pj-market-verdict'));
    await waitFor(() => expect(ind.textContent).toContain('Dispatch blocked · 2 blockers'));
    expect(urls().filter((u) => u === VERDICT)).toHaveLength(2);
  });

  it('a sequence list with no body is "No verdict" with a retry, never "No sequence yet"', async () => {
    serve({ sequencesNoBody: true });
    await openSubmit();
    const ind = await marketRow('ONC-221 IND');
    await waitFor(() => expect(ind.textContent).toContain('No verdict · its sequences could not be read'));
    expect(ind.textContent).not.toContain('No sequence yet');
    expect(within(ind).getByRole('button', { name: /Retry the verdict/ })).toBeTruthy();
  });

});

describe('Submit — opening the Submission Center, and the list’s own states', () => {
  it('opening a row stashes the submission, its sequence and Validation when blocked, then opens the Submission Center', async () => {
    serve();
    await openSubmit();
    const ind = await marketRow('ONC-221 IND');
    await waitFor(() => expect(ind.textContent).toContain('Dispatch blocked · 2 blockers'));
    fireEvent.click(within(ind).getByRole('button', { name: /Open .* in the Submission Center/ }));
    expect(onNav).toHaveBeenLastCalledWith('submission-center');
    expect(consumeNavParams(resolveSurfaceIdForTarget('submission-center'))).toEqual({
      submissionId: '61', sequenceId: '905', ws: 'validation',
    });

    const maa = await marketRow('ONC-221 EU MAA');
    await waitFor(() => expect(maa.textContent).toContain('No sequence yet'));
    fireEvent.click(within(maa).getByRole('button', { name: /Open .* in the Submission Center/ }));
    expect(consumeNavParams(resolveSurfaceIdForTarget('submission-center'))).toEqual({ submissionId: '62', ws: 'sequences' });
  });

  it('"Add a market" opens the Submission Center on New submission; "Open Submission Center" on the list', async () => {
    serve();
    await openSubmit();
    const markets = await screen.findByTestId('pj-markets');
    await marketRow('ONC-221 IND');
    fireEvent.click(within(markets).getByRole('button', { name: /Add a market/ }));
    expect(onNav).toHaveBeenLastCalledWith('submission-center');
    expect(consumeNavParams(resolveSurfaceIdForTarget('submission-center'))).toEqual({ ws: 'portfolio', newSubmission: '1' });
    // "Open Submission Center" opens the project's submission list, and says no more than that.
    fireEvent.click(within(markets).getByRole('button', { name: /Open Submission Center/ }));
    expect(onNav).toHaveBeenLastCalledWith('submission-center');
    expect(consumeNavParams(resolveSurfaceIdForTarget('submission-center'))).toEqual({ ws: 'portfolio' });
  });

  it('a project with no submission says so in words and offers Add a market', async () => {
    serve({ subs: [] });
    await openSubmit();
    const markets = await screen.findByTestId('pj-markets');
    await waitFor(() => expect(markets.textContent).toContain('No market for this project yet'));
    expect(markets.textContent).toContain('Add a market to start one.');
    expect(within(markets).getByRole('button', { name: /Add a market/ })).toBeTruthy();
    expect(screen.queryByTestId('pj-submission')).toBeNull();
  });

  it('a 403 on the list is the person’s role, stated once, with no retry and no alert in the header', async () => {
    serve({ failList: 403 });
    await openSubmit();
    const markets = await screen.findByTestId('pj-markets');
    await waitFor(() => expect(within(markets).getByTestId('pj-markets-forbidden').textContent).toContain('Your role does not include reading submissions'));
    expect(markets.textContent).not.toContain("Couldn't load this project's markets");
    expect(within(markets).queryByRole('button', { name: 'Try again' })).toBeNull();
    const line = screen.getByTestId('pj-status-line');
    expect(line.textContent).not.toContain('Markets could not be read');
    expect(within(line).queryByRole('alert')).toBeNull();
    expect(within(line).queryByRole('button', { name: /Retry reading the markets/ })).toBeNull();
  });

  it('a failed list read is a failure with a retry, never "no market"', async () => {
    serve({ failList: true });
    await openSubmit();
    const markets = await screen.findByTestId('pj-markets');
    await waitFor(() => expect(markets.textContent).toContain("Couldn't load this project's markets"));
    expect(markets.textContent).not.toContain('No market for this project yet');
    serve();
    fireEvent.click(within(markets).getByRole('button', { name: 'Try again' }));
    expect(await marketRow('ONC-221 IND')).toBeTruthy();
  });
});

describe('the project header — each market’s verdict and the documents in review', () => {
  it('states both verdicts and the count in review, from the reads the tabs make (one board read)', async () => {
    serve();
    renderHome();
    const line = await screen.findByRole('group', { name: 'Where this filing stands' });
    expect(line).toBe(screen.getByTestId('pj-status-line'));
    await waitFor(() => expect(line.textContent).toContain('Dispatch blocked · 2 blockers'));
    expect(line.textContent).toContain('IND · FDA (US)');
    expect(line.textContent).toContain('MAA · EU (EMA)');
    expect(line.textContent).toContain('No sequence yet');
    // Two in review and one awaiting sign-off; the changes-requested and approved rows are not counted.
    await waitFor(() => expect(within(line).getByTestId('pj-status-reviews').textContent).toBe('3 documents in review'));

    // The Review tab shows the same board without reading it again.
    const tab = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Review'));
    fireEvent.click(tab as Element);
    expect(await screen.findByText('Protocol amendment 3')).toBeTruthy();
    expect(urls().filter((u) => u === BOARD)).toHaveLength(1);
    // And the Submit tab the same verdicts, without reading them again.
    const submit = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Submit'));
    fireEvent.click(submit as Element);
    const ind = await marketRow('ONC-221 IND');
    expect(ind.textContent).toContain('Dispatch blocked · 2 blockers');
    expect(urls().filter((u) => u === VERDICT)).toHaveLength(1);
  });

  it('a board of approved documents is not "in review"', async () => {
    serve({ board: ALL_APPROVED });
    renderHome();
    const line = await screen.findByTestId('pj-status-line');
    await waitFor(() => expect(within(line).getByTestId('pj-status-reviews').textContent).toBe('No document in review'));
  });

  it('a failed verdict is "No verdict" in the header too, never "Cleared"', async () => {
    serve({ verdictFailures: 1 });
    renderHome();
    const line = await screen.findByTestId('pj-status-line');
    await waitFor(() => expect(line.textContent).toContain('No verdict'));
    expect(line.textContent).not.toMatch(/Cleared/);
    expect(line.textContent).toContain('No sequence yet');
  });
});
