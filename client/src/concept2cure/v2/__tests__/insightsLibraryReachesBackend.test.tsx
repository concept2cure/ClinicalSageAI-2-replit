// @vitest-environment jsdom
/**
 * The reporting library reaches the routes that had no screen.
 *
 * ── WHAT THIS LOCKS ─────────────────────────────────────────────────────────
 * `shared/constants/ui-surface-registry.ui-v2.ts` records that the 2026-10-01
 * reporting review found the insights surface claiming all of /api/report-os
 * and /api/insights, which made 21 served routes reachable in production with
 * no screen calling them. The claim was narrowed to the four run routes the
 * canvas calls, with the note: "The rest stay unmapped, which production
 * refuses, until a screen needs one."
 *
 * Nothing then built the screens, and no test could notice: every reporting
 * suite drives the find box, and a route with no caller has no caller to
 * assert on. So this suite asserts the calls themselves — that opening a tab
 * actually reads the route, with the filters the route accepts — and the three
 * honesty rules the panels must not break:
 *
 *   1. a schedule describes persisted platform output without claiming email;
 *   2. a type no engine computes is never offered as a control, anywhere;
 *   3. a failed read renders as a failure, never as "none yet".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import { runsUrl } from '../surfaces/insightsLibraryModel';
import { readFailureOf } from '../surfaces/insightsLibraryShared';
import { RunsPanel } from '../surfaces/InsightsRunsPanel';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const boom = (status: number) => ({ ok: false, status, json: async () => ({ error: 'nope' }) }) as unknown as Response;

const OVERVIEW = {
  data: {
    organizationId: 1,
    tier: 'enterprise',
    segments: ['pharma'],
    reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: {
      projectId: 11, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null,
      readiness: 70, scope: 'project', scopeId: '11', agency: null, pdufa: null, criticalBlockerCount: 0,
    },
    portfolio: { programs: null },
  },
};

/** Two real run rows, shaped as GET /api/report-os/runs enriches them. */
const RUNS = [
  {
    id: 41, runUuid: 'aaaaaaaa-0000-4000-8000-000000000001', scopeType: 'project', scopeId: '11',
    reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest',
    status: 'final', confidence: 82, createdAt: '2026-10-02T09:00:00.000Z',
    completedAt: '2026-10-02T09:00:12.000Z', regionCode: 'US', agency: 'FDA',
  },
  {
    id: 42, runUuid: 'aaaaaaaa-0000-4000-8000-000000000002', scopeType: 'project', scopeId: '11',
    reportTypeId: 'etmf.completeness_pack', reportTypeLabel: 'eTMF Completeness & Gap Pack',
    status: 'partial', confidence: null, createdAt: '2026-10-03T09:00:00.000Z', completedAt: null,
  },
];

const SUBS = [
  {
    id: 7, reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '11',
    schedule: { cadence: 'weekly', hour: 8, minute: 0, dayOfWeek: 2 },
    recipients: [], format: 'pdf', channel: 'platform', persona: null, enabled: true,
    lastRunAt: '2026-10-06T08:00:00.000Z', nextRunAt: '2026-10-13T08:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
  },
];

const BUNDLES = [
  {
    bundleId: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Pre-approval inspection pack',
    createdAt: '2026-10-04T10:00:00.000Z', createdBy: 3, projectIds: [11], runIds: [41],
    items: [{
      runId: 41, runUuid: 'aaaaaaaa-0000-4000-8000-000000000001',
      reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest',
      scopeType: 'project', scopeId: '11', status: 'final', confidence: 82,
      createdAt: '2026-10-02T09:00:00.000Z',
    }],
  },
];

/** Routes this suite serves. Anything else answers an empty object, so a call
 *  to an unexpected route shows up as a missing assertion rather than a pass. */
function route(url: string): Response {
  if (url.includes('/api/insights-canvas/overview')) return ok(OVERVIEW);
  if (url.startsWith('/api/report-os/runs')) return ok({ data: RUNS });
  if (url.startsWith('/api/insights/subscriptions')) return ok({ data: SUBS });
  if (url.startsWith('/api/report-os/bundles')) return ok({ data: BUNDLES });
  return ok({});
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => route(url));
});
afterEach(() => cleanup());

