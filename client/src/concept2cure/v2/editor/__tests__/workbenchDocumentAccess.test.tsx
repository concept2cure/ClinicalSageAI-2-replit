// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() ?? {
    id: '1', organizationId: '7', displayName: 'Author', email: 'author@example.test',
  } }) };
});
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: (props: { freezeRefusal?: string; esignRefusal?: string; onChanged: () => void }) =>
  <><button disabled={!!props.freezeRefusal}>Freeze document</button><button disabled={!!props.esignRefusal}>Sign document</button>
    <button onClick={props.onChanged}>Refresh sections</button></> }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: (props: { refusal?: string }) =>
  <button disabled={!!props.refusal}>Place document</button> }));
import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import { DocumentWorkbench } from '../DocumentWorkbench';
import { authService, type AuthUser } from '@/services/portal/authService';
import type { OwnedSurfaceViewProps } from '../../surfaceViews';

const DOC = '10000000-0000-4000-8000-000000000001';
const SEC = '20000000-0000-4000-8000-000000000001';
const emptyRects = () => [] as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect);
}
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
afterEach(() => { cleanup(); authService.endSession(null); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; });
const AUTHOR: AuthUser = { id: '1', organizationId: '7', organizationName: 'Synthetic sponsor',
  firstName: 'Test', lastName: 'Author', displayName: 'Author', email: 'author@example.test',
  roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };

const PID = '30000000-0000-4000-8000-000000000001';
const NEXT_PID = '30000000-0000-4000-8000-000000000002';
const row = { id: DOC, title: 'Current accessible draft', module: null, product_code: null,
  status: 'DRAFT', c2c_document_id: null, updated_at: null, section_count: 1 };
const sectionRow = { id: SEC, doc_id: DOC, code: '1', title: 'Visible section', content: '<p>Current admitted prose.</p>',
  order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null };
function renderWorkbench(programId: string = PID) {
  return <DocumentWorkbench docs={[row]} docsState="ready" status="all" reloadDocs={vi.fn()}
    pinnedDocId={DOC} programId={programId} onNav={vi.fn()} />;
}
function baseRead(url: string) {
  const path = url.split('?')[0];
  if (path === `/api/authoring/docs/${DOC}`) return ok({ document: row });
  if (path === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [sectionRow] });
  return ok({ success: true, sections: [], revisions: [], comments: [], sources: [], citations: [] });
}

describe('current authoring reads retain the server edit decision', () => {
  it.each(['document', 'sections'])('retains the current server edit refusal for a %s projection', async readScope => {
    const reason = 'Your current organization access is read-only.';
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: { ...row, readScope },
        access: { edit: { allowed: false, reason } } });
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [sectionRow], readScope });
      return baseRead(url);
    });
    render(renderWorkbench());
    await waitFor(() => expect(document.querySelector('.tiptap')?.getAttribute('contenteditable')).toBe('false'));
    expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.');
    expect(document.body.textContent).toContain(reason);
    expect((screen.getByTestId('ai-draft-open') as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });
});

describe('current authoring lists retain their canonical session owner', () => {
  it('rejects an old deferred list body after the same actor replaces the canonical session', async () => {
    authService.setToken('synthetic-owner-before',AUTHOR,'synthetic-refresh-before');
    window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
    let release!: (body: unknown) => void;
    const body = new Promise<unknown>(resolve => { release = resolve; });
    let decoding = false; let reads = 0;
    apiRequest.mockReset().mockImplementation(async (_method: string,url: string) => {
      if (url.startsWith('/api/authoring/docs?')) {
        if (++reads === 1) return { ok: true,status:200,json: () => { decoding = true; return body; } } as Response;
        return ok({ documents: [{ ...row,title:'Replacement-session list title' }] });
      }
      return baseRead(url);
    });
    render(<DocumentAuthoring onNav={vi.fn()} segment="biotech" surface={{ id:'document-authoring',label:'Authoring' } as never} />);
    await waitFor(() => expect(decoding).toBe(true));
    act(() => { authService.endSession(null); authService.setToken('synthetic-owner-after',AUTHOR,'synthetic-refresh-after'); });
    await screen.findAllByText('Replacement-session list title');
    await act(async () => { release({ documents: [{ ...row,title:'Old-session private list title' }] }); await body; });
    expect(document.body.textContent).not.toContain('Old-session private list title');
    expect(reads).toBe(2);
  });
  it('retains a current deferred document list during ordinary canonical token refresh', async () => {
    authService.setToken('synthetic-owner-before',AUTHOR,'synthetic-refresh-before');
    let release!: (body: unknown) => void;
    const body = new Promise<unknown>(resolve => { release = resolve; });
    let decoding = false; let reads = 0;
    apiRequest.mockReset().mockImplementation(async (_method: string,url: string) => {
      if (url.startsWith('/api/authoring/docs?')) { reads += 1;
        return { ok: true,status:200,json: () => { decoding = true;return body; } } as Response;
      }
      return baseRead(url);
    });
    vi.stubGlobal('fetch',vi.fn(async () => new Response(JSON.stringify({ accessToken:'synthetic-owner-refreshed',
      refreshToken:'synthetic-refresh-after',expiresIn:3600 }),{status:200,headers:{'Content-Type':'application/json'}})));
    render(<DocumentAuthoring onNav={vi.fn()} segment="biotech" surface={{ id:'document-authoring',label:'Authoring' } as never} />);
    await waitFor(() => expect(decoding).toBe(true));
    const guard = authService.captureSessionReadGuard();
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(guard.sameRevision()).toBe(true);
    await act(async () => { release({ documents:[{ ...row,title:'Current-refresh document list' }] });await body; });
    await screen.findAllByText('Current-refresh document list');
    expect(reads).toBe(1);
  });
});

