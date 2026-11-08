// @vitest-environment jsdom
/**
 * The protocol's engine reads, reached in their tabs (R1): the deviation trend
 * signals, the EU substantiality indicators of an amendment, and the risk
 * register's summary. Each shows what its engine says, in its words, and says
 * so when the read fails. Nothing here computes a figure.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AmendmentsTab, DeviationsTab } from '../surfaces/ProtocolDevPanes';
import { RiskTab } from '../surfaces/ProtocolDevRegisters';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const TRENDS = '/api/protocol-deviations/deviations/trends?protocolDocumentId=2';
const SUBST = '/api/protocol-amendments/amendments/7/substantiality';
const DEV = { id: '3', title: 'Missed visit', sev: 'major', assessed: true, status: 'open', capa: [], closeBlockers: [] };
const AMD = { id: '7', num: 'A1', summary: 'Widen eligibility', status: 'draft', nextStatuses: ['submitted'], reconsent: null, path: '', changes: [] };

function serve(routes: Record<string, () => Promise<Response>>) {
  apiRequest.mockImplementation((_m: string, url: string) => (routes[url] ? routes[url]() : Promise.resolve(ok({}))));
}
const called = (url: string) => apiRequest.mock.calls.some(([, u]) => u === url);

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('deviation trend signals', () => {
  it('shows the engine’s signals in its own sentences', async () => {
    // The route's real shape: { documentId, trends } (deviationTrendsForProtocol). The first version of this test
    // mocked a top-level `signals`, and the running app showed the read as failed.
    serve({ [TRENDS]: () => Promise.resolve(ok({ documentId: 2, trends: { signals: [{ code: 'DEV-CATEGORY-SPIKE', message: 'Procedure deviations: 4 this month, against a prior mean of 1.' }] } })) });
    render(<DeviationsTab doc={{ id: '2', deviations: [DEV] }} onAdd={vi.fn()} />);
    expect(await screen.findByText('Procedure deviations: 4 this month, against a prior mean of 1.')).toBeTruthy();
    expect(screen.getByText('DEV-CATEGORY-SPIKE')).toBeTruthy();
  });

  it('says when there is no signal, and a failed read is said as one', async () => {
    serve({ [TRENDS]: () => Promise.resolve(ok({ documentId: 2, trends: { signals: [] } })) });
    const { unmount } = render(<DeviationsTab doc={{ id: '2', deviations: [DEV] }} onAdd={vi.fn()} />);
    expect(await screen.findByText(/No trend signal over the window/)).toBeTruthy();
    unmount();
    serve({ [TRENDS]: () => Promise.reject(Object.assign(new Error('Unavailable'), { status: 503 })) });
    render(<DeviationsTab doc={{ id: '2', deviations: [DEV] }} onAdd={vi.fn()} />);
    expect(await screen.findByText('The deviation trends could not be read.')).toBeTruthy();
    expect(screen.queryByText(/No trend signal/)).toBeNull();
  });

  it('a reply without the trends is a failed read, not an empty one', async () => {
    serve({ [TRENDS]: () => Promise.resolve(ok({ signals: [] })) });
    render(<DeviationsTab doc={{ id: '2', deviations: [DEV] }} onAdd={vi.fn()} />);
    expect(await screen.findByText('The deviation trends could not be read.')).toBeTruthy();
  });

  it('reads nothing for a protocol with no deviation', () => {
    serve({});
    render(<DeviationsTab doc={{ id: '2', deviations: [] }} onAdd={vi.fn()} />);
    expect(called(TRENDS)).toBe(false);
  });
});

describe('EU substantiality indicators', () => {
  const ASSESSMENT = {
    assessment: {
      verdictReason: 'At least one EU substantial-impact indicator fired. The classification is the sponsor’s.',
      indicators: [
        { id: 'eu-elig', scope: 'eu_sm', clause: 'Art 2(2)(13)', title: 'Eligibility changed', status: 'indicated', message: 'Upper age limit removed.' },
        { id: 'us-elig', scope: 'us_ind', clause: '312.30(b)(1)', title: 'US: eligibility', status: 'indicated', message: 'US example touched.' },
        { id: 'eu-dose', scope: 'eu_sm', clause: 'Art 2(2)(13)', title: 'Dose changed', status: 'not_indicated', message: 'Unchanged.' },
      ],
      notComparable: ['visitWindows'], declarationConflict: null,
      us: { indicated: 1, note: 'One 312.30(b)(1) example touched; a sponsor determination.' },
    },
  };

  it('reads nothing until asked', () => {
    serve({});
    render(<AmendmentsTab doc={{ amendments: [AMD] }} onAdd={vi.fn()} />);
    expect(called(SUBST)).toBe(false);
  });

  it('shows the engine’s verdict sentence and the EU indicators that fired, and keeps the US view apart', async () => {
    serve({ [SUBST]: () => Promise.resolve(ok(ASSESSMENT)) });
    render(<AmendmentsTab doc={{ amendments: [AMD] }} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check EU substantiality indicators' }));
    expect(await screen.findByText(/At least one EU substantial-impact indicator fired/)).toBeTruthy();
    expect(screen.getByText('Eligibility changed (Art 2(2)(13)): Upper age limit removed.')).toBeTruthy();
    expect(screen.queryByText(/US: eligibility/)).toBeNull();
    expect(screen.queryByText(/Dose changed/)).toBeNull();
    expect(screen.getByText('Under a US IND, separately: One 312.30(b)(1) example touched; a sponsor determination.')).toBeTruthy();
    expect(screen.getByText('Not comparable: visitWindows.')).toBeTruthy();
    // It never says the amendment is not substantial.
    expect(document.body.textContent).not.toMatch(/non-substantial|not substantial/i);
  });

  it('says when the indicators could not be read', async () => {
    serve({ [SUBST]: () => Promise.reject(Object.assign(new Error('Unavailable'), { status: 503 })) });
    render(<AmendmentsTab doc={{ amendments: [AMD] }} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check EU substantiality indicators' }));
    expect(await screen.findByText('The substantiality indicators could not be read.')).toBeTruthy();
  });
});

describe('the risk register line', () => {
  it('reads the QRM engine’s summary, not a threshold of its own', () => {
    // l x i = 16 would have read "1 extreme" under the screen's old rule; the engine says what is open and high.
    render(<RiskTab doc={{ risks: [{ id: '1', hazard: 'Endpoint questioned', l: 4, i: 4, rl: 3, ri: 3, status: 'mitigating' }],
      riskSummary: { total: 1, byLevel: { low: 0, medium: 1, high: 0, extreme: 0 }, openHighOrExtreme: 0, residualExposure: 9, basis: 'ICH E6(R3)', unscored: 0 } }}
      onAdd={vi.fn()} />);
    expect(screen.getByText('1 risks · 0 open high or extreme')).toBeTruthy();
    expect(screen.queryByText(/^\d+ risks · \d+ extreme$/)).toBeNull();
  });

  it('names the risks no level describes', () => {
    render(<RiskTab doc={{ risks: [{ id: '1', hazard: 'Unscored', l: 0, i: 0, status: 'open' }],
      riskSummary: { total: 0, byLevel: {}, openHighOrExtreme: 0, residualExposure: 0, basis: 'ICH E6(R3)', unscored: 1 } }}
      onAdd={vi.fn()} />);
    expect(screen.getByText('1 risks · 0 open high or extreme · 1 not scored')).toBeTruthy();
  });
});