async function renderCanvas() {
  render(
    <InsightsCanvas
      surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']}
      segment="pharma"
      onNav={() => {}}
    />,
  );
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

/** Click one of the artifact pane's tabs by its visible name. */
async function openTab(name: RegExp) {
  fireEvent.click(await screen.findByRole('tab', { name }));
}

const calls = (method: string, prefix: string) =>
  apiRequest.mock.calls.filter(([m, u]) => m === method && String(u).startsWith(prefix));

describe('the reporting library', () => {
  it('lands on the Report pane, so the surface a reader already knew is unchanged', async () => {
    await renderCanvas();
    expect(screen.getByRole('tab', { name: /Report$/ }).getAttribute('aria-selected')).toBe('true');
    // The landing pane's packs are still what the artifact pane shows.
    expect(document.querySelector('.rc-empty')).not.toBeNull();
    // And nothing has been read from the library's routes yet.
    expect(calls('GET', '/api/insights/subscriptions')).toHaveLength(0);
  });

  it('offers a tab for each route family that had no screen', async () => {
    await renderCanvas();
    for (const name of [/Report catalog/, /Run history/, /Schedules/, /Bundles/]) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
  });
});

describe('Run history — GET /api/report-os/runs', () => {
  it('reads the route and renders the governed runs it returns', async () => {
    await renderCanvas();
    await openTab(/Run history/);
    await waitFor(() => expect(calls('GET', '/api/report-os/runs').length).toBeGreaterThan(0));
    // Scoped to the table: the left pane's opener names report types too, so a
    // bare text query would pass without the history having rendered at all.
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Executive Readiness Digest')).toBeTruthy();
    expect(within(table).getByText('eTMF Completeness & Gap Pack')).toBeTruthy();
    /* "Final" and not "Final — sealed": this table never reads /runs/:id/seal,
       so calling a row sealed would assert a verification this screen has not
       performed. The run's evidence disclosure is where the seal is checked. */
    expect(within(table).getByText('Final')).toBeTruthy();
    expect(table.textContent ?? '').not.toMatch(/Final — sealed/);
  });

  it('a run with no measured confidence says so, and never reads as 0%', async () => {
    await renderCanvas();
    await openTab(/Run history/);
    // etmf.completeness_pack is a domain register: nothing measures a
    // confidence for one (report-engine.ts), so its cell must say that.
    expect(await screen.findByText('Not measured')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('sends the status filter the route accepts', async () => {
    await renderCanvas();
    await openTab(/Run history/);
    await screen.findByText('Executive Readiness Digest');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'final' } });
    await waitFor(() =>
      expect(calls('GET', '/api/report-os/runs').some(([, u]) => String(u).includes('status=final'))).toBe(true),
    );
  });

  it('a failed read is a failure with a retry, not an empty history', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.startsWith('/api/report-os/runs') ? boom(500) : route(url),
    );
    await renderCanvas();
    await openTab(/Run history/);
    expect(await screen.findByTestId('rl-runs-error')).toBeTruthy();
    expect(screen.queryByTestId('rl-runs-empty')).toBeNull();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy();
  });

  it('opens a run from the history through GET /runs/:id/rendered', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/report-os/runs/41/rendered') {
        return ok({
          data: {
            reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '11',
            scopeLabel: 'BX204', status: 'final', generatedAt: '2026-10-02T09:00:12.000Z',
            sections: [{ id: 's1', title: 'Readiness', blocks: [] }],
          },
        });
      }
      return route(url);
    });
    await renderCanvas();
    await openTab(/Run history/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0]);
    await waitFor(() =>
      expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === '/api/report-os/runs/41/rendered')).toBe(true),
    );
  });

  it("a sealed run whose seal no longer verifies is withheld with its reason, not shown", async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/report-os/runs/41/rendered') {
        const err = Object.assign(new Error('conflict'), {
          name: 'ApiRequestError', status: 409, payload: { error: 'seal mismatch' },
        });
        throw err;
      }
      return route(url);
    });
    await renderCanvas();
    await openTab(/Run history/);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0]);
    expect(await screen.findByText(/seal no longer verifies/)).toBeTruthy();
  });
});

