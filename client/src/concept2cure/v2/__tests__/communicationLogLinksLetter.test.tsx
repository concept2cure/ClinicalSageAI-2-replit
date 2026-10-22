// @vitest-environment jsdom
/**
 * "Log communication" can link a letter already in the project's data room
 * (2026-10-17).
 *
 * Letters filed into the data room before the one-inbox change (b0d7ac7c4)
 * were never logged, and the log form could not attach a document, so a
 * manually logged older letter had nothing for "Draft response with AnA" to
 * pin. The form now offers this project's data-room sources (the Data Room's
 * own read, GET /api/c2c/projects/:id/sources) and writes the same
 * `cre_source:<id>` reference the upload path writes. A source already linked
 * to an inbox item is shown as such and cannot be chosen again. Nothing is
 * inferred from the letter: no due date, issue or urgency.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CommunicationCenter } from '../surfaces/CommunicationCenter';

const PID = '22222222-2222-4222-8222-222222222222';
const COMMS_URL = `/api/concept2cure/projects/${PID}/agency-communications`;
const SOURCES_URL = `/api/c2c/projects/${PID}/sources`;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const ROW = {
  id: 'ace_1', sourceType: 'uploaded_official_correspondence', communicationType: 'Agency letter: IR-2026-10-12.pdf',
  sourceChannel: 'Uploaded in Respond', linkedSectionCodes: [], linkedArtifactIds: ['cre_source:77'],
  receivedDate: '2026-10-16T09:00:00.000Z', urgency: 'medium', responseRequired: true, extractedIssues: [],
  humanReviewStatus: 'pending_review', closureStatus: 'open', auditMetadata: { visibilityTier: 'shared_client_c2c' },
};
const SOURCE = (id: number, title: string) => ({
  id, title, checksum: null, ingestionStatus: 'complete', extractionStatus: 'complete', createdAt: null,
  mimeType: 'application/pdf', fileSize: 10, artifactId: null, origin: null, extractionMethod: null, isCurrent: true,
});
const SUBMISSIONS_URL = `/api/submissions?programId=${PID}`;
const SUB = (id: number, title: string, applicationType: string, primaryRegion: string) => ({
  id, title, productName: null, applicationType, primaryRegion, status: 'active', lifecycleStage: 'original',
});
const posted: Array<Record<string, unknown>> = [];
let sourcesAnswer: () => Response;
let submissionsAnswer: () => Response;
let inboxRows: unknown[];

beforeEach(() => {
  (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
  posted.length = 0;
  sourcesAnswer = () => ok({ sources: [SOURCE(77, 'IR-2026-10-12.pdf'), SOURCE(88, 'FDA advice letter 2026-03.pdf')] });
  submissionsAnswer = () => ok({ success: true, data: [SUB(41, 'ONC-221 IND', 'ind', 'fda'), SUB(42, 'ONC-221 MAA', 'maa', 'eu')] });
  inboxRows = [ROW];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST' && url === COMMS_URL) {
      posted.push(body ?? {});
      return ok({ success: true, data: { ...ROW, ...body, id: 'ace_2' } });
    }
    if (url === COMMS_URL) return ok({ success: true, data: inboxRows });
    if (url === SOURCES_URL) return sourcesAnswer();
    if (url === SUBMISSIONS_URL) return submissionsAnswer();
    return ok({ success: true, data: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

async function openForm() {
  render(<CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={vi.fn()} onNav={vi.fn()} />);
  expect(await screen.findByText('Agency letter: IR-2026-10-12.pdf')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /Log communication/ })[0]);
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Communication type/), { target: { value: 'Advice letter' } });
  fireEvent.change(screen.getByLabelText(/^Source\*?$/), { target: { value: 'uploaded_official_correspondence' } });
  fireEvent.change(screen.getByLabelText(/^Urgency/), { target: { value: 'medium' } });
  fireEvent.change(screen.getByLabelText(/Response required/), { target: { value: 'yes' } });
}

describe('"Log communication" links a letter already in the data room', () => {
  it('offers this project\'s sources, marks one already in the inbox, and writes the upload path\'s reference', async () => {
    await openForm();
    const picker = (await screen.findByLabelText(/Letter in the data room/)) as HTMLSelectElement;
    await waitFor(() => expect(picker.querySelector('option[value="88"]')).toBeTruthy());
    const linked = picker.querySelector('option[value="77"]') as HTMLOptionElement;
    expect(linked.disabled).toBe(true);
    expect(linked.textContent).toMatch(/already in the inbox/);
    expect((picker.querySelector('option[value="88"]') as HTMLOptionElement).disabled).toBe(false);

    fillRequired();
    fireEvent.change(picker, { target: { value: '88' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Log communication$/ }).at(-1)!);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].linkedArtifactIds).toEqual(['cre_source:88']);
    // Nothing read off the letter: no due date, no issue, the urgency the person chose.
    expect(posted[0].dueDate).toBeUndefined();
    expect(posted[0].extractedIssues).toEqual([]);
    expect(posted[0].urgency).toBe('medium');
  });

  it('links nothing when no letter is chosen', async () => {
    await openForm();
    await screen.findByLabelText(/Letter in the data room/);
    fillRequired();
    fireEvent.click(screen.getAllByRole('button', { name: /^Log communication$/ }).at(-1)!);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].linkedArtifactIds ?? []).toEqual([]);
  });

  it('says the data room could not be read rather than that it holds no letters', async () => {
    sourcesAnswer = () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'down' } }) }) as Response;
    await openForm();
    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(screen.queryByText(/no sources/i)).toBeNull();
  });
});

describe('"Log communication" names the submission the letter concerns (gap 6.5, 2026-10-22)', () => {
  it("offers this project's submissions and sends the one chosen", async () => {
    await openForm();
    const picker = (await screen.findByLabelText(/Submission it concerns/)) as HTMLSelectElement;
    await waitFor(() => expect(picker.querySelector('option[value="41"]')?.textContent).toBe('ONC-221 IND (IND, FDA)'));
    fillRequired();
    fireEvent.change(picker, { target: { value: '42' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Log communication$/ }).at(-1)!);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].linkedSubmissionId).toBe('42');
  });

  it('sends no submission when none is chosen', async () => {
    await openForm();
    await screen.findByLabelText(/Submission it concerns/);
    fillRequired();
    fireEvent.click(screen.getAllByRole('button', { name: /^Log communication$/ }).at(-1)!);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty('linkedSubmissionId');
  });

  it("says the project's submissions could not be read rather than that it has none", async () => {
    submissionsAnswer = () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'down' } }) }) as Response;
    await openForm();
    expect(await screen.findByText(/submissions could not be read, so none can be named now/)).toBeTruthy();
    expect(screen.queryByText(/has no submission yet/)).toBeNull();
  });

  it('shows on the card the submission a letter concerns, and says when a stored one names none of this project\u2019s', async () => {
    inboxRows = [
      { ...ROW, linkedSubmissionId: '41', linkedSubmission: { id: 41, title: 'ONC-221 IND', applicationType: 'ind', primaryRegion: 'fda' } },
      { ...ROW, id: 'ace_9', communicationType: 'Older letter', linkedArtifactIds: [], linkedSubmissionId: 'IND 123456', linkedSubmission: null },
    ];
    render(<CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={vi.fn()} onNav={vi.fn()} />);
    expect(await screen.findByText(/concerns ONC-221 IND \(IND, FDA\)/)).toBeTruthy();
    expect(screen.getByText(/the submission it names is not one of this project\u2019s/)).toBeTruthy();
  });
});
