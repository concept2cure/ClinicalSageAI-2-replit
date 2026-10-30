// @vitest-environment jsdom
/**
 * Respond answers the agency (docs/design/FILING_SPINE.md F15).
 *
 * Respond had one card, "Response authoring", which opened the editor with no
 * letter (FILING_SPINE §6 row 17). It now has the three steps of an answer:
 * add the agency's letter (to the data room and, since 2026-10-17, to the
 * project's agency inbox), work the inbox — draft a response with AnA from a
 * letter (pinned, so the turn is grounded on it) and triage it — and start the
 * response sequence in the market the letter came from. Since 2026-10-18 each
 * letter also opens its questions and signed responses (AgencyResponses.tsx).
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
  it('offers the three steps, and no longer names question-by-question tracking as coming later', async () => {
    render(<ProjectRespond pid={PID} markets={markets([submission(55, 'ONC-221 IND', 'ind', 'fda')])} onNav={vi.fn()} onAsk={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Add the agency's letter/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose the letter file/ })).toBeTruthy();
    // AnA is asked to invent no number or date; the person is told to check (2026-10-15).
    expect(screen.getByText(/Check every question number and due date in the draft against the letter/)).toBeTruthy();
    // Step 2 is the project's agency inbox (Communication's store), not a data-room picker (2026-10-17).
    expect(screen.getByRole('heading', { name: /The agency's open communications/ })).toBeTruthy();
    expect(await screen.findByText(/No agency communications yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start a response sequence/ })).toBeTruthy();
    // Each inbox letter holds its questions and signed responses (2026-10-18).
    expect(screen.getByTestId('pj-coming-later').textContent).not.toMatch(/Question-by-question tracking/);
    /* Slice A.1: agency meetings fold into Communication, whose Meetings and recorded commitments work
       today; the line names what Respond will hold, precedent responses and FDA's Pre-Sub feedback. */
    expect(screen.getByTestId('pj-coming-later').textContent).toBe(
      'Coming later: Precedent responses, showing how the agency answered similar questions before; for a US ' +
      'device filing, FDA’s written feedback on its Pre-Sub.',
    );
    // The editor with no letter is no longer offered.
    expect(screen.queryByRole('button', { name: /Response authoring/ })).toBeNull();
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

const COMMS_URL = `/api/concept2cure/projects/${PID}/agency-communications`;
const commRow = (over: Record<string, unknown> = {}) => ({
  id: 'ace_1', sourceType: 'uploaded_official_correspondence', communicationType: 'Agency letter: IR-2026-10-12.pdf',
  sourceChannel: 'Uploaded in Respond', linkedSectionCodes: [], linkedArtifactIds: ['cre_source:77'],
  receivedDate: '2026-10-16T09:00:00.000Z', urgency: 'medium', responseRequired: true, extractedIssues: [],
  humanReviewStatus: 'pending_review', closureStatus: 'open', auditMetadata: { visibilityTier: 'shared_client_c2c' }, ...over,
});

