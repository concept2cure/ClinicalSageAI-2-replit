// @vitest-environment jsdom
/**
 * Reporting has a "Find a report" field, not a chat look-alike
 * (docs/design/FILING_SPINE.md §7.2 F6; §6 row 9).
 *
 * ── What was shipping ─────────────────────────────────────────────────────────
 * The left column of Reporting & analytics was built as a conversation: a
 * composer with an arrow "Send" button, the person's words echoed back in a
 * right-aligned bubble, an answer in a left-aligned bubble beside AnA's mark
 * (the blue asterisk), and three pulsing dots while it "typed"
 * (Insights.tsx:1334 at b0b1694aa). What answered was `roRouteReply` (:492), a
 * fixed router over the constants in that file. The persona's name had already
 * been taken off (insightsNotAna.test.tsx); the shape of a conversation stayed.
 *
 * There is one AnA, and it is the conversation. Nothing else on screen may look
 * like talking to her, because a person reading a bubble beside her mark
 * credits the answer to her.
 *
 * ── What this holds ───────────────────────────────────────────────────────────
 * The router stays: it finds the governed report type that matches the words
 * and runs it, which is the right mechanism. It is presented as what it is, a
 * search field labelled "Find a report" with a "Find" button. The answer is one
 * result that the next search replaces, and the words searched for stay in the
 * field, as they do in any search. No AnA mark, no bubbles, no typing dots.
 *
 * One result has no "before" and "after" the way a thread did, so what it says
 * must stay true: a run that ends, or never starts, does not leave "Running the
 * …" on screen beside the alert that says it wasn't run. And its live region is
 * mounted before the first search, so the first result is announced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const auth = vi.hoisted(() => ({ user: null as null | { id: number; permissions: string[] } }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { InsightsCanvas } from '../surfaces/Insights';
// The catalog the overview answers with: the canvas holds no copy of its own
// since 4ac15bdd1 (each report type is computed by its own engine or refused).
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const OVERVIEW = {
  data: {
    organizationId: 1, tier: 'standard', segments: ['biotech'], reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: { projectId: 1, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null, readiness: 73, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0 },
    portfolio: { programs: null },
  },
};

/** Elements that render a conversation: bubbles, message rows, typing dots. */
const CHAT_SHAPES = '.rc-bub, .rc-ana-bub, .rc-msg, .rc-user, .rc-ana-msg, .rc-typing';
/** AnA's mark, as this pane drew it. */
const ANA_MARKS = '.rc-ana-mark, .rc-empty-mark';

/** Any element whose own text is the bare asterisk the mark was drawn with. */
function bareAsterisks(): Element[] {
  return Array.from(document.querySelectorAll('body *')).filter(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim() === '*',
  );
}

const EDITOR = { id: 3, permissions: ['governed:write'] };
const VIEWER = { id: 2, permissions: [] as string[] };
const RENDERED = { status: 'partial', sections: [{ id: 's1', title: 'Readiness', blocks: [] }] };

let runs: Array<(r: Response) => void> = [];
beforeEach(() => {
  runs = [];
  auth.user = EDITOR;
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string, url: string) => {
    if (String(url).includes('/api/insights-canvas/overview')) return Promise.resolve(ok(OVERVIEW));
    // A run is held open until the test releases it, so the busy state can be read.
    if (method === 'POST' && url === '/api/report-os/runs') return new Promise<Response>((resolve) => runs.push(resolve));
    if (method === 'GET' && url === '/api/report-os/runs/41/rendered') return Promise.resolve(ok({ data: RENDERED }));
    return Promise.resolve(ok({}));
  });
});

/** The result's live region: the one status region that is not the busy line. */
const resultStatus = () => screen.getByTestId('rc-find-result').querySelector('[role="status"]');
afterEach(() => cleanup());

/** The pane's one text field, found by role alone so each test below fails on
 *  what it checks, not on the label the first test checks. */
