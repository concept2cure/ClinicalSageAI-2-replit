// @vitest-environment jsdom
/**
 * The Module 3 Evidence drawer (CmcSectionEvidence.tsx): the records a section
 * reads, the Vault document each was taken from, and what became of it.
 *
 *   - a superseded linked version is named as superseded, with what to do;
 *   - a link is sent with the record, the chosen version and the reason, and
 *     the read is reloaded; a refusal is shown in the server's words, saying
 *     nothing was changed;
 *   - the link cannot be sent without a version and a stated reason;
 *   - a failed read is an error, never "no records".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SectionEvidence, type EvidenceSourceRow } from '../surfaces/CmcSectionEvidence';

const PROGRAM = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BASE = `/api/cmc/module3-os/source-evidence/${PROGRAM}`;

const BATCH: EvidenceSourceRow = {
  sourceObjectId: 'so-1',
  sourceType: 'batch',
  sourceKey: 'batch:1',
  label: 'batch DP-001',
  evidence: [
    {
      id: 'link-1', sourceKey: 'batch:1', documentId: 'doc-v1', title: 'CoA DP-001', version: '1.0',
      contentHash: 'a'.repeat(64), state: 'superseded', currentVersion: '2.0',
      reason: 'Values transcribed from the CDMO certificate of analysis.', linkedAt: '2026-10-05T01:00:00Z', linkedBy: 'Cora Evidence',
    },
  ],
};
const STABILITY: EvidenceSourceRow = { sourceObjectId: 'so-2', sourceType: 'stability', sourceKey: 'stability:2', label: 'stability DP long-term', evidence: [] };
const DOCS = [
  { documentId: 'doc-v2', title: 'CoA DP-001', version: '2.0', ctdSection: '3.2.P.5.4', documentType: 'OTHER', documentKind: 'certificate of analysis' },
  { documentId: 'doc-stab', title: 'Stability report', version: '1.0', ctdSection: '3.2.P.8.3', documentType: 'OTHER', documentKind: null },
];

const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => ({ success: true, data }) }) as Response;
const refused = (status: number, body: unknown) => ({ ok: false, status, json: async () => body }) as Response;

let sourcesRead: 'ok' | 'failed' = 'ok';
let linkAnswer: Response = ok({ id: 'link-2', moved: ['link-1'] }, 201);

beforeEach(() => {
  sourcesRead = 'ok';
  linkAnswer = ok({ id: 'link-2', moved: ['link-1'] }, 201);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST') return linkAnswer;
    if (url === `${BASE}/documents`) return ok(DOCS);
    if (url.startsWith(`${BASE}?sectionKey=`)) {
      return sourcesRead === 'failed' ? refused(500, { message: 'The records could not be read.' }) : ok([BATCH, STABILITY]);
    }
    return refused(404, {});
  });
});
afterEach(cleanup);

const open = (onChanged = vi.fn()) =>
  render(<SectionEvidence projectId={PROGRAM} sectionKey="3.2.P.5.4" sectionLabel="Batch Analyses" onClose={() => {}} onChanged={onChanged} />);
const sectionReads = () => apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && String(u).startsWith(`${BASE}?sectionKey=`)).length;

describe('the Evidence drawer', () => {
  it('names a superseded linked version and says what to do about it', async () => {
    open();
    const batch = await screen.findByTestId('m3-evidence-record-batch:1');
    expect(within(batch).getByText('superseded')).toBeTruthy();
    expect(batch.textContent).toContain('CoA DP-001 — version 1.0');
    expect(batch.textContent).toMatch(/Version 2\.0 has replaced it\. Verify this record against the current version/);
    expect(batch.textContent).toContain('Cora Evidence');
    expect(screen.getByTestId('m3-evidence-record-stability:2').textContent).toContain('No Vault document is linked to this record.');
  });

  it('sends the record, the chosen version and the reason, then reloads', async () => {
    const onChanged = vi.fn();
    open(onChanged);
    const stab = await screen.findByTestId('m3-evidence-record-stability:2');
    fireEvent.click(within(stab).getByText(/Link Vault document/));
    const form = await screen.findByTestId('m3-evidence-link-form-stability:2');
    const submit = within(form).getByText(/Link document/).closest('button')!;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Vault document it was taken from/), { target: { value: 'doc-stab' } });
    fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: 'short' } });
    expect(submit.disabled, 'a reason under the floor').toBe(true);
    fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: 'Stability data taken from the 6-month report.' } });
    expect(submit.disabled).toBe(false);
    const readsBefore = sectionReads();
    fireEvent.click(submit);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', BASE, {
      sourceKey: 'stability:2', documentId: 'doc-stab', reason: 'Stability data taken from the 6-month report.',
    }));
    await waitFor(() => expect(sectionReads()).toBeGreaterThan(readsBefore));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText('Linked to stability DP long-term.')).toBeTruthy();
  });

  it('shows a refusal in the server’s words, and that nothing was changed', async () => {
    linkAnswer = refused(409, { error: 'DOCUMENT_SUPERSEDED', message: 'A later version of that document is in the Vault (version 2.0). Link the current version.' });
    const onChanged = vi.fn();
    open(onChanged);
    const stab = await screen.findByTestId('m3-evidence-record-stability:2');
    fireEvent.click(within(stab).getByText(/Link Vault document/));
    const form = await screen.findByTestId('m3-evidence-link-form-stability:2');
    fireEvent.change(within(form).getByLabelText(/Vault document it was taken from/), { target: { value: 'doc-stab' } });
    fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: 'Stability data taken from the report.' } });
    fireEvent.click(within(form).getByText(/Link document/));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Nothing was changed — A later version of that document is in the Vault (version 2.0). Link the current version.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('reports a failed read as an error, never as "no records"', async () => {
    sourcesRead = 'failed';
    open();
    expect(await screen.findByText('Couldn’t load this section’s records')).toBeTruthy();
    expect(screen.queryByText(/No CMC records feed this section yet/)).toBeNull();
  });
});
