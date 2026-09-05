// @vitest-environment jsdom
/**
 * IndLifecycle — honest 30-day clock + the deliverable cards' true affordances.
 *
 * Two retired defects are pinned here:
 *
 * 1. The assembler used to hardcode targetReceiptOffsetDays:14, so EVERY org
 *    saw an invented "Target FDA receipt" date two weeks out. The contract is
 *    now targetReceiptDate — the org's RECORDED
 *    regulatory_programs.target_submission_date or null. Null must render "No
 *    target date set" (reason + next action), never a projected date.
 *
 * 2. The "Documents AnA assembles" cards printed their server route (e.g.
 *    /api/ind-lifecycle/cover-letter) next to a button that never called it — a
 *    false affordance. The route text is gone; every card is now wired
 *    end-to-end (the cover-letter exemplar first, the rest mirroring it — see
 *    indLifecycleDeliverables.test.tsx), each card keeps an honest "Ask AnA"
 *    button that does exactly that, and the assemble result (the server's
 *    model + its gap verdict) renders in place.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { IndLifecycle } from '../surfaces/IndLifecycle';

let seenContext: SurfaceContext | null = null;
function ClockProbe() {
  seenContext = useActiveSurfaceContext('ind-checklist');
  return null;
}

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;

/* A REAL org-scoped checklist — deliberately NOT the kit's BX-301 sample. */
const CHECKLIST = (targetReceiptDate: string | null) => ({
  submissionId: 31,
  code: 'ZX-9',
  drugName: 'Zexanib',
  productName: 'ZX-9 First-in-Human',
  indication: null,
  sponsorName: 'Acme Bio',
  submissionType: 'IND',
  targetReceiptDate,
  forms: [
    { id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true },
  ],
  sections: [],
});

const COVER_LETTER_URL = '/api/ind-lifecycle/cover-letter';