describe('current authoring reads restrict whole-document ceremonies', () => {
  it('withdraws metadata and whole-source controls when a sections refresh confirms an access change', async () => {
    let denied = false;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      const path = url.split('?')[0];
      if (path === `/api/authoring/docs/${DOC}`) return ok({ document: { ...row,
        provenance: { source: 'ana', model: 'Current verified model' } },
        access: Object.fromEntries(['freeze', 'esign', 'fileToVault', 'assignReview', 'placeIntoFiling'].map(key => [key, { allowed: true }])) });
      if (path === `/api/authoring/docs/${DOC}/sections` && denied) return { ok: false, status: 503,
        json: async () => ({ error: { code: 'AUTHORING_READ_ACCESS_CHANGED', message: 'Read current access again.' } }) } as Response;
      return baseRead(url);
    });
    render(renderWorkbench());
    await screen.findByTestId('doc-provenance');
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.'));
    denied = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sections' }));
    await waitFor(() => expect(document.querySelector('.tiptap')).toBeNull());
    expect(screen.queryByTestId('doc-provenance')).toBeNull();
    for (const label of ['Freeze document', 'Sign document', 'Place document', 'Send for review', 'File to vault'])
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps partial section editing/navigation while refusing optimistic whole-document hints', async () => {
    authService.setToken(`synthetic.${btoa(JSON.stringify({ userId: AUTHOR.id, organizationId: AUTHOR.organizationId }))}.synthetic`, AUTHOR, 'synthetic-current-partial-refresh');
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: { ...row,
        readScope: 'sections', sourceMetadataState: 'available',
        template_id: '44444444-0000-4000-8000-000000000001',
        provenance: { source: 'ana', model: 'Private original model' },
      }, access: Object.fromEntries(['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling']
        .map(key => [key, { allowed: true }])) });
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [sectionRow], readScope: 'sections' });
      return baseRead(url);
    });
    render(renderWorkbench());
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.'));
    expect(screen.getByTestId('workbench-read-scope').textContent).toMatch(/only.*sections|sections.*current access/i);
    for (const label of ['Freeze document', 'Sign document', 'Place document', 'Send for review', 'File to vault'])
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('doc-provenance')).toBeNull();
    const assembly = within(screen.getByLabelText('Document assembly'));
    expect(assembly.getByText(/Whole-document actions require the full document/)).toBeTruthy();
    expect((assembly.getByRole('button', { name: 'Preview build' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Document' }));
    expect(screen.getByLabelText(`${row.title} — accessible sections`)).toBeTruthy();
    expect(screen.queryByLabelText(`${row.title} — full document`)).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });

});