describe('Schedules — GET/POST/PATCH /api/insights/subscriptions', () => {
  it('reads the route and renders the schedule in words', async () => {
    await renderCanvas();
    await openTab(/Schedules/);
    await waitFor(() => expect(calls('GET', '/api/insights/subscriptions').length).toBeGreaterThan(0));
    expect(await screen.findByText('Every week on Tuesday at 08:00 UTC')).toBeTruthy();
  });

  it('describes persisted platform output and does not promise external email', async () => {
    await renderCanvas();
    await openTab(/Schedules/);
    const note = await screen.findByTestId('rl-schedule-truth');
    expect(note.textContent).toMatch(/saves a governed report/);
    expect(note.textContent).toMatch(/platform inbox/);
    expect(note.textContent).toMatch(/External email delivery is unavailable/);
    // The words that would be the false claim.
    const pane = document.querySelector('.rc-canvas')!;
    expect(pane.textContent).not.toMatch(/sent to your inbox|emailed to|delivered to your/i);
  });

  it('offers only report types an engine computes — scheduling the rest would never produce one', async () => {
    await renderCanvas();
    await openTab(/Schedules/);
    fireEvent.click(await screen.findByRole('button', { name: /New schedule/ }));
    const select = await screen.findByLabelText('Report');
    const offered = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(offered).toContain('Executive Readiness Digest');
    // The regional engine computes this one over a program, so a schedule for
    // it does produce a report (regional/filing-readiness.ts).
    expect(offered).toContain('EMA MAA Readiness Assessment');
    // runnable: false in the catalog fixture — no engine computes these.
    expect(offered).not.toContain('Compliance & Audit Assurance Pack');
    expect(offered).not.toContain('FDA eSTAR / 510(k) Equivalence Matrix');
    expect(offered).not.toContain('Evidence & Provenance Trace Report');
  });

  it('creates a schedule with the cadence chosen, and no creator in the body', async () => {
    await renderCanvas();
    await openTab(/Schedules/);
    fireEvent.click(await screen.findByRole('button', { name: /New schedule/ }));
    fireEvent.change(await screen.findByLabelText('Report'), { target: { value: 'readiness.executive_digest' } });
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'monthly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => expect(calls('POST', '/api/insights/subscriptions').length).toBe(1));
    const [, , body] = calls('POST', '/api/insights/subscriptions')[0];
    expect(body).toMatchObject({
      reportTypeId: 'readiness.executive_digest',
      scopeType: 'project',
      scopeId: '11',
      schedule: { cadence: 'monthly' },
    });
    // The creator is bound from the session server-side (reporting review
    // 2026-10-01, DP-59): sending one would reintroduce the finding.
    expect(body).not.toHaveProperty('createdBy');
    expect(body).not.toHaveProperty('organizationId');
  });

  it('pauses a schedule through PATCH, and says so when the server refuses', async () => {
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (m === 'PATCH' && url.startsWith('/api/insights/subscriptions/')) {
        const err = Object.assign(new Error('forbidden'), {
          name: 'ApiRequestError', status: 403, payload: { error: 'Editor role required' },
        });
        throw err;
      }
      return route(url);
    });
    await renderCanvas();
    await openTab(/Schedules/);
    fireEvent.click(await screen.findByRole('button', { name: /Pause/ }));
    await waitFor(() => expect(calls('PATCH', '/api/insights/subscriptions/7').length).toBe(1));
    expect((await screen.findByRole('alert')).textContent ?? '').toMatch(/Editor role required/);
  });

  it('a failed read is a failure, not "no scheduled reports"', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.startsWith('/api/insights/subscriptions') ? boom(500) : route(url),
    );
    await renderCanvas();
    await openTab(/Schedules/);
    expect(await screen.findByTestId('rl-schedules-error')).toBeTruthy();
    expect(screen.queryByTestId('rl-schedules-empty')).toBeNull();
  });
});

