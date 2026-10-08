// @vitest-environment jsdom
/**
 * IndFormsPanel — an attached form is an attachment, not a completion.
 *
 * QA 2026-10-08 (second walk, j7): attaching the product's own unedited 1571
 * and 1572 marked both COMPLETE while Build & check reported required fields
 * missing on each. The server now checks every attachment with the forms
 * engine and records the verdict (rendered_leaf_files.required_fields_missing);
 * the panel sends what the person stated — the same fields Build & check sends
 * — and says, per attachment, whether it completes the form.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const apiUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
  apiUpload,
}));

import { IndFormsPanel } from '../surfaces/IndFormsPanel';

const PROGRAM_UUID = 'e6af0047-33b4-46fa-bde2-73daeb9615df';
const LISTING = {
  forms: ['FDA_1571', 'FDA_1572'],
  renderPlans: [],
  formDefinitions: [{ formId: 'FDA_1571', fields: [
    { id: 'ind_type', options: ['Commercial IND', 'Research IND'] },
    { id: 'phase_of_study', options: ['Phase 1', 'Phase 2'] }] }],
  program: {
    id: PROGRAM_UUID, code: 'PLR-606', name: 'QA-W2J6 Pelorant (IND)', programType: 'IND',
    sponsorName: 'Concept2Cure Therapeutics', productName: 'PLR-606', indication: null, applicationNumber: null,
    formMetadata: { sponsorName: 'Concept2Cure Therapeutics', drugName: 'PLR-606' },
  },
  placements: [] as unknown[],
};
const SUBMISSION = { id: 15, title: 'PLR-606 IND', applicationType: 'ind', primaryRegion: 'fda', status: 'active', programId: PROGRAM_UUID };
const SEQ_0000 = { id: 61, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda' };

function mockProgramListing(placements: unknown[] = []) {
  (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && (url.startsWith('/api/ind-forms/?') || url === '/api/ind-forms/')) {
      return { ok: true, status: 200, json: async () => ({ ...LISTING, placements }) } as Response;
    }
    if (method === 'GET' && url.startsWith('/api/submissions?')) return { ok: true, status: 200, json: async () => [SUBMISSION] } as Response;
    if (method === 'GET' && url === `/api/submissions/${SUBMISSION.id}/sequences`) return { ok: true, status: 200, json: async () => [SEQ_0000] } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  apiUpload.mockReset();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('IndFormsPanel — an attachment is not a completion', () => {
  const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'FDA-1571.pdf', { type: 'application/pdf' });
  async function chooseTarget(seq: { id: number }) {
    const sub = (await screen.findByLabelText('Target submission')) as HTMLSelectElement;
    fireEvent.change(sub, { target: { value: String(SUBMISSION.id) } });
    const seqSelect = (await screen.findByLabelText('Sequence')) as HTMLSelectElement;
    await waitFor(() => expect(seqSelect.options.length).toBeGreaterThan(1));
    fireEvent.change(seqSelect, { target: { value: String(seq.id) } });
  }

  it('sends what the person stated with the attachment, and nothing the record holds', async () => {
    mockProgramListing();
    apiUpload.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ formId: 'FDA_1571', leafId: 12, sectionCode: 'm1.1', sequenceId: 61, sequenceNumber: '0000', requiredFieldsMissing: [], complete: true }),
    } as Response);
    const { container } = render(<IndFormsPanel note={vi.fn()} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: 'Phase 1' } });
    await chooseTarget(SEQ_0000);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [pdf()] } });
    await waitFor(() => expect(apiUpload).toHaveBeenCalled());
    const form = apiUpload.mock.calls[0][2] as FormData;
    expect(form.get('studyPhase')).toBe('Phase 1');
    expect(form.get('sponsorName')).toBeNull();
    expect(form.get('drugName')).toBeNull();
  });

  it('a filed attachment the engine finds incomplete is reported as filed and NOT complete, naming what is missing', async () => {
    mockProgramListing();
    apiUpload.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({
        formId: 'FDA_1571', leafId: 12, sectionCode: 'm1.1', sequenceId: 61, sequenceNumber: '0000',
        requiredFieldsMissing: ['ind_type', 'phase_of_study'], complete: false,
      }),
    } as Response);
    const note = vi.fn();
    const { container } = render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    await chooseTarget(SEQ_0000);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [pdf()] } });
    await waitFor(() => expect(note).toHaveBeenCalled());
    const said = String(note.mock.calls[0][0]);
    expect(said).toMatch(/filed at m1\.1 in sequence 0000/);
    expect(said).toMatch(/not counted as complete/i);
    expect(said).toMatch(/ind_type, phase_of_study/);
    expect(said).not.toMatch(/^Completed FDA/);
  });

  it('each placement says whether it completes the form: complete, not complete (what is missing), or not checked', async () => {
    mockProgramListing([
      { formId: 'FDA_1571', leafId: 12, sectionCode: 'm1.1', sequenceId: 61, sequenceNumber: '0000', fileName: 'a.pdf', sha256: 'a'.repeat(64), byteSize: 2048, requiredFieldsMissing: ['phase_of_study'] },
      { formId: 'FDA_1572', leafId: 13, sectionCode: 'm1.1', sequenceId: 61, sequenceNumber: '0000', fileName: 'b.pdf', sha256: 'b'.repeat(64), byteSize: 2048, requiredFieldsMissing: null },
    ]);
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('attached · not complete')).toBeTruthy();
    expect(screen.getByText(/missing: phase_of_study/)).toBeTruthy();
    expect(screen.getByText('attached · not checked')).toBeTruthy();
    expect(screen.queryByText('completed form filed')).toBeNull();
  });
});

