// @vitest-environment jsdom
/**
 * CmOverview — the section-approval table tells the signer what the approve
 * route and the export gate will refuse, and a failed register read is never
 * rendered as an empty register.
 *
 * ── Found live ────────────────────────────────────────────────────────────────
 * 21/21 sections approved, three of them compiled at 0% completeness with every
 * required input missing, and the Overview table showed key / path / state /
 * "Approve section" — no completeness anywhere. The signer approved content
 * that did not exist because nothing on the page said it did not.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 *   • every row shows the compiler's completeness, and an incomplete row names
 *     the missing inputs;
 *   • an incomplete section gets NO live "Approve section" — a disabled control
 *     whose title says why, plus a way to the build board where it is fixed;
 *   • a 409 from the approve route renders the server's own reason (which now
 *     also means "incomplete"), not a hard-coded contradiction sentence;
 *   • `meta.sectionsUnreadable` / `meta.portfolioUnreadable` render as failed
 *     reads — never as "No Module 3 sections yet" / "No submissions yet".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'lead@example.test', displayName: 'R. Lead' } }),
}));

import { CmOverview } from '../surfaces/CmcModule';

type CmWindow = { __cmSetTab?: (id: string) => void; C2C_PROJECT?: unknown };

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const PATHS: Record<string, string> = {
  '3.2.S.1': 'General Information', '3.2.P.1': 'Description and Composition', '3.2.P.5': 'Control of Drug Product',
  '3.2.P.6': 'Container Closure System', '3.2.P.8': 'Stability',
};
const section = (key: string, st: string, completeness: number | null, missingInputs: string[] = []) => ({
  key, path: PATHS[key], st, completeness, missingInputs,
});

const META = {
  projectId: 'P-1',
  portfolioProvisioned: true,
  spinePortfolioProvisioned: true,
  sectionsProvisioned: true,
  correspondenceProvisioned: true,
  correspondenceUnreadable: false,
  portfolioUnreadable: false,
  sectionsUnreadable: false,
  generatedAt: '2026-09-06T00:00:00.000Z',
};

/** A loaded board for project P-1: one submission, no open questions. */
const board = (overrides: Record<string, unknown> = {}) => ({
  portfolio: [{ sub: 'BLA 761234', product: 'Compound A', region: 'FDA', type: 'BLA', rpi: 82, ir: 0, source: 'rpi' }],
  sections: [],
  kpis: { submissions: 1, rpiAverage: 82, irOverdue: 0, sectionsApproved: 0, sectionsTotal: 0, readyPercent: 0 },
  correspondence: [],
  meta: META,
  ...overrides,
});

const BOARD = /^\/api\/cmc\/module3-board(\?projectId=P-1)?$/;
const APPROVE = /\/api\/cmc\/module3-os\/sections\/P-1\/[^/]+\/approve$/;

/** The board answers as given; the approve route answers with `approve`. */
function wire(boardData: unknown, approve?: () => Response) {
  apiRequest.mockImplementation(async (m: string, u: string) => {
    if (m === 'GET' && BOARD.test(u)) return res({ success: true, data: boardData });
    if (m === 'POST' && APPROVE.test(u)) return approve ? approve() : res({ success: true, versionNumber: 1 });
    return res({ success: true, data: [] });
  });
}

/** The approve POSTs the surface actually made. */
const approvePosts = () =>
  (apiRequest.mock.calls as Array<[string, string]>).filter((c) => c[0] === 'POST' && APPROVE.test(c[1]));

const row = (key: string) => screen.getByText(key, { selector: 'td' }).closest('tr') as HTMLElement;

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as CmWindow).C2C_PROJECT = { id: 'P-1' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as CmWindow).C2C_PROJECT;
  delete (window as unknown as CmWindow).__cmSetTab;
});

