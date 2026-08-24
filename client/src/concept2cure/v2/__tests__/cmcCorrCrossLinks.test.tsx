// @vitest-environment jsdom
/**
 * Correspondence cross-links in the CMC module, at render level.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * Open agency questions live on the Program records tab, but the two places a
 * CMC lead actually meets them are elsewhere: the Overview's IR-overdue count,
 * and the change simulator — where implementing a change that refiles a section
 * the agency is already asking about is a decision, not an accident. Neither
 * place offered a way through to the record.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 *   • a POSITIVE IR-overdue count on the Overview is a real button that jumps
 *     to Program records via the module's __cmSetTab idiom;
 *   • a ZERO count is a plain figure — no button role, no dead-end click;
 *   • a simulated change whose type maps onto a cited section renders the
 *     correspondence signpost (the same CmCorrNotice the Specifications and
 *     Stability tabs use) naming that section;
 *   • questions citing UNRELATED sections render nothing — presence is
 *     asserted, absence never is.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'lead@example.test', displayName: 'R. Lead' } }),
}));

import { CmOverview, CmChange } from '../surfaces/CmcModule';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

/** Every call the surfaces made, as [method, url, body] triples. */
const calls = () => apiRequest.mock.calls as Array<[string, string, unknown?]>;
const boardReads = () =>
  calls().filter((c) => c[0] === 'GET' && c[1] === '/api/cmc/module3-board');

/** One open agency question citing the given section. */
const question = (sectionRef: string) => ({
  id: 1,
  question: 'Please justify the proposed change and provide comparability data for the affected material.',
  sectionRef,
  priority: 'high',
  severity: 'major',
  status: 'open',
  region: 'FDA',
  dueDate: '2026-09-01',
  overdue: true,
  assignedTo: null,
});

/** A live board with one submission, the given IR count, and the given questions. */
const board = (irOverdue: number, correspondence: unknown[] = []) => ({
  portfolio: [{ sub: 'BLA 761234', product: 'Compound A', region: 'FDA', type: 'BLA', rpi: 82, ir: irOverdue, source: 'rpi' }],
  sections: null,
  kpis: { submissions: 1, rpiAverage: 82, irOverdue, sectionsApproved: null, sectionsTotal: null, readyPercent: null },
  correspondence,
  meta: { projectId: null, portfolioProvisioned: true, sectionsProvisioned: null, generatedAt: '2026-08-24T00:00:00.000Z' },
});

/** The board answers as given; every other register read is honestly empty. */
function wire(boardData: unknown) {
  apiRequest.mockImplementation(async (m: string, u: string) => {
    if (m === 'GET' && u === '/api/cmc/module3-board') return res({ success: true, data: boardData });
    return res({ success: true, data: [] });
  });
}

type CmWindow = { __cmSetTab?: (id: string) => void };

beforeEach(() => apiRequest.mockReset());
afterEach(() => {
  cleanup();
  delete (window as unknown as CmWindow).__cmSetTab;
});

/* ══════════════════ Overview — the IR-overdue tile ══════════════════ */

describe('CmOverview — the IR-overdue KPI deep-links to the correspondence', () => {
  it('a positive count is a button that jumps to Program records', async () => {
    wire(board(3));
    const setTab = vi.fn();
    (window as unknown as CmWindow).__cmSetTab = setTab;
    render(<CmOverview ask={vi.fn()} />);

    const kpi = await screen.findByRole('button', { name: /IR overdue/ });
    // The affordance says where it goes, not just that it goes.
    expect(kpi.getAttribute('title')).toMatch(/agency correspondence/i);
    expect(within(kpi).getByText('3')).toBeTruthy();

    fireEvent.click(kpi);
    expect(setTab).toHaveBeenCalledWith('pathway');
  });

  it('a zero count is a plain figure — no button role, no dead-end click', async () => {
    wire(board(0));
    render(<CmOverview ask={vi.fn()} />);
    // The board has loaded — the submission is on screen (the answer lead
    // names it too, so the match is deliberately plural).
    await screen.findAllByText('BLA 761234');

    // The tile is there, as a figure…
    const label = screen.getByText('IR overdue', { selector: '.reg-kpi-l' });
    // …but not as a control, and not merely a button with no handler.
    expect(screen.queryByRole('button', { name: /IR overdue/ })).toBeNull();
    expect(label.closest('button')).toBeNull();
  });
});

/* ══════════════════ Change simulator — collision signpost ══════════════════ */

/** Drive the simulator: describe the change, keep the preselected markets, run. */
function simulate(desc: string) {
  fireEvent.change(
    screen.getByPlaceholderText(/switch the drug-substance supplier/),
    { target: { value: desc } },
  );
  fireEvent.click(screen.getByRole('button', { name: /Simulate change/ }));
}

describe('CmChange — a simulated change collides with open agency questions', () => {
  it('flags a change whose sections an open question cites, naming the section', async () => {
    // The default change type is api_supplier_change → §3.2.S.2, and the open
    // question cites §3.2.S.2.2 — a prefix match, exactly the collision a
    // regulatory lead must see before implementing.
    wire(board(0, [question('3.2.S.2.2')]));
    render(<CmChange ask={vi.fn()} />);
    simulate('Switch the drug-substance supplier from A to B; comparable process, new site');

    const notice = await screen.findByTestId('cmc-corr-notice');
    expect(within(notice).getByText(/3\.2\.S\.2\.2/)).toBeTruthy();
    expect(within(notice).getByText(/the sections this change refiles/)).toBeTruthy();
    // The signpost's jump goes to the record of truth.
    const setTab = vi.fn();
    (window as unknown as CmWindow).__cmSetTab = setTab;
    fireEvent.click(within(notice).getByRole('button', { name: /Open correspondence/ }));
    expect(setTab).toHaveBeenCalledWith('pathway');
  });

  it('stays silent when the open questions cite unrelated sections', async () => {
    // Same simulated change, but the only open question is about container
    // closure (§3.2.P.7) — no section this change refiles.
    wire(board(0, [question('3.2.P.7')]));
    render(<CmChange ask={vi.fn()} />);
    simulate('Switch the drug-substance supplier from A to B');

    // The assessment itself rendered…
    await screen.findByText('Regulatory Change Impact Assessment', { selector: '.cm-doc-kind' });
    // …and the signpost DID read the board (so the silence below is a filtered
    // result, not an unresolved fetch)…
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(0));
    await act(async () => {});
    // …and stayed silent: presence is asserted, absence never is.
    expect(screen.queryByTestId('cmc-corr-notice')).toBeNull();
  });
});
