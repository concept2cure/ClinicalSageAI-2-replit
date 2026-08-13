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
 * 2. The six "Documents AnA assembles" cards printed their server route (e.g.
 *    /api/ind-lifecycle/cover-letter) next to a button that never called it — a
 *    false affordance. The route text is gone; the un-wired cards' buttons say
 *    "Ask AnA" (which is what they do), and the cover-letter card is wired
 *    end-to-end as the exemplar: a real POST whose result (the server's letter
 *    model + its gap verdict) renders in place.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { IndLifecycle } from '../surfaces/IndLifecycle';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;

/* A REAL org-scoped checklist — deliberately NOT the kit's BX-301 sample. */
const CHECKLIST = (targetReceiptDate: string | null) => ({
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

describe('IndLifecycle — deliverable cards carry no false affordance', () => {
  it('prints no server route as decorative text', async () => {
    mockApi(null);
    render(<IndLifecycle {...props()} />);
    await screen.findByText('No target date set');

    expect(document.body.textContent).not.toContain('/api/ind-lifecycle/');
    expect(document.querySelector('.indl-route')).toBeNull();
  });

  it('un-wired cards say "Ask AnA" and do exactly that', async () => {
    const p = props();
    mockApi(null);
    render(<IndLifecycle {...p} />);
    await screen.findByText('No target date set');

    // The briefing-book card (un-wired) hands its generic prompt to AnA.
    const askButtons = screen.getAllByText('Ask AnA');
    expect(askButtons.length).toBeGreaterThan(0);
    const briefingCard = screen.getByText('Pre-IND Briefing Book').closest('.indl-dcard')!;
    fireEvent.click(briefingCard.querySelector('.indl-dcard-acts button')!);
    expect(p.onAsk).toHaveBeenCalledWith('Assemble the Pre-IND briefing book for this program.');
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

    fireEvent.click(screen.getByText('Assemble now'));

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

    fireEvent.click(screen.getByText('Assemble now'));

    expect(
      await screen.findByText('Could not assemble the cover letter — sign in and retry.'),
    ).toBeTruthy();
  });
});