describe('CmOverview — completeness on the section-approval table', () => {
  it('shows each section\'s completeness, names the missing inputs, and withholds approval from an incomplete one', async () => {
    wire(board({
      sections: [
        section('3.2.S.1', 'draft', 100),
        section('3.2.P.6', 'draft', 0, ['containerClosureDescription', 'suitabilityJustification']),
        section('3.2.P.8', 'approved', 60, ['shelfLifeJustification']),
        section('3.2.P.1', 'draft', null),
      ],
    }));
    const setTab = vi.fn();
    (window as unknown as CmWindow).__cmSetTab = setTab;
    render(<CmOverview ask={vi.fn()} />);
    await screen.findByText('3.2.P.6', { selector: 'td' });

    // The incomplete draft: its score, its missing inputs, and no live approval.
    const p6 = row('3.2.P.6');
    expect(within(p6).getByText('0%')).toBeTruthy();
    expect(within(p6).getByText(/containerClosureDescription/)).toBeTruthy();
    expect(within(p6).getByText(/suitabilityJustification/)).toBeTruthy();
    const withheld = within(p6).getByRole('button', { name: /Approve section/ }) as HTMLButtonElement;
    expect(withheld.disabled).toBe(true);
    expect(withheld.title).toMatch(/0% complete/);
    expect(withheld.title).toMatch(/containerClosureDescription/);
    // …and the way to where it gets fixed.
    fireEvent.click(within(p6).getByRole('button', { name: /build board/i }));
    expect(setTab).toHaveBeenCalledWith('build');

    // The complete draft keeps its live control.
    const live = within(row('3.2.S.1')).getByRole('button', { name: /Approve section/ }) as HTMLButtonElement;
    expect(live.disabled).toBe(false);
    expect(within(row('3.2.S.1')).getByText('100%')).toBeTruthy();

    // An approval already on the ledger over an incomplete record is shown as
    // exactly that — approved AND incomplete — the state the export gate refuses.
    const p8 = row('3.2.P.8');
    expect(within(p8).getByText('60%')).toBeTruthy();
    expect(within(p8).getByText(/shelfLifeJustification/)).toBeTruthy();
    expect(within(p8).getByText('approved', { selector: '.rd-chip' })).toBeTruthy();
    expect(within(p8).getByText(/incomplete/i, { selector: '.rd-chip' })).toBeTruthy();

    // A record the compiler never scored is "not established", not a number —
    // and not approvable either (the gate reads it as incomplete).
    const p1 = row('3.2.P.1');
    expect(within(p1).getByText(/not established/i)).toBeTruthy();
    expect((within(p1).getByRole('button', { name: /Approve section/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a 409 shows the server\'s own reason — 409 no longer means only "contradictions"', async () => {
    const reason = '§3.2.P.5 is 40% complete and cannot be approved. Missing required inputs: acceptanceCriteria. Record them and recompile.';
    wire(board({ sections: [section('3.2.P.5', 'draft', 100)] }), () => res({ success: false, error: reason }, 409));
    render(<CmOverview ask={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Approve section/ }));
    fireEvent.change(screen.getByPlaceholderText('Reason for this approval...'), { target: { value: 'Reviewed against the CoA.' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter your password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign & approve/ }));

    const toast = await screen.findByText(/40% complete/);
    expect(toast.textContent).toContain('acceptanceCriteria');
    expect(screen.queryByText(/resolve the critical contradictions first/)).toBeNull();
    // The refusal was the server's: one POST went out, and nothing flipped locally.
    expect(approvePosts()).toHaveLength(1);
    expect(within(row('3.2.P.5')).getByText('draft', { selector: '.rd-chip' })).toBeTruthy();
  });
});

describe('CmOverview — a failed register read is an error, never an empty register', () => {
  it('sectionsUnreadable renders the failed-read copy and not "No Module 3 sections yet"', async () => {
    wire(board({ sections: [], meta: { ...META, sectionsProvisioned: false, sectionsUnreadable: true } }));
    render(<CmOverview ask={vi.fn()} />);
    await screen.findAllByText('BLA 761234');

    const alerts = screen.getAllByRole('alert');
    const failed = alerts.find((a) => /could not be read/i.test(a.textContent ?? ''));
    expect(failed, 'no failed-read alert rendered').toBeTruthy();
    expect(failed!.textContent).toMatch(/failed read, not an empty register/i);
    expect(screen.queryByText(/No Module 3 sections yet/)).toBeNull();
    expect(screen.queryByText(/No governed CMC sections have been authored/)).toBeNull();
    // The narrative does not reassure over a read that did not happen.
    expect(screen.queryByText(/building steadily/)).toBeNull();
  });

  it('portfolioUnreadable renders the failed-read copy and not "No submissions yet"', async () => {
    wire(board({
      portfolio: [],
      kpis: { submissions: 0, rpiAverage: null, irOverdue: 0, sectionsApproved: null, sectionsTotal: null, readyPercent: null },
      meta: { ...META, portfolioProvisioned: false, portfolioUnreadable: true },
    }));
    render(<CmOverview ask={vi.fn()} />);
    await screen.findAllByText(/could not be read/i);

    const failed = screen.getAllByRole('alert').find((a) => /could not be read/i.test(a.textContent ?? ''));
    expect(failed).toBeTruthy();
    expect(failed!.textContent).toMatch(/failed read, not an empty register/i);
    expect(screen.queryByText(/No submissions yet/)).toBeNull();
    expect(screen.queryByText(/No CMC submissions are in scope yet/)).toBeNull();
  });
});
