// @vitest-environment jsdom
/**
 * IndLifecycle — opened on the submission it was sent, and no button that only
 * sends AnA a sentence while its label says the work happened (audit
 * 2026-10-17).
 *
 * 1. Submission Center's "Forms and letters (1571, cover letter, LOA)" hands
 *    over { submissionId } through navParams. The screen opens that
 *    submission's IND checklist; a submission with no checklist says so and
 *    never shows another IND in its place.
 *
 * 2. The buttons that only called ask(...): "Resolve the top blocker",
 *    "Resolve" on each blocker and "Ask AnA to draft this" on the readiness
 *    report claimed work nothing performs (no route resolves a blocker or
 *    renders that report; the report is the server's verdict, already on
 *    screen). Each deliverable card's "Ask AnA" sat beside the deterministic
 *    "Assemble now" and asked AnA to "assemble" the same document. Now: a
 *    blocker offers "Ask AnA how to clear it" (a question, said as one); the
 *    readiness report has no AnA button; an AnA-draftable card offers "Draft
 *    with AnA", whose prompt asks for a draft in the editor; a card that is not
 *    AnA-draftable (LOA, right of reference) offers no AnA button.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { IndLifecycle } from '../surfaces/IndLifecycle';
import { stashNavParamsForTarget } from '../navParams';

const READINESS = {
  filingType: 'initial',
  ready: false,
  overallPercentage: 40,
  moduleProgress: [],
  requiredSections: { total: 2, completed: 1, incomplete: [] },
  forms: { required: ['FDA_1571'], completed: [], missing: ['FDA_1571'] },
  blockers: [{ kind: 'required_form', code: 'FDA_1571', message: 'Form FDA 1571 is not complete.' }],
  warnings: [],
};
const row = (over: Record<string, unknown>) => ({
  submissionId: 31, programId: null, code: 'ZX-9', drugName: 'Zexanib', productName: 'ZX-9 First-in-Human', indication: null,
  sponsorName: 'Acme Bio', submissionType: 'IND', targetReceiptDate: null, forms: [], sections: [], readiness: READINESS, ...over,
});
const ROWS = [row({}), row({ submissionId: 32, code: 'QY-2', drugName: 'Quyorant', productName: 'QY-2 Phase 1' })];

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;

afterEach(cleanup);
beforeEach(() => {
  delete (window as any).C2C_NAV_PARAMS;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') return { ok: true, status: 200, json: async () => ({ data: ROWS }) } as Response;
    if (method === 'GET' && url === '/api/ind-forms/') return { ok: true, status: 200, json: async () => ({ forms: [] }) } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
});

describe('IndLifecycle — opened on the submission it was sent', () => {
  it('opens the named submission’s IND, not the organisation’s first', async () => {
    stashNavParamsForTarget('ind-checklist', { submissionId: '32' });
    render(<IndLifecycle {...props()} />);
    expect(await screen.findByRole('heading', { name: /Quyorant — Initial IND/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Zexanib/ })).toBeNull();
  });

  it('a named submission with no IND checklist says so, and shows no other IND in its place', async () => {
    stashNavParamsForTarget('ind-checklist', { submissionId: '99' });
    render(<IndLifecycle {...props()} />);
    expect(await screen.findByText(/The submission you opened this from has no IND checklist/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Zexanib|Quyorant/ })).toBeNull();
  });
});

describe('IndLifecycle — no button claims work that nothing performs', () => {
  it('blockers offer a question to AnA, said as one; nothing reads "Resolve"', async () => {
    const p = props();
    render(<IndLifecycle {...p} />);
    await screen.findByRole('heading', { name: /Zexanib — Initial IND/ });
    expect(screen.queryByRole('button', { name: /Resolve/ })).toBeNull();
    const asks = screen.getAllByRole('button', { name: /Ask AnA how to clear/ });
    expect(asks.length).toBeGreaterThan(0);
    fireEvent.click(asks[0]);
    expect(p.onAsk).toHaveBeenCalledWith(expect.stringContaining('FDA_1571'));
  });

  it('the readiness report offers no AnA draft: it is the server’s verdict, already on screen', async () => {
    render(<IndLifecycle {...props()} />);
    await screen.findByRole('heading', { name: /Zexanib — Initial IND/ });
    expect(screen.queryByRole('button', { name: /Ask AnA to draft this/ })).toBeNull();
  });

  it('an AnA-draftable card offers "Draft with AnA" (a draft in the editor); a card that is not offers no AnA button', async () => {
    const p = props();
    render(<IndLifecycle {...p} />);
    await screen.findByRole('heading', { name: /Zexanib — Initial IND/ });
    const card = (title: string) => screen.getByText(title).closest('.indl-dcard') as HTMLElement;
    for (const title of ['IND Cover Letter', 'Pre-IND Briefing Book', 'Letter of Authorization', 'Statement of Right of Reference']) {
      expect(within(card(title)).queryByRole('button', { name: /^.?\s*Ask AnA$/ }), title).toBeNull();
    }
    fireEvent.click(within(card('IND Cover Letter')).getByRole('button', { name: /Draft with AnA/ }));
    expect(p.onAsk).toHaveBeenLastCalledWith('Draft the IND cover letter (m1.2) for this IND in the editor.');
    fireEvent.click(within(card('Pre-IND Briefing Book')).getByRole('button', { name: /Draft with AnA/ }));
    expect(p.onAsk).toHaveBeenLastCalledWith('Draft the Pre-IND briefing book for this program in the editor.');
    expect(within(card('Letter of Authorization')).queryByRole('button', { name: /AnA/ })).toBeNull();
    expect(within(card('Statement of Right of Reference')).queryByRole('button', { name: /AnA/ })).toBeNull();
  });
});
