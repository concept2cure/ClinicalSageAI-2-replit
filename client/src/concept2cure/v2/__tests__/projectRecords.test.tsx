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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/* Stubbed at the one network convention (queryClient's apiRequest), so
   useLiveData runs its real code path. */
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  redactInternals: (s: unknown) => s,
  serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getJwtOrgId: () => 1 }));

import { ProjectProtocol, ProjectRecords, useProjectRecords } from '../surfaces/ProjectRecords';

/* The page reads the records once and hands the read to each reader (D3-4, D3.md §4.10). These render that pair. */
function Records({ pid }: { pid: string }) {
  return <ProjectRecords state={useProjectRecords(pid)} />;
}
function RecordsAndProtocol({ pid, available = () => true, onNav = () => {} }: {
  pid: string; available?: (id: string) => boolean; onNav?: (id: string) => void;
}) {
  const state = useProjectRecords(pid);
  return <><ProjectProtocol state={state} available={available} onNav={onNav} /><ProjectRecords state={state} /></>;
}

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
    render(<Records pid={PID} />);
    await waitFor(() => expect(screen.getByText('IND 12345')).toBeTruthy());
    expect(apiRequest.mock.calls[0][1]).toBe(`/api/c2c/projects/${PID}/records`);
    /* Stored values are said by their labels (2026-10-31: it read "ind · fda · draft"). */
    expect(sectionOf('submissions').textContent).toContain('IND · FDA (US) · Draft');
    expect(sectionOf('submissions').textContent).not.toMatch(/\bind\b|\bfda\b/);
    expect(sectionOf('sources').textContent).toContain('CSR-001.pdf');
    expect(sectionOf('sources').textContent).toContain('Client document');
    expect(sectionOf('authoringDocuments').textContent).toContain('Module 2.5 Clinical Overview');
    expect(sectionOf('authoringDocuments').textContent).toContain('Draft');
    expect(sectionOf('studyDesigns').textContent).toContain('A study of Drug X');
    expect(sectionOf('studyDesigns').textContent).toContain('Phase 3');
    expect(sectionOf('filingDocuments').textContent).toContain('IND filing');
    expect(sectionOf('filingDocuments').textContent).not.toMatch(/\bind\b/);
    expect(document.body.textContent).not.toMatch(/_/);
    expect(sectionOf('vaultDocuments').textContent).toMatch(/None in this project yet/);
  });

  /* D3-2a made one card in Project knowledge whose stores were closed disclosures. P-122 (2026-11-10): each store is an
     open section, headed by its name and count, its records shown. */
  it('is one "Records" card whose stores are open sections, each heading saying its count', async () => {
    apiRequest.mockResolvedValue(ok({ projectId: PID, records: {
      sources: section([{ id: 1, title: 'CSR-001.pdf', source_type: 'client_document' }]),
      vaultDocuments: { available: false, rows: [], reason: 'could not be read' },
    } }));
    render(<Records pid={PID} />);
    const card = await screen.findByRole('region', { name: 'Records' });
    await waitFor(() => expect(sectionOf('sources').querySelector('h4')?.textContent).toBe('Data Room sources · 1'));
    expect(sectionOf('vaultDocuments').querySelector('h4')?.textContent).toBe('Vault documents · not available');
    expect(within(sectionOf('sources')).getByText('CSR-001.pdf')).toBeTruthy();
    expect(card.querySelectorAll('details')).toHaveLength(0);
  });

  it('a store it could not read says so, and is never shown as none', async () => {
    apiRequest.mockResolvedValue(ok({
      projectId: PID,
      records: { vaultDocuments: { available: false, rows: [], reason: 'could not be read' } },
    }));
    render(<Records pid={PID} />);
    await waitFor(() => expect(sectionOf('vaultDocuments').textContent).toMatch(/Not available here: could not be read/));
    expect(sectionOf('vaultDocuments').textContent).not.toMatch(/None in this project/);
    // A section the server did not return at all is not "none" either.
    expect(sectionOf('submissions').textContent).toMatch(/Not available here/);
  });

  it('a full page says “the first 200”, never a total it did not count', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Source ${i}`, source_type: 'client_document' }));
    apiRequest.mockResolvedValue(ok({ projectId: PID, records: { sources: section(rows) } }));
    render(<Records pid={PID} />);
    await waitFor(() => expect(sectionOf('sources').textContent).toContain('the first 200'));
  });

  it('a failed read is an error, not an empty project', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) } as unknown as Response);
    render(<Records pid={PID} />);
    await waitFor(() => expect(screen.getByText("Couldn't load the project's records")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/None in this project/);
  });
});

describe('ProjectProtocol — Evidence’s protocol, from the same records read (D3-4)', () => {
  const STUDY = { id: 7, title: '[Demo · Biotech] C2C-101-201 — Phase 2 dose-ranging study in plaque psoriasis', study_phase: 'phase_2', protocol_status: 'draft' };

  it('lists the study designs with phase and status, and opens each work area, with one read for both readers', async () => {
    apiRequest.mockResolvedValue(ok({ projectId: PID, records: { studyDesigns: section([STUDY]) } }));
    const onNav = vi.fn();
    render(<RecordsAndProtocol pid={PID} onNav={onNav} />);
    const protocol = await screen.findByRole('region', { name: 'Protocol' });
    await waitFor(() => expect(within(protocol).getByText(STUDY.title)).toBeTruthy());
    expect(within(protocol).getByText('Phase 2 · Draft')).toBeTruthy();
    fireEvent.click(within(protocol).getByRole('button', { name: /^Open in Study & Protocol Design/ }));
    fireEvent.click(within(protocol).getByRole('button', { name: /^Open Biostatistics/ }));
    expect(onNav.mock.calls.map((c) => c[0])).toEqual(['protocol-dev', 'biostatistics']);
    expect(apiRequest.mock.calls.filter((c) => c[1] === `/api/c2c/projects/${PID}/records`)).toHaveLength(1);
  });

  it('an empty store offers the design door as its one action', async () => {
    apiRequest.mockResolvedValue(ok({ projectId: PID, records: { studyDesigns: section([]) } }));
    render(<RecordsAndProtocol pid={PID} available={(id) => id !== 'biostatistics'} />);
    const protocol = await screen.findByRole('region', { name: 'Protocol' });
    await waitFor(() => expect(within(protocol).getByText('No study design in this project yet.')).toBeTruthy());
    expect(within(protocol).queryByRole('button', { name: /Open Biostatistics/ })).toBeNull();
  });

  it('a store not carried here says its reason, and a failed read is an error, never "none"', async () => {
    apiRequest.mockResolvedValue(ok({ projectId: PID, records: { studyDesigns: { available: false, rows: [], reason: 'the study design store is not provisioned' } } }));
    render(<RecordsAndProtocol pid={PID} />);
    const protocol = await screen.findByRole('region', { name: 'Protocol' });
    await waitFor(() => expect(protocol.textContent).toContain('Not available here: the study design store is not provisioned.'));
    cleanup();
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) } as unknown as Response);
    render(<RecordsAndProtocol pid={PID} />);
    const failed = await screen.findByRole('region', { name: 'Protocol' });
    await waitFor(() => expect(failed.textContent).toContain("Couldn't load the project's study designs"));
    expect(failed.textContent).not.toMatch(/No study design/);
  });
});
