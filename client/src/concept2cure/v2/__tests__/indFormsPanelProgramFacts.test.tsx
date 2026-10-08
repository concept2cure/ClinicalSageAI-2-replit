// @vitest-environment jsdom
/**
 * IndFormsPanel — the sponsor address and the IND type are recorded on the
 * program (P-20 follow-up, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * Form FDA 1571 requires both, and no program column held either, so the panel
 * sent them with every build (QA 2026-10-08, j7 finding 3c) and the program
 * record never knew them. They are now regulatory_programs.sponsor_address /
 * ind_type (migrations/20261008b_regulatory_programs_sponsor_address_ind_type.sql):
 * the panel shows the recorded pair, saves an edit with "Save to program"
 * (PUT /api/ind-forms/program-facts), and every build reads the record — so with
 * a program open a build sends neither. Only the transport is replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
  apiUpload: vi.fn(),
}));

import { IndFormsPanel } from '../surfaces/IndFormsPanel';

const PROGRAM_UUID = '709edd20-9af6-41e7-a206-c00ecb4671b9';
const isListing = (url: string) => url.startsWith('/api/ind-forms/?') || url === '/api/ind-forms/';

/* GET /api/ind-forms/?projectIdent=… for an IND program, as the server answers
   it: the registry's IND type and phase options, and the program record. */
const LISTING = {
  forms: ['FDA_1571'],
  renderPlans: [],
  formDefinitions: [{ formId: 'FDA_1571', fields: [
    { id: 'ind_type', options: ['Commercial IND', 'Research IND', 'Emergency Use IND', 'Treatment IND'] },
    { id: 'phase_of_study', options: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'] }] }],
  program: {
    id: PROGRAM_UUID, code: 'BX-512', name: 'Vorelinib · KIT-mutant GIST (IND)', programType: 'IND',
    sponsorName: 'Concept2Cure Therapeutics', productName: 'Vorelinib · BX-512',
    indication: 'KIT-mutant gastrointestinal stromal tumor · 4L+', applicationNumber: '000512',
    sponsorAddress: null as string | null, indType: null as string | null,
    formMetadata: { sponsorName: 'Concept2Cure Therapeutics', drugName: 'Vorelinib · BX-512', indNumber: '000512' },
  },
  placements: [],
};

function mockProgramListing(overrides: Partial<typeof LISTING> = {}) {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && isListing(url)) return { ok: true, status: 200, json: async () => ({ ...LISTING, ...overrides }) } as Response;
    if (method === 'POST' && url.endsWith('/build')) {
      return { ok: true, status: 200, json: async () => ({ formId: 'FDA_1571', fields: {}, missingRequired: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

beforeEach(() => apiRequest.mockReset());
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('IndFormsPanel — the sponsor address and IND type are recorded on the program', () => {
  /* P-20 follow-up (docs/LAUNCH_DEFINITION_OF_DONE.md): the sponsor address
     and the IND type are stored on the program, and the 1571 build reads them
     from the record. They used to be sent with each build (QA j7, finding 3c),
     so the recorded program never held them. */
  it('with a program open, the recorded sponsor address and IND type are shown, and a build sends neither — the record is the source', async () => {
    mockProgramListing({ program: { ...LISTING.program, sponsorAddress: '1 Main St, Boston MA 02110, US', indType: 'Commercial IND' } } as never);
    render(<IndFormsPanel note={vi.fn()} />);
    await screen.findByText(/FDA 1571/);
    expect((screen.getByLabelText('Sponsor address') as HTMLInputElement).value).toBe('1 Main St, Boston MA 02110, US');
    expect((screen.getByLabelText('IND type') as HTMLSelectElement).value).toBe('Commercial IND');
    fireEvent.change(screen.getByLabelText('Phase'), { target: { value: 'Phase 2' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Build & check/ })[0]);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => String(c[1]).endsWith('/build'))).toBe(true));
    const body = apiRequest.mock.calls.find((c) => String(c[1]).endsWith('/build'))![2];
    expect(body).toMatchObject({ projectIdent: PROGRAM_UUID, studyPhase: 'Phase 2' });
    expect(body).not.toHaveProperty('sponsor');
    expect(body).not.toHaveProperty('indType');
    expect(body).not.toHaveProperty('sponsorAddress');
  });

  it('"Save to program" records the sponsor address and IND type on the program, then re-reads the record', async () => {
    mockProgramListing();
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    const save = screen.getByRole('button', { name: 'Save to program' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sponsor address'), { target: { value: '1 Main St, Boston MA 02110, US' } });
    fireEvent.change(screen.getByLabelText('IND type'), { target: { value: 'Commercial IND' } });
    // Until saved, the panel says the forms read the record, not the edit.
    expect(screen.getByText(/Not saved\. The forms read the program’s recorded sponsor address and IND type/)).toBeTruthy();
    expect(save.disabled).toBe(false);
    const listingsBefore = apiRequest.mock.calls.filter((c) => c[0] === 'GET' && isListing(String(c[1]))).length;
    fireEvent.click(save);
    await waitFor(() => {
      const put = apiRequest.mock.calls.find((c) => c[0] === 'PUT' && c[1] === '/api/ind-forms/program-facts');
      expect(put).toBeTruthy();
      expect(put![2]).toEqual({ projectIdent: PROGRAM_UUID, sponsorAddress: '1 Main St, Boston MA 02110, US', indType: 'Commercial IND' });
    });
    await waitFor(() => expect(note).toHaveBeenCalledWith('Sponsor address and IND type saved to the program record.'));
    await waitFor(() => expect(apiRequest.mock.calls.filter((c) => c[0] === 'GET' && isListing(String(c[1]))).length).toBeGreaterThan(listingsBefore));
  });

  it('a refused save says why, in the server\'s words, as an error', async () => {
    mockProgramListing();
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'PUT' && url === '/api/ind-forms/program-facts') {
        return { ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION', message: 'IND type must be one of Commercial IND, Research IND, Emergency Use IND, Treatment IND.' } }) } as Response;
      }
      return base(method, url, body);
    });
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.change(screen.getByLabelText('Sponsor address'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to program' }));
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/^Couldn’t save to the program record — IND type must be one of/), 'error'));
  });

  it('a program that is not an IND has no IND type to record', async () => {
    mockProgramListing({ program: { ...LISTING.program, programType: 'NDA' } } as never);
    render(<IndFormsPanel note={vi.fn()} />);
    await screen.findByText(/FDA 1571/);
    expect(screen.queryByLabelText('IND type')).toBeNull();
    fireEvent.change(screen.getByLabelText('Sponsor address'), { target: { value: '1 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to program' }));
    await waitFor(() => {
      const put = apiRequest.mock.calls.find((c) => c[0] === 'PUT' && c[1] === '/api/ind-forms/program-facts');
      expect(put![2]).toEqual({ projectIdent: PROGRAM_UUID, sponsorAddress: '1 Main St' });
    });
  });
});