describe('One agency inbox: Respond logs into Communication\'s store and shows it (2026-10-17)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a letter uploaded in Respond is logged as an agency communication of this project, linked to its data-room source', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ fileId: 'file_9', sourceId: 77, status: 'ready', extractionMethod: 'pdf-text', extractionWords: 120 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'IR-2026-10-12.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', COMMS_URL, expect.objectContaining({
      sourceType: 'uploaded_official_correspondence',
      linkedArtifactIds: ['cre_source:77'],
      communicationType: expect.stringContaining('IR-2026-10-12.pdf'),
    })));
    // No due date, urgency assessment or issue is invented for a letter nobody has read yet.
    const body = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === COMMS_URL)![2];
    expect(body.dueDate).toBeUndefined();
    expect(body.extractedIssues).toEqual([]);
  });

  it('when the log is refused, says the letter is in the data room but not in the agency inbox', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ fileId: 'file_9', sourceId: 77, status: 'ready' }) })));
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (m === 'POST' && url === COMMS_URL) return { ok: false, status: 500, json: async () => ({ success: false, message: 'The store is unavailable' }) } as Response;
      return String(url).startsWith(`/api/c2c/projects/${PID}/sources`) ? ok(SOURCES) : ok({ success: true, data: [] });
    });
    const { container } = render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={vi.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['%PDF'], 'IR.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/not logged in the agency inbox/)).toBeTruthy();
    expect(screen.getByText(/The store is unavailable/)).toBeTruthy();
  });

  it("shows the project's agency inbox from Communication's store, with triage, and drafts from a letter with that letter pinned", async () => {
    apiRequest.mockImplementation(async (m: string, url: string) => {
      if (url === COMMS_URL) return ok({ success: true, data: [commRow()] });
      if (m === 'PATCH') return ok({ success: true, data: { id: 'ace_1', humanReviewStatus: 'triaged', closureStatus: 'in_progress' } });
      return String(url).startsWith(`/api/c2c/projects/${PID}/sources`) ? ok(SOURCES) : ok({});
    });
    const onAsk = vi.fn();
    render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={onAsk} />);
    expect(await screen.findByText('Agency letter: IR-2026-10-12.pdf')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Draft response with AnA/ }));
    expect((window as { C2C_SOURCE_PINS?: string[] }).C2C_SOURCE_PINS).toEqual(['77']);
    expect(onAsk.mock.calls[0][0]).toMatch(/Agency letter: IR-2026-10-12\.pdf/);
    expect(onAsk.mock.calls[0][0]).toMatch(/no question number or due date the letter does not state/);
    fireEvent.click(screen.getByRole('button', { name: 'Triage' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH', `${COMMS_URL}/ace_1/advance`));
    expect(await screen.findByRole('button', { name: 'Close letter' })).toBeTruthy();
  });

  it('a communication with no linked document is drafted without a pin, and the request says no letter is attached', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === COMMS_URL ? ok({ success: true, data: [commRow({ linkedArtifactIds: [], communicationType: 'Information request' })] }) : ok({}));
    const onAsk = vi.fn();
    render(<ProjectRespond pid={PID} markets={markets([])} onNav={vi.fn()} onAsk={onAsk} />);
    fireEvent.click(await screen.findByRole('button', { name: /Draft response with AnA/ }));
    expect((window as { C2C_SOURCE_PINS?: string[] }).C2C_SOURCE_PINS).toBeUndefined();
    expect(onAsk.mock.calls[0][0]).toMatch(/No document of the letter is linked/);
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

describe('A letter uploaded in Respond names the submission it concerns (gap 6.5, 2026-10-22)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const upload = (container: HTMLElement) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ fileId: 'file_9', sourceId: 77, status: 'ready' }) })));
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['%PDF'], 'IR.pdf', { type: 'application/pdf' })] } });
  };
  const loggedBody = async () => {
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === COMMS_URL)).toBe(true));
    return apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === COMMS_URL)![2];
  };

  it("with the project's only submission, links it, and the person can see and change that", async () => {
    const { container } = render(<ProjectRespond pid={PID} markets={markets([submission(55, 'ONC-221 IND', 'ind', 'fda')])} onNav={vi.fn()} onAsk={vi.fn()} />);
    expect((screen.getByLabelText(/The submission this letter concerns/) as HTMLSelectElement).value).toBe('55');
    upload(container);
    expect((await loggedBody()).linkedSubmissionId).toBe('55');
  });

  it('with several, links none until one is chosen, and the chosen one is also the response sequence\'s market', async () => {
    const onNav = vi.fn();
    const { container } = render(<ProjectRespond pid={PID} markets={markets([submission(55, 'ONC-221 IND', 'ind', 'fda'), submission(56, 'ONC-221 MAA', 'maa', 'eu')])} onNav={onNav} onAsk={vi.fn()} />);
    const picker = screen.getByLabelText(/The submission this letter concerns/) as HTMLSelectElement;
    expect(picker.value).toBe('');
    fireEvent.change(picker, { target: { value: '56' } });
    upload(container);
    expect((await loggedBody()).linkedSubmissionId).toBe('56');
    expect((screen.getByLabelText(/The market the letter came from/) as HTMLSelectElement).value).toBe('56');
    fireEvent.click(screen.getByRole('button', { name: /Start a response sequence/ }));
    expect(consumeNavParams('submission-center')).toEqual({ submissionId: '56', ws: 'sequences', followUp: 'response' });
  });

  it('a letter the person marks as about no submission is logged with none', async () => {
    const { container } = render(<ProjectRespond pid={PID} markets={markets([submission(55, 'ONC-221 IND', 'ind', 'fda')])} onNav={vi.fn()} onAsk={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/The submission this letter concerns/), { target: { value: '' } });
    upload(container);
    expect(await loggedBody()).not.toHaveProperty('linkedSubmissionId');
  });
});
