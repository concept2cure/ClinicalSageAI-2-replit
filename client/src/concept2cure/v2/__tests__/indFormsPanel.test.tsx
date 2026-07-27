// @vitest-environment jsdom
/**
 * IndFormsPanel — proves the Module-1 forms panel drives the REAL stateless
 * forms engine (/api/ind-forms): lists the supported forms, builds a field map
 * with only the metadata actually entered (the server's missingRequired is the
 * verdict), downloads the streamed FDA PDF, and surfaces the role gate honestly.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { IndFormsPanel } from '../surfaces/IndFormsPanel';

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url === '/api/ind-forms/') return { ok: true, status: 200, json: async () => ({ forms: ['1571', '1572', '3674'] }) } as Response;
    if (method === 'POST' && url === '/api/ind-forms/1571/build') {
      return { ok: true, status: 200, json: async () => ({ formId: '1571', fields: { sponsorName: body.sponsorName }, missingRequired: ['drugName', 'indication'] }) } as Response;
    }
    if (method === 'POST' && url === '/api/ind-forms/1571/pdf') {
      return { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.7']), json: async () => null, headers: { get: (k: string) => (k === 'X-Form-Field-Coverage' ? '8/14' : null) } } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('IndFormsPanel — real FDA forms engine', () => {
  it('lists the supported forms from the engine', async () => {
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText(/FDA 1571/)).toBeTruthy();
    expect(screen.getByText(/FDA 1572/)).toBeTruthy();
    expect(screen.getByText(/FDA 3674/)).toBeTruthy();
  });

  it('builds with only the entered metadata and renders the server missingRequired verdict', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    // Enter only the sponsor — absent fields must NOT be sent.
    const tb = screen.getAllByRole('textbox');
    fireEvent.change(tb[0], { target: { value: 'ACME Bio' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Build & check/ })[0]);

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/ind-forms/1571/build');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ sponsorName: 'ACME Bio', studyPhase: 'Phase 1' });
      expect(call![2]).not.toHaveProperty('drugName');
      expect(call![2]).not.toHaveProperty('indication');
    });
    expect(await screen.findByText('2 required missing')).toBeTruthy();
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/2 required field/));
  });

  it('downloads the streamed FDA PDF and reports the coverage header', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-forms/1571/pdf')).toBe(true));
    expect(URL.createObjectURL).toHaveBeenCalled();
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/coverage 8\/14/)));
  });

  it('surfaces the regulatory-author role gate honestly', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN' }) } as Response));
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('Regulatory-author role required')).toBeTruthy();
  });
});
