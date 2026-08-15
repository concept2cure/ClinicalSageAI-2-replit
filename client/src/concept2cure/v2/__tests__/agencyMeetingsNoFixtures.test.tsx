// @vitest-environment jsdom
/**
 * AgencyMeetings — fixture-free contract (GA real-data standard).
 *
 * The surface used to fall back to inline fixtures (MTG_LIST / MTG_BB /
 * MTG_MINUTES) behind a "Sample data" pill whenever the backend was empty or
 * unreachable. That is retired. These tests pin the three honest states the
 * surface may now render — REAL rows from GET /api/agency-meetings (each with
 * its nested briefing book + minutes rehydrated from the c2c_agency_meetings
 * JSONB columns), an honest EMPTY state, or an honest ERROR state — and prove
 * no retired fixture content survives when the backend has nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AgencyMeetings } from '../surfaces/AgencyMeetings';

const props = () => ({
  surface: { id: 'agency-meetings', label: 'Agency meetings' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/* A REAL org-scoped payload — deliberately NOT the retired fixture, so anything
   rendered proves the response was adopted rather than a codebase constant. The
   route shape is { data: [...rows], meta } with briefingBook + minutes nested. */
const REAL_ROWS = {
  data: [
    {
      id: 'mtg-real-1',
      type: 'Type C',
      agency: 'FDA · CBER',
      cat: 'Type C',
      program: 'ZX-9 · IND',
      status: 'granted',
      requested: '2026-08-01',
      granted: '2026-08-20',
      meets: '2026-10-05',
      clock: 'WRR due 2026-09-21',
      format: 'Teleconference',
      goal: 'Align on the potency assay strategy before the BLA.',
      briefingBook: {
        title: 'Type C briefing book · ZX-9',
        state: 'Draft',
        ver: 'v0.2',
        owner: 'A. Rivera',
        sections: [{ n: '1', label: 'CMC overview', st: 'draft' }],
        questions: [
          { q: 'Is the proposed potency assay acceptable for lot release?', area: 'CMC', pos: 'Bridging study ongoing.' },
          { q: 'Does the Agency agree with the proposed stability protocol?', area: 'CMC', pos: 'ICH Q1A compliant.' },
        ],
      },
      minutes: {
        received: '2026-10-12',
        agree: ['CBER agreed the potency assay is acceptable for lot release.'],
        commitments: [
          { c: 'Submit the bridging dataset.', doc: 'CMC', due: 'In BLA', st: 'open' },
          { c: 'Finalize the stability protocol.', doc: 'CMC', due: 'Next amendment', st: 'closed' },
        ],
      },
    },
  ],
  meta: { count: 1 },
};

const EMPTY = { data: [], meta: { count: 0 } };

/** Read the value cell of the KPI whose label matches. */
function kpiValue(label: string): string {
  const card = Array.from(document.querySelectorAll('.reg-kpi')).find((el) =>
    (el.querySelector('.reg-kpi-l')?.textContent || '').includes(label),
  );
  return card?.querySelector('.reg-kpi-v')?.textContent?.trim() || '';
}

/* Fixture strings that must NEVER appear once the fixtures are gone. */
const RETIRED = [
  'MABEL + 10x safety factor',
  'K221847',
  'Aurora CGM',
  'Pre-IND WRR Jun 24',
  'Sample data',
  'J. Chen',
];

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('AgencyMeetings — real rows render (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/agency-meetings') {
        return { ok: true, status: 200, json: async () => REAL_ROWS } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('renders the REAL meeting, its nested briefing book, and its minutes', async () => {
    render(<AgencyMeetings {...props()} />);

    // The meeting row + goal came from the response, not a fixture.
    expect(await screen.findByText('Align on the potency assay strategy before the BLA.')).toBeTruthy();
    // The briefing book (nested JSONB) rehydrated into the detail panel.
    expect(screen.getByText('Is the proposed potency assay acceptable for lot release?')).toBeTruthy();
    // The minutes (nested JSONB) rehydrated too.
    expect(screen.getByText('CBER agreed the potency assay is acceptable for lot release.')).toBeTruthy();

    // No provenance pill and no retired fixture content.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });

  it('derives every KPI from the real rows (not hardcoded)', async () => {
    render(<AgencyMeetings {...props()} />);
    await screen.findByText('Align on the potency assay strategy before the BLA.');

    expect(kpiValue('Meetings')).toBe('1');
    // 2 briefing-book questions across the org's meetings.
    expect(kpiValue('Open questions to agencies')).toBe('2');
    // 1 of 2 commitments is open.
    expect(kpiValue('Open commitments')).toBe('1');
    // Next meeting date derived from the row's `meets` field (2026-10-05).
    expect(kpiValue('Next')).toBe('Oct 5');
  });
});

describe('AgencyMeetings — honest empty state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/agency-meetings') {
        return { ok: true, status: 200, json: async () => EMPTY } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('shows an EmptyState — never a fixture — when the org has no meetings', async () => {
    render(<AgencyMeetings {...props()} />);

    expect(await screen.findByText('No agency meetings tracked yet')).toBeTruthy();
    // KPI count is the honest zero, not a fixture length.
    expect(kpiValue('Meetings')).toBe('0');
    // The retired fixtures are gone.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
    // No meeting cards rendered.
    expect(document.querySelector('.mtg-card')).toBeNull();
  });
});

describe('AgencyMeetings — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/agency-meetings') {
        return { ok: false, status: 403, json: async () => ({ error: { code: 'ORG_REQUIRED' } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it("shows an error EmptyState — never a fixture — when the read fails", async () => {
    render(<AgencyMeetings {...props()} />);

    expect(await screen.findByText("Couldn't load agency meetings")).toBeTruthy();
    // KPIs read '--' rather than a fabricated number.
    await waitFor(() => expect(kpiValue('Meetings')).toBe('--'));
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});