async function renderCanvas() {
  render(<InsightsCanvas {...PROPS} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
  return screen.getByRole('textbox');
}

/** Enter submits in both the old composer and the field. */
function find(field: HTMLElement, words: string) {
  fireEvent.change(field, { target: { value: words } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

describe('Reporting: "Find a report"', () => {
  it('is a labelled field with a Find button, not a composer that sends', async () => {
    const field = await renderCanvas();
    expect(screen.getByRole('textbox', { name: 'Find a report' })).toBe(field);
    expect(screen.queryByLabelText('Send')).toBeNull();
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull();

    // The button does what Enter does.
    const findButton = screen.getByRole('button', { name: 'Find' });
    expect((findButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'something about the weather' } });
    fireEvent.click(findButton);
    await screen.findByText(/any of these can be run/);
  });

  it('carries no AnA mark anywhere on the screen', async () => {
    await renderCanvas();
    expect(document.querySelectorAll(ANA_MARKS)).toHaveLength(0);
    expect(bareAsterisks()).toEqual([]);
  });

  it('answers with one result, never a conversation, and keeps the words in the field', async () => {
    const field = await renderCanvas();

    find(field, 'something about the weather');
    await screen.findByText(/any of these can be run/);
    expect(document.querySelectorAll(CHAT_SHAPES)).toHaveLength(0);
    // A search keeps what was searched for; a chat composer clears itself.
    expect((field as HTMLTextAreaElement).value).toBe('something about the weather');
    // The words are not echoed back as a message.
    expect(screen.getAllByText('something about the weather', { exact: false }).every((el) => el === field)).toBe(true);
    // The router's choices are offered as buttons inside the result.
    expect(screen.getByRole('button', { name: 'Executive Readiness Digest' })).toBeTruthy();

    // The next search replaces the result: one result, not a growing thread.
    find(field, 'forecast the approval');
    await screen.findByText(/Forecasts and CRL\/RTF pre-mortems are not part of this release/);
    expect(screen.queryByText(/any of these can be run/)).toBeNull();
    expect(screen.getAllByRole('region', { name: 'Result' })).toHaveLength(1);
    expect(document.querySelectorAll(CHAT_SHAPES)).toHaveLength(0);
    expect(document.querySelectorAll(ANA_MARKS)).toHaveLength(0);
  });

  it('still runs the governed report the router matched, with a plain status while it runs', async () => {
    const field = await renderCanvas();
    find(field, 'Run the executive readiness digest report');

    // roRouteReply resolved a type; the REAL run was requested.
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/report-os/runs', expect.objectContaining({ reportTypeId: 'readiness.executive_digest' }));

    // While it runs: a sentence in a status region, not typing dots by a mark.
    const busy = await screen.findByText(/Running the report/);
    expect(busy.closest('[role="status"]')).not.toBeNull();
    expect(document.querySelectorAll(CHAT_SHAPES)).toHaveLength(0);
    expect(document.querySelectorAll(ANA_MARKS)).toHaveLength(0);

    // A refusal from the engine is stated, as a result, not as a reply bubble.
    runs[0]({ ok: false, status: 403, json: async () => ({ error: 'Not entitled' }) } as unknown as Response);
    await waitFor(() => expect(screen.queryByText(/Running the report/)).toBeNull());
    expect(document.querySelectorAll(CHAT_SHAPES)).toHaveLength(0);
    // The result no longer says the run is going on; the alert says why it did not.
    expect(screen.getByRole('alert').textContent).toMatch(/"Executive Readiness Digest" wasn't run/);
    expect(document.body.textContent).not.toMatch(/Running the /);
  });

  it('a run that cannot start never leaves "Running the …" beside the alert that says so', async () => {
    auth.user = VIEWER;
    const field = await renderCanvas();
    find(field, 'Run the executive readiness digest report');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/"Executive Readiness Digest" wasn't run/);
    expect(runs).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Running the /);
  });

  it('a run that completes says so, in place of "Running the …"', async () => {
    const field = await renderCanvas();
    find(field, 'Run the executive readiness digest report');
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(resultStatus()?.textContent).toMatch(/^Running the Executive Readiness Digest for BX204/);

    runs[0](ok({ data: { run: { id: 41 } } }));
    await waitFor(() => expect(resultStatus()?.textContent).toMatch(/^The Executive Readiness Digest for BX204 ran against the governed record and is shown in the report canvas\./));
    expect(document.body.textContent).not.toMatch(/Running the /);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("keeps the result's live region mounted from the start, so the first result is announced", async () => {
    const field = await renderCanvas();
    const region = resultStatus();
    expect(region, 'no live region before the first search').not.toBeNull();
    expect(region!.textContent).toBe('');
    expect(screen.queryByRole('region', { name: 'Result' })).toBeNull();

    find(field, 'something about the weather');
    await screen.findByText(/any of these can be run/);
    // The same element took the text: it was not inserted holding it.
    expect(resultStatus()).toBe(region);
    expect(region!.textContent).toMatch(/any of these can be run/);
    expect(screen.getByRole('region', { name: 'Result' })).toBeTruthy();
  });
});
