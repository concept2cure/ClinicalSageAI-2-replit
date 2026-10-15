// @vitest-environment jsdom
/**
 * Respond answers the agency (docs/design/FILING_SPINE.md F15).
 *
 * Respond had one card, "Response authoring", which opened the editor with no
 * letter (FILING_SPINE §6 row 17). It now has the three steps of an answer:
 * add the agency's letter to the data room, draft the response with AnA from
 * that letter (pinned, so the turn is grounded on it), and start the response
 * sequence in the market the letter came from. Question-by-question tracking
 * is named as coming later.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectRespond } from '../surfaces/ProjectRespond';
import { consumeNavParams } from '../navParams';

const PID = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const source = (id: number, title: string, readable = true) => ({
  id, title, checksum: null, ingestionStatus: 'completed', extractionStatus: readable ? 'completed' : 'failed',
  createdAt: '2026-10-15T10:00:00.000Z', mimeType: 'application/pdf', fileSize: 1000, artifactId: null, origin: 'upload',
  extractionMethod: 'pdf-text', textAvailable: readable, isCurrent: true, dataEligible: true,
});
const SOURCES = { sources: [source(41, 'FDA information request 2026-10-12'), source(40, 'Scanned fax', false), source(39, 'CSR-001')], currentTotal: 3 };
const submission = (id: number, title: string, applicationType: string, primaryRegion: string) =>
  ({ submission: { id, title, productName: null, applicationType, primaryRegion, status: 'active', lifecycleStage: 'original' }, read: { state: 'reading' } });
const markets = (rows: ReturnType<typeof submission>[]) => ({
  list: { rows: rows.map((r) => r.submission), loading: false, empty: rows.length === 0 },
  notOffered: 0, markets: rows, retryList: vi.fn(), retryMarket: vi.fn(),
}) as never;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => (String(url).startsWith(`/api/c2c/projects/${PID}/sources`) ? ok(SOURCES) : ok({})));
});
afterEach(() => { cleanup(); delete (window as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS; });

describe('Respond answers the agency (F15)', () => {
  it('offers the three steps, and names question-by-question tracking as coming later', async () => {
    render(<ProjectRespond pid={PID} markets={markets([submission(55, 'ONC-221 IND', 'ind', 'fda')])} onNav={vi.fn()} onAsk={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Add the agency's letter/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Draft the response with AnA/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start a response sequence/ })).toBeTruthy();
    expect(screen.getByTestId('pj-coming-later').textContent).toMatch(/Question-by-question tracking/);
    // The editor with no letter is no longer offered.
    expect(screen.queryByRole('button', { name: /Response authoring/ })).toBeNull();
  });

  it('drafts from the letter chosen, pinned, and from no source whose text could not be read', async () => {
    const onAsk = vi.fn();
    render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={onAsk} />);
    const letter = (await screen.findByLabelText(/The agency's letter/)) as HTMLSelectElement;
    expect(Array.from(letter.options).map((o) => o.textContent)).toEqual(['FDA information request 2026-10-12', 'CSR-001']);
    fireEvent.click(screen.getByRole('button', { name: /Draft the response with AnA/ }));
    expect((window as { C2C_SOURCE_PINS?: string[] }).C2C_SOURCE_PINS).toEqual(['41']);
    expect(onAsk.mock.calls[0][0]).toMatch(/FDA information request 2026-10-12/);
    expect(onAsk.mock.calls[0][0]).toMatch(/no question number or due date the letter does not state/);
  });

  it('with no readable letter in the data room, drafting is not offered as if it could be grounded', async () => {
    apiRequest.mockImplementation(async () => ok({ sources: [source(40, 'Scanned fax', false)], currentTotal: 1 }));
    render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={vi.fn()} />);
    const draft = (await screen.findByRole('button', { name: /Draft the response with AnA/ })) as HTMLButtonElement;
    await waitFor(() => expect(draft.disabled).toBe(true));
    expect(screen.getByText(/No letter in the data room has readable text yet/)).toBeTruthy();
  });

  it('"Start a response sequence" opens that market\'s Sequences tab with the follow-up type response', async () => {
    const onNav = vi.fn();
    render(<ProjectRespond pid={PID} markets={markets([submission(55, 'ONC-221 IND', 'ind', 'fda'), submission(56, 'ONC-221 MAA', 'maa', 'eu')])} onNav={onNav} onAsk={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/The market the letter came from/), { target: { value: '56' } });
    fireEvent.click(screen.getByRole('button', { name: /Start a response sequence/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '56', ws: 'sequences', followUp: 'response' });
  });

  it('with no market yet, says so instead of offering a sequence nothing can hold', async () => {
    render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={vi.fn()} />);
    expect((screen.getByRole('button', { name: /Start a response sequence/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/This project has no submission to respond in yet/)).toBeTruthy();
  });
});

describe('Submission Center opened for a response (F15)', () => {
  it("opens the market's Sequences tab with the next sequence typed response", async () => {
    const { SubmissionCenter } = await import('../surfaces/SubmissionCenter');
    const { stashNavParamsForTarget } = await import('../navParams');
    const SUB = { id: 56, title: 'ONC-221 MAA', productName: null, applicationType: 'maa', clientType: 'pharma', primaryRegion: 'eu', status: 'planning', lifecycleStage: 'original', programId: null };
    const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'dispatched', region: 'eu', validationStatus: null };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/submissions') return ok([SUB]);
      if (url === '/api/submissions/56/sequences') return ok([SEQ]);
      return ok([]);
    });
    stashNavParamsForTarget('submission-center', { submissionId: '56', ws: 'sequences', followUp: 'response' });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    const type = (await screen.findByLabelText(/Type of sequence 0001/)) as HTMLSelectElement;
    expect(type.value).toBe('response');
  });
});
