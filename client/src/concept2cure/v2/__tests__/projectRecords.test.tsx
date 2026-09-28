// @vitest-environment jsdom
/**
 * ProjectRecords — from the project, every record anchored to it (PF-17).
 *
 * The panel reads GET /api/c2c/projects/:id/records and lists each store's
 * records under its own heading. What it must never do: show a store it could
 * not read as "none", or show the server's 200-row page as a total.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/* Stubbed at the one network convention (queryClient's apiRequest), so
   useLiveData runs its real code path. */
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  redactInternals: (s: unknown) => s,
  serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getJwtOrgId: () => 1 }));

import { ProjectRecords } from '../surfaces/ProjectRecords';

const PID = '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const section = (rows: Record<string, unknown>[]) => ({ available: true, rows });

const sectionOf = (key: string) => document.querySelector(`[data-records-section="${key}"]`) as HTMLElement;

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('ProjectRecords', () => {
  it('reads the project’s records and lists each store under its own heading', async () => {
    apiRequest.mockResolvedValue(ok({
      projectId: PID,
      records: {
        submissions: section([{ id: 7, title: 'IND 12345', application_type: 'ind', primary_region: 'fda', status: 'draft' }]),
        sources: section([{ id: 1, title: 'CSR-001.pdf', source_type: 'client_document' }]),
        authoringDocuments: section([{ id: 'a1', title: 'Module 2.5 Clinical Overview', status: 'draft' }]),
        vaultDocuments: section([]),
        studyDesigns: section([{ id: 'sd_1', title: 'A study of Drug X', study_phase: '3' }]),
        filingDocuments: section([{ id: 'doc_ind_1', title: 'IND filing', doc_type: 'ind' }]),
      },
    }));
    render(<ProjectRecords pid={PID} />);
    await waitFor(() => expect(screen.getByText('IND 12345')).toBeTruthy());
    expect(apiRequest.mock.calls[0][1]).toBe(`/api/c2c/projects/${PID}/records`);
    expect(sectionOf('submissions').textContent).toContain('ind · fda · draft');
    expect(sectionOf('sources').textContent).toContain('CSR-001.pdf');
    expect(sectionOf('authoringDocuments').textContent).toContain('Module 2.5 Clinical Overview');
    expect(sectionOf('studyDesigns').textContent).toContain('A study of Drug X');
    expect(sectionOf('filingDocuments').textContent).toContain('IND filing');
    expect(sectionOf('vaultDocuments').textContent).toMatch(/None in this project yet/);
  });

  it('a store it could not read says so, and is never shown as none', async () => {
    apiRequest.mockResolvedValue(ok({
      projectId: PID,
      records: { vaultDocuments: { available: false, rows: [], reason: 'could not be read' } },
    }));
    render(<ProjectRecords pid={PID} />);
    await waitFor(() => expect(sectionOf('vaultDocuments').textContent).toMatch(/Not available here: could not be read/));
    expect(sectionOf('vaultDocuments').textContent).not.toMatch(/None in this project/);
    // A section the server did not return at all is not "none" either.
    expect(sectionOf('submissions').textContent).toMatch(/Not available here/);
  });

  it('a full page says “the first 200”, never a total it did not count', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Source ${i}`, source_type: 'client_document' }));
    apiRequest.mockResolvedValue(ok({ projectId: PID, records: { sources: section(rows) } }));
    render(<ProjectRecords pid={PID} />);
    await waitFor(() => expect(sectionOf('sources').textContent).toContain('the first 200'));
  });

  it('a failed read is an error, not an empty project', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) } as unknown as Response);
    render(<ProjectRecords pid={PID} />);
    await waitFor(() => expect(screen.getByText("Couldn't load the project's records")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/None in this project/);
  });
});
