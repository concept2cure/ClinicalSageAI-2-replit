// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProjectFilesPanel } from '../ProjectFilesPanel';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { clearShellProject, publishShellProject } from '../../shellProject';

const programId = '11111111-1111-4111-8111-111111111111';
const workingId = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
/** A Vault version id is a uuid; source intake refuses anything else as no saved source (8c86a44a3). */
const sourceId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hit = (n: number) => ({ id: sourceId(n), title: `Protocol source ${n}`, fileName: `protocol-${n}.docx`,
  documentType: 'Protocol', size: null, folderId: null, ctdSection: null, placementStatus: 'unfiled', snippet: null,
  originalFileAvailable: true, current: true, disposition: 'keep_data' });
const firstPage = Array.from({ length: 25 }, (_, n) => hit(n + 1));
const offsetOf = (url: string) => Number(new URL(url, 'https://example.test').searchParams.get('offset') ?? 0);
function setup(onOpenDocument = vi.fn()) {
  render(<ProjectFilesPanel programId={programId} programName="IND project" fireToast={vi.fn()} onOpenDocument={onOpenDocument} />);
  fireEvent.change(screen.getByLabelText('Search the project vault'), { target: { value: 'Protocol' } });
  return onOpenDocument;
}
/* Source intake is the signed-in member's, in the open project (8c86a44a3,
   SOURCE_INTAKE_OWNERSHIP_2026-10-23.md): a session, the shell project, and a
   working copy whose recorded owner, tenant, project and source are the ones
   asked for. The same fixture as sourceImportDialog.test.tsx. */
const token = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(token, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  publishShellProject({ id: programId }); apiRequest.mockReset();
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); });

describe('all matching Vault sources remain reachable in the existing editor', () => {
  it('loads later matches and imports the exact selected source through the existing working-copy dialog', async () => {
    apiRequest.mockImplementation(async (method: string, url: string, body?: { source: { documentId: string } }) => {
      if (method === 'POST') {
        const origin = { kind: 'vault', id: body!.source.documentId, programId, title: 'Protocol source 26', fileName: 'protocol-26.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', documentType: 'Protocol', sectionCode: null,
          sha256: 'a'.repeat(64), conversion: 'docx-structure' };
        return ok({ doc: { id: workingId, title: 'Working protocol', tenant_id: 12, client_program_id: programId, created_by: 7, status: 'DRAFT',
          provenance: { source: 'import', importSource: { ...origin, reason: 'Revise protocol criteria', warnings: [] } } },
        sections: [{ id: '33333333-3333-4333-8333-333333333333', doc_id: workingId, tenant_id: 12, code: 'source.1', title: 'Protocol',
          content: 'Saved protocol', order_index: 0 }], warnings: [], reused: false, origin });
      }
      return ok(url.includes('/search?') ? { results: offsetOf(url) === 0 ? firstPage : [hit(26)], total: 26 }
        : { tree: [], documentCount: 0 });
    });
    const onOpenDocument = setup();
    await screen.findByText(hit(1).title);
    fireEvent.click(screen.getByRole('button', { name: 'More results' }));
    fireEvent.click(await screen.findByText(hit(26).title));
    expect(screen.getByText('26 of 26 matches')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Work on document' }));
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Revise protocol criteria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open working copy' }));
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/import/source', {
      programId, source: { kind: 'vault', documentId: sourceId(26) }, reason: 'Revise protocol criteria',
    }, { Authorization: `Bearer ${token}`, 'x-organization-id': '12' });
    expect(onOpenDocument).toHaveBeenCalledWith(workingId);
  });

  it('retains loaded matches after a later-page failure and retries that same page', async () => {
    let laterRequests = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/search?')) return ok({ tree: [], documentCount: 0 });
      if (offsetOf(url) === 0) return ok({ results: firstPage, total: 26 });
      laterRequests += 1;
      return laterRequests === 1 ? { ok: false, status: 503, json: async () => ({ message: 'Search temporarily unavailable' }) }
        : ok({ results: [hit(26)], total: 26 });
    });
    setup();
    await screen.findByText(hit(1).title);
    fireEvent.click(screen.getByRole('button', { name: 'More results' }));
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText(hit(1).title)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(hit(26).title);
    expect(laterRequests).toBe(2);
    const searchOffsets = apiRequest.mock.calls.filter(([, url]) => url.includes('/search?')).map(([, url]) => offsetOf(url));
    expect(searchOffsets).toEqual([0, 25, 25]);
  });

  it('refreshes a changed result set instead of silently consuming an overlapping final page', async () => {
    let refreshed = false;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/search?')) return ok({ tree: [], documentCount: 0 });
      if (offsetOf(url) > 0) { refreshed = true; return ok({ results: [hit(25)], total: 26 }); }
      return ok({ results: refreshed ? [hit(26)] : firstPage, total: refreshed ? 1 : 26 });
    });
    setup();
    await screen.findByText(hit(1).title);
    fireEvent.click(screen.getByRole('button', { name: 'More results' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh search' }));
    await screen.findByText(hit(26).title);
    expect(screen.getByText('1 of 1 match')).toBeTruthy();
  });

  it('holds duplicate page requests until the pending read completes', async () => {
    let finish!: (response: ReturnType<typeof ok>) => void;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/search?')) return ok({ tree: [], documentCount: 0 });
      return offsetOf(url) === 0 ? ok({ results: firstPage, total: 26 }) : new Promise(resolve => { finish = resolve; });
    });
    setup();
    await screen.findByText(hit(1).title);
    const more = screen.getByRole('button', { name: 'More results' });
    fireEvent.click(more); fireEvent.click(more);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(apiRequest.mock.calls.filter(([, url]) => url.includes('/search?') && offsetOf(url) > 0)).toHaveLength(1);
    finish(ok({ results: [hit(26)], total: 26 }));
    await screen.findByText(hit(26).title);
  });
});

