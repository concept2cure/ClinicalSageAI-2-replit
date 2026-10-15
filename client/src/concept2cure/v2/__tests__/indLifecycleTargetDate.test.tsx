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
 *
 * And, since 2026-10-15 (P-32 follow-up), the clock is the SERVER's:
 * POST /api/ind-lifecycle/clock runs evaluateRegulatoryClock over the
 * recorded target date. The screen used a client copy of that engine
 * (indlClock in fixtures/ind-lifecycle-data.ts), and of the readiness engine
 * (indlReadiness); both are gone. A computation in flight says so, and a
 * failed one says it failed and offers a retry — it never renders as a clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';

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
const CLOCK_URL = '/api/ind-lifecycle/clock';

type Stub = { ok: boolean; status: number; body: unknown };
/** The server's ClockState for a receipt still inside the 30-day window. */
const SERVER_CLOCK = {
  status: 'submitted',
  thirtyDayDate: '2031-01-15T00:00:00.000Z',
  safeToProceed: false,
  onHold: false,
  daysUntilThirtyDay: 4321,
  rationale: 'Within the 30-day FDA review period; 4321 calendar day(s) remain before the investigation may begin absent a hold.',
};
let clockStub: Stub | 'pending' = { ok: true, status: 200, body: SERVER_CLOCK };

function mockApi(target: string | null, coverLetter?: { ok: boolean; status: number; body: unknown }) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === CLOCK_URL) {
      if (clockStub === 'pending') return new Promise<Response>(() => {});
      const c = clockStub;
      return { ok: c.ok, status: c.status, json: async () => c.body } as Response;
    }
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
beforeEach(() => {
  apiRequest.mockReset();
  clockStub = { ok: true, status: 200, body: SERVER_CLOCK };
});

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
  /* What the server's engine answers for that date: elapsed, no hold — its own
     status is safe_to_proceed and its own sentence says investigations may
     proceed. The screen must still speak of a projection. */
  const ELAPSED = {
    status: 'safe_to_proceed',
    thirtyDayDate: new Date(Date.parse(LONG_PAST) + 30 * 86400000).toISOString(),
    safeToProceed: true,
    onHold: false,
    daysUntilThirtyDay: 0,
    rationale: 'The 30-day review period has elapsed with no clinical hold; clinical investigations may proceed (21 CFR 312.40(b)).',
  };
  beforeEach(() => {
    clockStub = { ok: true, status: 200, body: ELAPSED };
  });

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

    /* Wait for the FACT, not for a proxy for it. The probe reads the surface
       context through a hook, and that publication is a separate effect from
       the render this test was waiting on — so under full-suite load the text
       was on screen while `seenContext` was still null, and the read below got
       `undefined`. It passed in isolation and failed in the suite, which is the
       signature of exactly this race rather than of a product defect. */
    await waitFor(() => expect((seenContext as any)?.facts?.thirtyDayClock).toBeTruthy());

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

describe('IndLifecycle — the 30-day clock is the server engine\'s, never a client copy', () => {
  const TARGET = '2026-10-01T00:00:00.000Z';

  it('shows the clock the server computed from the recorded target date', async () => {
    mockApi(TARGET);
    render(<IndLifecycle {...props()} />);

    // The server's numbers, not a client-side receipt + 30 days.
    expect(await screen.findByText('4321')).toBeTruthy();
    expect(screen.getByText(fmt(SERVER_CLOCK.thirtyDayDate))).toBeTruthy();
    expect(document.body.textContent).not.toContain(fmt(new Date(Date.parse(TARGET) + 30 * 86400000).toISOString()));
    expect(apiRequest).toHaveBeenCalledWith('POST', CLOCK_URL, { receiptDate: TARGET });
    // Still a projection: the receipt is a plan.
    expect(screen.getByText('Projected from target date')).toBeTruthy();
  });

  it('while the server computes, says so — no number, no date', async () => {
    clockStub = 'pending';
    mockApi(TARGET);
    render(<IndLifecycle {...props()} />);

    expect(await screen.findByText(/Computing the 30-day clock/)).toBeTruthy();
    expect(screen.getByText('Computing')).toBeTruthy(); // the chip
    expect(document.querySelector('.indl-clock-big')?.textContent).toMatch(/^--/);
    expect(screen.queryByText('No target date set')).toBeNull();
  });

  it('a failed computation reads as a failure with a retry — never as a clock, never as "no target date"', async () => {
    clockStub = { ok: false, status: 500, body: { error: { code: 'INTERNAL', message: 'The clock engine is unavailable.' } } };
    mockApi(TARGET);
    render(<><IndLifecycle {...props()} /><ClockProbe /></>);

    expect(await screen.findByText(/The 30-day clock could not be computed — The clock engine is unavailable\./)).toBeTruthy();
    expect(screen.getByText('Clock not computed')).toBeTruthy();
    expect(document.querySelector('.indl-clock-big')?.textContent).toMatch(/^--/);
    expect(screen.queryByText('No target date set')).toBeNull();
    expect(document.body.textContent).not.toContain('No target submission date is recorded');
    await waitFor(() => expect((seenContext as any)?.facts?.thirtyDayClockState).toBe('not-computed'));
    expect((seenContext as any).facts.thirtyDayClock).toBeNull();
    expect(String((seenContext as any).summary)).toMatch(/could not be computed/);

    // Retry asks the server again, and its answer renders.
    clockStub = { ok: true, status: 200, body: SERVER_CLOCK };
    fireEvent.click(screen.getByRole('button', { name: 'Retry the clock' }));
    expect(await screen.findByText('4321')).toBeTruthy();
    expect(apiRequest.mock.calls.filter((c) => c[1] === CLOCK_URL)).toHaveLength(2);
  });

  it('a 200 that is not a clock is a failure, not a clock at zero', async () => {
    clockStub = { ok: true, status: 200, body: {} };
    mockApi(TARGET);
    render(<IndLifecycle {...props()} />);
    expect(await screen.findByText(/The 30-day clock could not be computed — unexpected response/)).toBeTruthy();
  });

  it('with no recorded target date, nothing is asked of the server and nothing is projected', async () => {
    mockApi(null);
    render(<IndLifecycle {...props()} />);
    await screen.findByText('No target date set');
    expect(apiRequest.mock.calls.some((c) => c[1] === CLOCK_URL)).toBe(false);
  });

  it('the screen carries no client copy of the readiness or clock engine', async () => {
    const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const src = fs.readFileSync(path.join(REPO, 'client/src/concept2cure/v2/surfaces/IndLifecycle.tsx'), 'utf8');
    expect(src).not.toMatch(/\bindlReadiness\b|\bindlClock\b/);
    const fixtures = await import('../fixtures/ind-lifecycle-data');
    expect(Object.keys(fixtures)).not.toContain('indlReadiness');
    expect(Object.keys(fixtures)).not.toContain('indlClock');
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
    // 2026-10-15: it also carried submissionType 'original' for every letter;
    // it now names the submission, and the server reads the type from its record.
    expect(apiRequest).toHaveBeenCalledWith('POST', COVER_LETTER_URL, {
      sponsorName: 'Acme Bio',
      drugName: 'Zexanib',
      submissionId: 31,
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
