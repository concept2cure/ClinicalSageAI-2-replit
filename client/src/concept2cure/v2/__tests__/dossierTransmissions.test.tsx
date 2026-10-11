// @vitest-environment jsdom
/**
 * FILING_SPINE F13 (docs/design/FILING_SPINE.md §7.2): the transmissions and
 * acknowledgements of a market sit inside its Dispatch tab.
 *
 * GET /api/mdx/gateways/transmittals?program_id=&region= lists the project's
 * transmittals for the region the sequence's gateway serves (the region comes
 * from the server's transmit route, never guessed here), each with its status,
 * its transmittal id and the gateway's reference, the acknowledgement time and
 * who sent it. A transmittal row records the sequence NUMBER it filed
 * (metadata.sequence, written by transmitSequence), not the sequence id, so the
 * list says it is filtered by project and region and marks the rows that carry
 * this sequence's number. A failed read is an error, never "none sent"; a
 * submission with no project cannot be listed by project, and says so.
 *
 * Red before F13: the Dispatch tab read nothing of the transmittal log; the
 * cross-project Gateway transmittals surface was the only place it showed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const SEQ = { id: 21, sequenceNumber: '0001', type: 'amendment', status: 'dispatched', region: 'fda', validationStatus: 'passed' };
const SUB = { id: 7, title: 'BX-256 IND', applicationType: 'ind', primaryRegion: 'fda', programId: PROGRAM };
const CLEAR = { cleared: true, blockers: [] };
const READINESS = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'dispatched', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 1, signer: { state: 'independent', sources: [] },
};
const TRANSMIT = {
  sequenceStatus: 'dispatched', dispatchStatus: 'sent', route: { ok: true, region: 'fda', gateway: 'esg' },
  configured: { staging: true, production: false }, recordedApplicationNumber: '000512', gate: CLEAR,
  refusal: "Sequence was already transmitted (dispatch status 'sent'); it is not sent again. A correction is a new sequence.",
};
const LIST_URL = `/api/mdx/gateways/transmittals?program_id=${PROGRAM}&region=fda`;
const ROWS = [
  { id: 42, region: 'fda', gateway: 'esg', status: 'ack3_received', transmission_id: 'MDN-0042', submitted_at: '2026-10-08T09:00:00Z',
    ack_received_at: '2026-10-08T09:30:00Z', submitted_by: 5, submitted_by_name: 'Dana Approver',
    metadata: { sequence: '0001', environment: 'staging' } },
  { id: 40, region: 'fda', gateway: 'esg', status: 'submitted', transmission_id: null, submitted_at: '2026-10-01T09:00:00Z',
    ack_received_at: null, submitted_by: 6, submitted_by_name: null, metadata: { sequence: '0000', environment: 'production' } },
];

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;
let list: () => Response = () => json({ data: ROWS, meta: { count: ROWS.length } });

function serve() {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (method === 'GET' && url.endsWith('/dispatch-readiness')) return json({ data: READINESS });
    if (method === 'POST' && url.endsWith('/governed-precheck')) return json({ step: 'transmit', cleared: false, refusal: TRANSMIT.refusal, transmit: TRANSMIT });
    if (method === 'GET' && url.startsWith('/api/mdx/gateways/transmittals')) return list();
    return json({ data: [] });
  });
}
const text = () => document.body.textContent ?? '';
const listCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && String(c[1]).startsWith('/api/mdx/gateways/transmittals'));
const region = () => screen.getByRole('region', { name: 'Transmissions and acknowledgements' });

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  list = () => json({ data: ROWS, meta: { count: ROWS.length } });
  serve();
});

describe('Dispatch tab: transmissions and acknowledgements (F13)', () => {
  it('lists the project’s transmissions for this market: status, id, acknowledgement time, sender', async () => {
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toContain('Transmittal #42'));
    expect(listCalls().map((c) => c[1])).toEqual([LIST_URL]);
    const r = region();
    expect(r.textContent).toContain('Filtered by project and FDA, not by sequence');
    // The first row: this sequence's, acknowledged, with the gateway's reference and its sender.
    expect(r.textContent).toContain('Transmittal #42');
    expect(r.textContent).toContain('sequence 0001 (this one)');
    expect(r.textContent).toContain('ack3_received');
    expect(r.textContent).toContain('MDN-0042');
    expect(r.textContent).toContain(`acknowledged ${new Date('2026-10-08T09:30:00Z').toLocaleString()}`);
    expect(r.textContent).toContain('sent by Dana Approver');
    // The second: another sequence of the market, not yet acknowledged, its sender only an id.
    expect(r.textContent).toContain('Transmittal #40');
    expect(r.textContent).toContain('sequence 0000');
    expect(r.textContent).toContain('not acknowledged');
    expect(r.textContent).toContain('sent by user #6');
  });

  it('a failed read is an error, not "none sent"', async () => {
    list = () => json({ error: 'Internal error' }, 500);
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(region().textContent).toContain('The transmissions could not be read'));
    expect(region().textContent).not.toMatch(/No transmissions/);
  });

  it('a 200 that is not a list is an error too', async () => {
    list = () => json({ data: { rows: 'nope' } });
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(region().textContent).toContain('The transmissions could not be read'));
  });

  it('none recorded is said as the server answered it', async () => {
    list = () => json({ data: [], meta: { count: 0 } });
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(region().textContent).toContain('No transmissions are recorded for this project in FDA.'));
  });

  it('a submission with no project cannot be listed by project, and says so; nothing is read', async () => {
    render(<DispatchWorkspace sub={{ ...SUB, programId: null }} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(region().textContent).toContain('This submission is not anchored to a project'));
    expect(listCalls()).toEqual([]);
  });
});