describe('current authoring bodies retain their project and session owner', () => {
  it('refuses deferred old bodies for the same document after changing programme', async () => {
    let releaseBody!: (body: unknown) => void;
    const oldBody = new Promise<unknown>(resolve => { releaseBody = resolve; });
    let oldStarted = false;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}` && !url.includes(NEXT_PID)) {
        oldStarted = true;
        return { ok: true, status: 200, json: () => oldBody } as Response;
      }
      return baseRead(url);
    });
    const view = render(renderWorkbench());
    await waitFor(() => expect(oldStarted).toBe(true));
    view.rerender(renderWorkbench(NEXT_PID));
    await waitFor(() => expect(apiRequest.mock.calls.some(([,url]) => url === `/api/authoring/docs/${DOC}?programId=${NEXT_PID}`)).toBe(true));
    await act(async () => { releaseBody({ document: { ...row, provenance: { source: 'ana', model: 'Old private model' } } }); await oldBody; });
    expect(screen.queryByTestId('doc-provenance')).toBeNull();
  });

  it('masks old prose immediately across a same-actor session replacement and ignores its deferred sections', async () => {
    authService.setToken('synthetic-owner-before', AUTHOR, 'synthetic-refresh-before');
    let releaseBody!: (body: unknown) => void;
    const oldBody = new Promise<unknown>(resolve => { releaseBody = resolve; });
    let sectionReads = 0;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections` && ++sectionReads === 1)
        return { ok: true, status: 200, json: () => oldBody } as Response;
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [{ ...sectionRow, content: '<p>Replacement-session prose.</p>' }] });
      return baseRead(url);
    });
    render(renderWorkbench());
    await waitFor(() => expect(sectionReads).toBe(1));
    act(() => { authService.endSession(null); authService.setToken('synthetic-owner-after', AUTHOR, 'synthetic-refresh-after'); });
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Replacement-session prose.'));
    await act(async () => { releaseBody({ sections: [{ ...sectionRow, content: '<p>Old-session private prose.</p>' }] }); await oldBody; });
    expect(document.querySelector('.tiptap')?.textContent).toContain('Replacement-session prose.');
    expect(document.body.textContent).not.toContain('Old-session private prose.');
  });

  it('retains a current deferred body across ordinary canonical bearer refresh', async () => {
    authService.setToken('synthetic-owner-before', AUTHOR, 'synthetic-refresh-before');
    let releaseBody!: (body: unknown) => void;
    const oldBody = new Promise<unknown>(resolve => { releaseBody = resolve; });
    let sectionReads = 0;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) {
        sectionReads += 1;
        return { ok: true, status: 200, json: () => oldBody } as Response;
      }
      return baseRead(url);
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: 'synthetic-owner-refreshed',
      refreshToken: 'synthetic-refresh-after', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(renderWorkbench());
    await waitFor(() => expect(sectionReads).toBe(1));
    const before = authService.captureSessionReadGuard();
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(before.sameRevision()).toBe(true);
    expect(sectionReads).toBe(1);
    await act(async () => { releaseBody({ sections: [sectionRow] }); await oldBody; });
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current admitted prose.'));
  });
});

describe('document access is reachable from the canonical authoring editor', () => {
  it('opens the current document access rail and uses its verified roster and outline choices', async () => {
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ id: DOC, title: 'Clinical overview', module: 'M2', status: 'draft', updated_at: null, section_count: 1 }] });
      if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { id: DOC, title: 'Clinical overview', status: 'draft', provenance: null } });
      if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: [{ id: SEC, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>Medical rationale.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
      if (url === `/api/authoring/docs/${DOC}/permissions`) return ok({ success: true, docId: DOC, permissions: [] });
      if (url === '/api/tenant-users/7') return ok([{ id: 2, name: 'Medical reviewer', email: 'reviewer@example.test' }]);
      return ok({ success: true, revisions: [], comments: [], sources: [], events: [], citations: [] });
    });
    render(<DocumentAuthoring {...({ surface: { id: 'document-authoring', label: 'Authoring' }, segment: 'biotech', onNav: vi.fn() } as unknown as OwnedSurfaceViewProps)} />);
    fireEvent.click(await screen.findByTestId('access-rail-open'));
    const rail = within(screen.getByRole('complementary', { name: 'Document access' }));
    await rail.findByText('No explicit access grants recorded');
    await waitFor(() => expect((rail.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(rail.getByRole('button', { name: 'Grant access' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Grant document access' }));
    expect(drawer.getByRole('option', { name: 'Medical reviewer' })).toBeTruthy();
    expect(drawer.getByRole('option', { name: '2.5.1 · Rationale' })).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${DOC}/permissions`);
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/tenant-users/7');
    fireEvent.click(drawer.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(rail.getByRole('button', { name: 'Close document access' }));
    expect(screen.queryByRole('complementary', { name: 'Document access' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('access-rail-open'));
  });
});
