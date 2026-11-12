// @vitest-environment jsdom
/**
 * The data catalog lists the Vault's documents beside the captures (S2, 2026-11-11): organized under the same
 * facet, graded, and used in a project through the project's own evidence route.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { DataRoomSourcesPanel } from '../DataRoomSourcesPanel';

const P = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const grade = { grade: 'B', score: 82, cap: null, engine: 'data-room-grade v1', gradedAt: '2026-11-11T00:00:00.000Z',
  basis: [{ criterion: 'integrity', points: 15, max: 20, detail: 'original bytes held; the same bytes are filed in Vault; fixity not yet checked.' }] };
const capture = (id: number, over: Record<string, unknown> = {}) => ({ id, title: `Capture ${id}`, checksum: null, extractionStatus: 'extracted', textAvailable: true,
  extractionMethod: 'text', isCurrent: true, dataEligible: true, originalFileAvailable: true, projectId: P, projectName: 'Open project', ...over });
const vaultDoc = (over: Record<string, unknown> = {}) => ({ documentId: DOC, projectId: OTHER, projectName: 'Other project', title: 'Protocol v3', fileName: 'protocol.pdf',
  mimeType: 'application/pdf', fileSize: 2048, version: '3.0', createdAt: '2026-11-01T00:00:00.000Z', checksum: 'a'.repeat(64), folder: 'module-5',
  folderLabel: 'Module 5 · Clinical', ctdSection: '5.3.5.1', evidenceKind: 'protocol', placementStatus: 'confirmed', originalFileAvailable: true, textAvailable: true, grade, ...over });
const page = (over: Record<string, unknown> = {}) => ({ projectId: P, scope: 'catalog', catalogProjects: 2, total: 2, currentTotal: 2,
  page: { limit: 50, offset: 0 }, window: { shown: 2, truncated: false },
  facets: { project: [], study: [], kind: [], ctd: [], folder: [{ value: 'module-5', label: 'Module 5 · Clinical', count: 2 }] },
  sources: [capture(1, { suggestedFolder: 'module-5' }), capture(2, { title: 'Supplier: Quorvex', catalog: { nativeRecord: { workArea: 'quality', sourceScope: 'organization', kind: 'qms_suppliers', id: '9', lifecycle: 'qualified', version: null } } })],
  vault: { total: 1, documents: [vaultDoc()] }, ...over });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

let pins: Array<Record<string, unknown>>;
let sourcesPage: Record<string, unknown>;
beforeEach(() => {
  pins = []; sourcesPage = page();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (url.endsWith('/evidence') && method === 'GET') return json({ evidence: pins });
    if (url.endsWith('/evidence') && method === 'POST') {
      pins = [{ id: 31, evidence_kind: body?.evidenceKind, evidence_ref: body?.evidenceRef, title: 'Protocol v3', pinned_at: '2026-11-11T00:00:00.000Z',
        vault: { documentId: DOC, projectId: OTHER, projectName: 'Other project', isCurrent: true } }];
      return json(pins[0], 201);
    }
    if (method === 'DELETE') { pins = []; return new Response(null, { status: 204 }); }
    return { ok: true, status: 200, json: async () => sourcesPage };
  });
});
afterEach(() => cleanup());

describe('the data catalog with the Vault\'s documents', () => {
  it('lists them under the same folder as the captures: files, then Vault documents, then Quality records last', async () => {
    render(<DataRoomSourcesPanel programId={P} initialScope="catalog" />);
    const vault = await screen.findByTestId('data-room-vault-entry');
    expect(within(vault).getByText('Protocol v3')).toBeTruthy();
    expect(within(vault).getByTestId('source-grade').textContent).toBe('Grade B · 82');
    expect(vault.textContent).toMatch(/In Vault · Readable · Other project/);
    expect(vault.textContent).toMatch(/Protocol · CTD 5\.3\.5\.1 · folder Module 5 · Clinical · filing confirmed/);
    expect(screen.getByRole('status').textContent).toMatch(/2 matching sources · showing 2\. 1 Vault document · showing 1\./);
    // Organized by Vault folder by default: the capture and the Vault document share "Module 5 · Clinical".
    const groups = screen.getAllByTestId('data-room-group');
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual(['Module 5 · Clinical', 'Not described yet']);
    expect(within(groups[0]).getByText('Capture 1')).toBeTruthy();
    expect(within(groups[0]).getByTestId('data-room-vault-entry')).toBeTruthy();
    expect(within(groups[1]).getByText('Supplier: Quorvex')).toBeTruthy();
  });

  it('uses a Vault document in this project and removes it, through the project\'s evidence route', async () => {
    render(<DataRoomSourcesPanel programId={P} initialScope="catalog" />);
    const vault = await screen.findByTestId('data-room-vault-entry');
    fireEvent.click(await within(vault).findByRole('button', { name: /Use in this project/ }));
    await within(vault).findByText('Used in this project');
    const post = apiRequest.mock.calls.find(c => c[0] === 'POST');
    expect(post?.[1]).toBe(`/api/c2c/projects/${P}/evidence`);
    expect(post?.[2]).toMatchObject({ evidenceKind: 'vault_doc', evidenceRef: DOC });
    fireEvent.click(within(vault).getByRole('button', { name: 'Remove' }));
    await within(vault).findByRole('button', { name: /Use in this project/ });
    expect(apiRequest.mock.calls.some(c => c[0] === 'DELETE' && c[1] === `/api/c2c/projects/${P}/evidence/31`)).toBe(true);
  });

  it('lists a used Vault document first in the project\'s own room, with where it is from', async () => {
    pins = [{ id: 31, evidence_kind: 'vault_doc', evidence_ref: DOC, title: 'Protocol v3', pinned_at: '2026-11-11T00:00:00.000Z',
      vault: { documentId: DOC, projectId: OTHER, projectName: 'Other project', isCurrent: false } }];
    sourcesPage = page({ scope: undefined, facets: undefined, vault: undefined });
    render(<DataRoomSourcesPanel programId={P} />);
    const used = await screen.findByTestId('data-room-used');
    expect(used.textContent).toMatch(/Protocol v3/);
    expect(used.textContent).toMatch(/From the Vault of Other project · superseded: a later version replaced it/);
    expect(screen.queryByTestId('data-room-vault-entry')).toBeNull();
  });

  it('says so when the Vault\'s documents could not be listed, and still lists the captures', async () => {
    sourcesPage = page({ vault: undefined, vaultUnavailable: true });
    render(<DataRoomSourcesPanel programId={P} initialScope="catalog" />);
    await screen.findByText('Capture 1');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/The Vault’s documents could not be listed\./));
    expect(screen.queryByTestId('data-room-vault-entry')).toBeNull();
  });
});
