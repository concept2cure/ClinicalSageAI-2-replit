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
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

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
      // The fallback shape: no official edition installed, so the engine
      // returns a reconstruction and the headers say so honestly. The official
      // path for this same form is exercised further down.
      const h: Record<string, string> = {
        'X-Form-Field-Coverage': '1.000',
        'X-Form-Used-Official-Template': 'false',
        'X-Form-Reconstructed': 'true',
      };
      return { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.7']), json: async () => null, headers: { get: (k: string) => h[k] ?? null } } as unknown as Response;
    }
    if (method === 'POST' && url === '/api/ind-forms/1571/artifact') {
      return { ok: true, status: 201, json: async () => ({ artifactId: 'artifact_indform_1571_x', formId: 'FDA_1571', projectId: 7, ready: false, missingRequired: ['drugName'], contentHash: 'abc' }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  delete (window as any).C2C_PROJECT;
});
afterEach(() => { delete (window as any).C2C_PROJECT; });

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

  it('downloads the streamed FDA PDF and reports the honest render kind + coverage', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-forms/1571/pdf')).toBe(true));
    expect(URL.createObjectURL).toHaveBeenCalled();
    // The tester is told honestly that 1571 is a reconstruction, not the official
    // form, with the coverage — never a bare "rendered by the real engine".
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/reconstruction — NOT the official/)));
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/coverage 1\.000/));
  });

  it('surfaces the regulatory-author role gate honestly', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({ error: 'FORBIDDEN' }) } as Response));
    render(<IndFormsPanel note={vi.fn()} />);
    expect(await screen.findByText('Regulatory-author role required')).toBeTruthy();
  });

  it('saves a governed artifact to the open project’s dossier', async () => {
    (window as any).C2C_PROJECT = { id: 7 };
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/ind-forms/1571/artifact');
      expect(call).toBeTruthy();
      // The project id is threaded from C2C_PROJECT, never guessed.
      expect(call![2]).toMatchObject({ projectId: 7 });
    });
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/saved to the dossier as a governed artifact/)));
  });

  it('a program UUID project takes the audited-unplaced path and the note says exactly that', async () => {
    const uuid = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
    (window as any).C2C_PROJECT = { id: uuid };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ind-forms/') return { ok: true, status: 200, json: async () => ({ forms: ['1571'] }) } as Response;
      if (method === 'POST' && url === '/api/ind-forms/1571/artifact') {
        // The server's audited-unplaced degradation contract (no legacy project
        // row → no registry placement; the audit row IS the record).
        return {
          ok: true, status: 200,
          json: async () => ({ governed: false, audited: true, artifactId: null, formId: 'FDA_1571', projectId: null, programId: uuid, ready: false, missingRequired: ['drugName'], contentHash: 'abc' }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/ind-forms/1571/artifact');
      expect(call).toBeTruthy();
      // The UUID ident is threaded as projectIdent — never coerced to a number.
      expect(call![2]).toMatchObject({ projectIdent: uuid });
      expect(call![2]).not.toHaveProperty('projectId');
    });
    // The note reports the degradation honestly: audit-logged, NOT placed —
    // never "saved to the dossier".
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/audit-logged .*not placed in the dossier registry/)));
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/saved to the dossier/));
  });

  it('does NOT save (or guess a project) when no project is open', async () => {
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /Save to dossier/ })[0]);
    // Toned `'error'`: nothing was saved, so the note must not arrive under the
    // success tick. The panel's `note` prop is `FireToast`, not `(m: string) =>
    // void` — narrowing it there is what silently dropped the tone before.
    await waitFor(() =>
      expect(note).toHaveBeenCalledWith(expect.stringMatching(/Open a project first/), 'error'),
    );
    // No artifact call was made — the panel never invents a project id.
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ind-forms/1571/artifact')).toBe(false);
  });

  it('names the official template and the boxes still left blank on it', async () => {
    // 1571 fills through its XFA datasets packet, so the response is the real
    // FDA form — with boxes the platform deliberately did not write. Reporting
    // only "official template" would imply a finished form.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ind-forms/') return { ok: true, status: 200, json: async () => ({ forms: ['1571'] }) } as Response;
      if (method === 'POST' && url === '/api/ind-forms/1571/pdf') {
        const h: Record<string, string> = {
          'X-Form-Field-Coverage': '0.500',
          'X-Form-Used-Official-Template': 'true',
          'X-Form-Reconstructed': 'false',
          'X-Form-Unmapped': 'ind_type,phase_of_study,us_agent_name',
        };
        return { ok: true, status: 200, blob: async () => new Blob(['%PDF-1.7']), json: async () => null, headers: { get: (k: string) => h[k] ?? null } } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/official FDA template/)));
    expect(note).toHaveBeenCalledWith(expect.stringMatching(/3 box\(es\) left for you to complete/));
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/reconstruction/));
  });

  it('does not claim the PDF arrived when the browser blocked the download', async () => {
    // downloadBlob returns false when the object URL cannot be created. The
    // note used to be fired regardless, so a blocked download read as a
    // delivered form.
    URL.createObjectURL = vi.fn(() => { throw new Error('blocked'); });
    const note = vi.fn();
    render(<IndFormsPanel note={note} />);
    await screen.findByText(/FDA 1571/);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    await waitFor(() =>
      expect(note).toHaveBeenCalledWith(expect.stringMatching(/browser blocked the download/), 'error'),
    );
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/^FDA 1571 PDF:/));
  });
});