describe('Bundles — GET/POST /api/report-os/bundles', () => {
  it('reads the route and renders each bundle with its reports', async () => {
    await renderCanvas();
    await openTab(/Bundles/);
    await waitFor(() => expect(calls('GET', '/api/report-os/bundles').length).toBeGreaterThan(0));
    expect(await screen.findByText('Pre-approval inspection pack')).toBeTruthy();
  });

  it('bundles the runs chosen in Run history, and posts their ids', async () => {
    await renderCanvas();
    await openTab(/Run history/);
    const boxes = await screen.findAllByRole('checkbox');
    fireEvent.click(boxes[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Bundle 1 report/ }));

    fireEvent.change(await screen.findByLabelText('Bundle name'), { target: { value: 'PAI pack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));

    await waitFor(() => expect(calls('POST', '/api/report-os/bundles').length).toBe(1));
    const [, , body] = calls('POST', '/api/report-os/bundles')[0];
    expect(body).toMatchObject({ name: 'PAI pack', runIds: [41] });
  });

  it('a bundle whose runs belong to no project says why, rather than failing blankly', async () => {
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (m === 'POST' && url === '/api/report-os/bundles') {
        const err = Object.assign(new Error('unprocessable'), {
          name: 'ApiRequestError', status: 422,
          payload: { error: 'None of these runs belongs to a project, so the bundle has nowhere to be stored.' },
        });
        throw err;
      }
      return route(url);
    });
    await renderCanvas();
    await openTab(/Run history/);
    fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Bundle 1 report/ }));
    fireEvent.change(await screen.findByLabelText('Bundle name'), { target: { value: 'PAI pack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create bundle' }));
    expect((await screen.findByRole('alert')).textContent ?? '').toMatch(/nowhere to be stored|belongs to no project/i);
  });
});

describe('Report catalog', () => {
  it('offers every type an engine computes as a run control', async () => {
    await renderCanvas();
    await openTab(/Report catalog/);
    const runnable = CANVAS_REPORT_TYPES.filter((t) => t.runnable);
    expect(runnable.length).toBeGreaterThan(5);
    for (const t of runnable.slice(0, 6)) {
      expect(await screen.findByText(t.label)).toBeTruthy();
    }
    expect((await screen.findAllByRole('button', { name: /Run/ })).length).toBeGreaterThanOrEqual(6);
  });

  it('lists a type no engine computes by name, and never as a control', async () => {
    await renderCanvas();
    await openTab(/Report catalog/);
    const notComputed = await screen.findByTestId('rl-not-computed');
    // The fixture's un-runnable types appear here...
    expect(notComputed.textContent).toMatch(/Compliance & Audit Assurance Pack/);
    // ...and nowhere as something a reader can press, which is how the
    // readiness digest came to be served under another report's title
    // (QA 2026-10-08, j8).
    expect(
      within(notComputed).queryAllByRole('button'),
      'a not-computed type must never be a control',
    ).toHaveLength(0);
  });

  it('runs a catalog type through the governed run route', async () => {
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (m === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 99 } } });
      if (url === '/api/report-os/runs/99/rendered') {
        return ok({
          data: {
            reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '11',
            status: 'partial', sections: [{ id: 's1', title: 'Readiness', blocks: [] }],
          },
        });
      }
      return route(url);
    });
    await renderCanvas();
    await openTab(/Report catalog/);
    fireEvent.click((await screen.findAllByRole('button', { name: /Run/ }))[0]);
    await waitFor(() => expect(calls('POST', '/api/report-os/runs').length).toBe(1));
  });
});

describe('run history uses the complete SQL result before pagination', () => {
  it('requests a page and sends the search to the canonical route', async () => {
    await renderCanvas();
    await openTab(/Run history/);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'etmf' } });
    await waitFor(() => expect(calls('GET', '/api/report-os/runs').some(([, url]) => String(url).includes('search=etmf') && String(url).includes('limit=50') && String(url).includes('offset=0'))).toBe(true));
  });

  it('shows the server total and reaches older matching reports on the next page', async () => {
    apiRequest.mockImplementation(async (_method, url) => ok({ data: RUNS, meta: { total: 52, limit: 50, offset: String(url).includes('offset=50') ? 50 : 0, hasMore: !String(url).includes('offset=50') } }));
    render(<RunsPanel types={[]} onOpen={() => {}} onBundle={() => {}} canBundle={false} />);
    expect(await screen.findByText(/52 matching reports/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(calls('GET', '/api/report-os/runs').some(([, url]) => String(url).includes('offset=50'))).toBe(true));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'older' } });
    await waitFor(() => expect(calls('GET', '/api/report-os/runs').at(-1)?.[1]).toContain('offset=0'));
  });

  it('does not imply a complete result when an older server omits pagination metadata', async () => {
    apiRequest.mockImplementation(async () => ok({ data: RUNS }));
    render(<RunsPanel types={[]} onOpen={() => {}} onBundle={() => {}} canBundle={false} />);
    expect(await screen.findByText(/This list may be incomplete/)).toBeTruthy();
  });

  it('encodes scope, search and offset without dropping a zero offset', () => {
    const url = runsUrl({ scopeType: 'project', scopeId: '11', search: ' older run ', offset: 0, limit: 50 });
    expect(new URLSearchParams(url.split('?')[1]).get('search')).toBe('older run');
    expect(url).toContain('offset=0');
    expect(url).toContain('scopeId=11');
  });
});