function mockApi(target: string | null, coverLetter?: { ok: boolean; status: number; body: unknown }) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [CHECKLIST(target)], meta: { count: 1 } }) } as Response;
    }
    if (method === 'GET' && url === '/api/ind-forms/') {
      return { ok: true, status: 200, json: async () => ({ forms: [] }) } as Response;
    }
    if (method === 'POST' && url === COVER_LETTER_URL && coverLetter) {
      return { ok: coverLetter.ok, status: coverLetter.status, json: async () => coverLetter.body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

/* The surface's own date formatter, mirrored so the expectation is
   locale/timezone-stable wherever the suite runs. */
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('IndLifecycle — 30-day clock from the RECORDED target date only', () => {
  it('renders "No target date set" (reason + next action) when no target is recorded', async () => {
    mockApi(null);
    render(<IndLifecycle {...props()} />);

    expect(await screen.findByText('No target date set')).toBeTruthy();
    expect(screen.getByText('No target date')).toBeTruthy(); // the clock chip
    expect(document.body.textContent).toContain(
      'No target submission date is recorded for this program',
    );
    // Nothing is projected from an invented offset: no 14-days-out receipt date.
    const invented = fmt(new Date(Date.now() + 14 * 86400000).toISOString());
    expect(document.body.textContent).not.toContain(invented);
  });

  it("renders the org's RECORDED target date when one exists", async () => {
    const target = '2026-10-01T00:00:00.000Z';
    mockApi(target);
    render(<IndLifecycle {...props()} />);

    expect(await screen.findByText(fmt(target))).toBeTruthy();
    expect(screen.queryByText('No target date set')).toBeNull();
  });
});

describe('IndLifecycle — a projected 30-day clock never speaks as the regulatory one', () => {
  /* 21 CFR 312.40(b) starts the 30-day period at FDA's RECEIPT of the IND. The
     only date this surface holds is the program's TARGET submission date. With
     a target more than 30 days in the past the clock reached 'safe_to_proceed'
     and the screen showed a good-tone "Safe to proceed" chip over the clock's
     own sentence — "clinical investigations may proceed (21 CFR 312.40(b))" —
     for an IND the FDA may never have received. That sentence authorises dosing
     the first human subject. */
  const LONG_PAST = new Date(Date.now() - 90 * 86400000).toISOString();

  it('does not show a cleared-to-proceed chip or the may-proceed sentence over a target date', async () => {
    mockApi(LONG_PAST);
    render(<IndLifecycle {...props()} />);
    await screen.findByText('Projected from target date');

    expect(screen.queryByText('Safe to proceed')).toBeNull();
    expect(document.body.textContent).not.toContain('clinical investigations may proceed');
    expect(document.body.textContent).toContain('FDA receipt has not been recorded');
    expect(screen.getByText('Projected from target date')).toBeTruthy();
  });

  it('publishes the clock to AnA as a projection with safeToProceed unknown', async () => {
    mockApi(LONG_PAST);
    render(<><IndLifecycle {...props()} /><ClockProbe /></>);
    await screen.findByText('Projected from target date');

    const facts = (seenContext as any)?.facts ?? {};
    expect(facts.thirtyDayClock).toBeTruthy();
    expect(facts.thirtyDayClock.basis).toBe('projection-from-target-submission-date');
    // Unknown, not the projection's own `true` — AnA must not be able to tell
    // anyone they are clear to proceed off a planning field.
    expect(facts.thirtyDayClock.safeToProceed).toBeNull();
    expect(facts.thirtyDayClock.status).toBe('not_started');
    expect(String((seenContext as any)?.summary)).toMatch(/FDA receipt has NOT been recorded/);
  });
});

describe('IndLifecycle — deliverable cards carry no false affordance', () => {
  it('prints no server route as decorative text', async () => {
    mockApi(null);
    render(<IndLifecycle {...props()} />);
    await screen.findByText('No target date set');

    expect(document.body.textContent).not.toContain('/api/ind-lifecycle/');
    expect(document.querySelector('.indl-route')).toBeNull();
  });

  it('every card keeps an honest "Ask AnA" button that does exactly that', async () => {
    const p = props();
    mockApi(null);
    render(<IndLifecycle {...p} />);
    await screen.findByText('No target date set');

    // The briefing-book card (now wired end-to-end) still offers Ask AnA, and
    // that button hands its generic prompt to AnA — nothing else.
    const askButtons = screen.getAllByText('Ask AnA');
    expect(askButtons.length).toBeGreaterThan(0);
    const briefingCard = screen.getByText('Pre-IND Briefing Book').closest('.indl-dcard')! as HTMLElement;
    fireEvent.click(within(briefingCard).getByText('Ask AnA'));
    expect(p.onAsk).toHaveBeenCalledWith('Assemble the Pre-IND briefing book for this program.');
    // No POST fired from asking AnA.
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-lifecycle/briefing-book')).toBe(false);
  });

  it('the cover-letter exemplar POSTs the real route and renders the SERVER model + gaps', async () => {
    mockApi(null, {
      ok: true,
      status: 200,
      body: {
        reportType: 'IND_COVER_LETTER',
        indNumber: null,
        submissionType: 'original',
        body: 'REAL SERVER LETTER BODY',
        gaps: ['signatoryName'],
      },
    });
    render(<IndLifecycle {...props()} />);
    await screen.findByText('No target date set');

    // Every card now renders an "Assemble now" — scope to the exemplar's card.
    const clCard = screen.getByText('IND Cover Letter').closest('.indl-dcard')! as HTMLElement;
    fireEvent.click(within(clCard).getByText('Assemble now'));

    expect(await screen.findByText('REAL SERVER LETTER BODY')).toBeTruthy();
    expect(document.body.textContent).toContain('Missing before filing: signatoryName');
    // The POST carried the loaded checklist's real identity — nothing invented.
    expect(apiRequest).toHaveBeenCalledWith('POST', COVER_LETTER_URL, {
      sponsorName: 'Acme Bio',
      drugName: 'Zexanib',
      submissionType: 'original',
    });
  });

  it('a failed cover-letter assemble reports honestly — never success', async () => {
    mockApi(null, { ok: false, status: 401, body: { error: { code: 'AUTH_REQUIRED' } } });
    render(<IndLifecycle {...props()} />);
    await screen.findByText('No target date set');

    const clCard = screen.getByText('IND Cover Letter').closest('.indl-dcard')! as HTMLElement;
    fireEvent.click(within(clCard).getByText('Assemble now'));

    expect(
      await screen.findByText('Could not assemble the cover letter — sign in and retry.'),
    ).toBeTruthy();
  });
});