describe('unconfirmed search responses remain failures', () => {
  it.each([
    { results: [] }, { results: [], total: 2 }, { results: [hit(1), hit(1)], total: 2 },
  ])('offers retry rather than claiming an empty or complete search for %j', async data => {
    apiRequest.mockImplementation(async (_method: string, url: string) => ok(url.includes('/search?') ? data : { tree: [], documentCount: 0 }));
    setup();
    await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText('No matches')).toBeNull();
    expect(screen.queryByText(hit(1).title)).toBeNull();
  });
});

describe('search results stay with their current query and recorded eligibility', () => {
  it('hides the earlier query while a new search is pending', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/search?')) return ok({ tree: [], documentCount: 0 });
      if (url.includes('q=Protocol')) return ok({ results: [hit(1)], total: 1 });
      return new Promise(() => {});
    });
    setup();
    await screen.findByText(hit(1).title);
    fireEvent.change(screen.getByLabelText('Search the project vault'), { target: { value: 'Investigator' } });
    await waitFor(() => expect(screen.queryByText(hit(1).title)).toBeNull());
  });

  it('ignores a later page that completes after the search query changes', async () => {
    let finish!: (response: ReturnType<typeof ok>) => void;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/search?')) return ok({ tree: [], documentCount: 0 });
      if (url.includes('q=Investigator')) return ok({ results: [{ ...hit(30), title: 'Investigator brochure' }], total: 1 });
      if (offsetOf(url) > 0) return new Promise(resolve => { finish = resolve; });
      return ok({ results: firstPage, total: 26 });
    });
    setup();
    await screen.findByText(hit(1).title);
    fireEvent.click(screen.getByRole('button', { name: 'More results' }));
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    fireEvent.change(screen.getByLabelText('Search the project vault'), { target: { value: 'Investigator' } });
    await screen.findByText('Investigator brochure');
    finish(ok({ results: [hit(26)], total: 26 }));
    await waitFor(() => expect(screen.queryByText(hit(26).title)).toBeNull());
    expect(screen.getByText('1 of 1 match')).toBeTruthy();
  });

  it('uses newer search availability when the same file is also in the earlier Vault tree', async () => {
    // The tree keys an upload `up-<uuid>` (server uploadLeaf) and a search hit is
    // the bare uuid. The fixture used to give both the same id, which hid that a
    // hit never met its tree row: no checksum, so a found file could not be cited.
    const old = { ...hit(1), id: `up-${sourceId(1)}`, num: '', type: 'Protocol', status: 'unfiled', pct: null, owner: '', ver: '', updated: '',
      preview: '', src: 'upload', docId: sourceId(1), hash: 'a'.repeat(64) };
    apiRequest.mockImplementation(async (_method: string, url: string) => ok(url.includes('/search?')
      ? { results: [{ ...hit(1), originalFileAvailable: false }], total: 1 } : { tree: [old], documentCount: 1 }));
    setup();
    const results = await screen.findByRole('region', { name: 'Search results' });
    fireEvent.click(await within(results).findByText(hit(1).title));
    const work = screen.getByRole('button', { name: 'Work on document' }) as HTMLButtonElement;
    expect(work.disabled).toBe(true);
    expect(screen.getByTestId('pf-selected').textContent).toContain('original file is unavailable');
    expect(screen.getByTestId('pf-selected').textContent).toContain('SHA-256');
  });
});