describe("a bundle's PDF is named for what it is", () => {
  /* pdf/bundle-pdf.ts prints ONE LINE per report and says so in the document:
     "Each report's own PDF carries its signature and seal." Offering it as the
     reports themselves would hand an inspector an index where they expected
     the evidence. */

  it('says the PDF is a manifest and where the sealed documents are', async () => {
    await renderCanvas();
    await openTab(/Bundles/);
    const note = await screen.findByTestId('rl-bundle-manifest-note');
    expect(note.textContent ?? '').toMatch(/manifest/);
    expect(note.textContent ?? '').toMatch(/does not contain the reports themselves/);
    expect(note.textContent ?? '').toMatch(/exported from Run history/);
  });

  it('never offers the manifest as the reports', async () => {
    await renderCanvas();
    await openTab(/Bundles/);
    await screen.findByText('Pre-approval inspection pack');
    const pane = document.querySelector('.rc-canvas')!;
    expect(pane.textContent ?? '').not.toMatch(/download all reports|all reports as one|the reports as one PDF/i);
    expect(screen.getByRole('button', { name: /Export manifest PDF/ })).toBeTruthy();
  });
});

describe('a failed read says WHICH failure it was', () => {
  /* `useLiveData` reports the HTTP status and none of these reads consulted it,
     so a 403 from the tenant guard and an expired session both rendered as an
     outage with a Try again that cannot succeed. A reader clicks it, it fails
     identically, and nothing tells them to sign in or that their role is the
     reason. */

  const refused = (status: number) =>
    ({ ok: false, status, json: async () => ({ error: 'no' }) }) as unknown as Response;

  it('a 403 on the run history is a role refusal with NO retry', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.startsWith('/api/report-os/runs') ? refused(403) : route(url),
    );
    await renderCanvas();
    await openTab(/Run history/);
    const err = await screen.findByTestId('rl-runs-error');
    expect(err.textContent ?? '').toMatch(/do not have access/);
    expect(err.textContent ?? '').toMatch(/retrying will not change the answer/);
    // The defect: a retry that cannot succeed.
    expect(within(err).queryByRole('button', { name: /Try again/i })).toBeNull();
  });

  it('an expired session says to sign in, not that the server failed', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.startsWith('/api/insights/subscriptions') ? refused(401) : route(url),
    );
    await renderCanvas();
    await openTab(/Schedules/);
    const err = await screen.findByTestId('rl-schedules-error');
    expect(err.textContent ?? '').toMatch(/session has expired/);
    expect(within(err).queryByRole('button', { name: /Try again/i })).toBeNull();
  });

  it('a 500 keeps the retry, because retrying could change the answer', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.startsWith('/api/report-os/bundles') ? refused(500) : route(url),
    );
    await renderCanvas();
    await openTab(/Bundles/);
    const err = await screen.findByTestId('rl-bundles-error');
    expect(within(err).getByRole('button', { name: /Try again/i })).toBeTruthy();
  });

  it('readFailureOf classifies each status, and only the reachable ones retry', () => {
    expect(readFailureOf({ error: 'e', status: 401 }, 'x').retryable).toBe(false);
    expect(readFailureOf({ error: 'e', status: 403 }, 'x').retryable).toBe(false);
    expect(readFailureOf({ error: 'e', status: 404 }, 'x').retryable).toBe(false);
    expect(readFailureOf({ error: 'e', status: 500 }, 'x').retryable).toBe(true);
    // status 0 is the one case a retry is actually for: nothing reached the server.
    const unreached = readFailureOf({ error: 'e', status: 0 }, 'x');
    expect(unreached.retryable).toBe(true);
    expect(unreached.message).toMatch(/did not reach the server/);
  });
});
