// @vitest-environment jsdom
/**
 * DocumentWorkbench — the Project files rail (the vault beside the page).
 *
 * Rendered through the Authoring surface, which mounts the workbench. What is
 * pinned: the rail lists the SAME read model the Vault surface renders
 * (GET /api/c2c/project-vault/:programId), search goes to /search, "Cite in
 * this section" inserts a citation NODE into the editor through the editor's
 * own command and records the section→source link, a file that is not a
 * data-room source cannot be cited and says so (a reference inserts as text),
 * and a failed read is an error with a retry, never an empty vault.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEC = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const upload = (id: string, title: string, hash: string, type = 'PROTOCOL') => ({
  id, num: 'm5.3.5.1', title, type, status: 'filed', pct: 100, owner: 'Jon', ver: '1.0', updated: '2 d ago',
  preview: `${title} · SHA-256 ${hash.slice(0, 12)}…`, src: 'upload', docId: id, sizeLabel: '9 KB', hash,
  filing: { folderId: 'module-5', folderLabel: 'Module 5 — Clinical', evidenceKind: null, ctdSection: '5.3.5.1', placementStatus: 'filed', confidence: null, rationale: null },
});
const VAULT = {
  success: true,
  data: {
    program: 'C2C-101', spine: 'eCTD', standard: 'biotech', documentCount: 2,
    tree: [
      { id: 'cab-module-5', code: 'M5', label: 'Module 5 — Clinical', children: [
        upload('u-protocol', 'Protocol C2C-101-201 v1.0', 'sha-protocol'),
        upload('u-sap', 'Statistical Analysis Plan C2C-101-201 v1.0', 'sha-sap', 'SAP'),
      ] },
    ],
  },
};
const SEARCH = { success: true, data: { query: 'analysis', total: 1, limit: 25, offset: 0, results: [
  { id: 'u-sap', title: 'Statistical Analysis Plan C2C-101-201 v1.0', fileName: 'sap.pdf', documentType: 'SAP', size: '9 KB', folderId: 'module-5', ctdSection: '5.3.5.1', placementStatus: 'filed', snippet: 'primary <b>analysis</b> population' },
] } };

interface Routes { vault?: () => Response }
function mockApi(routes: Routes = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) {
      return ok({ documents: [{ id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'draft', updated_at: null, section_count: 1 }] });
    }
    if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', status: 'draft', provenance: null } });
    if (url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({ sections: [{ id: SEC, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>The product rationale.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
    }
    if (url === `/api/authoring/sections/${SEC}/sources`) return ok({ sources: [] });
    if (url === `/api/c2c/projects/${PID}/sources`) {
      // The protocol IS a data-room source (same bytes); the SAP is not.
      return ok({ sources: [{ id: 5, title: 'Protocol C2C-101-201 v1.0', extractionStatus: 'extracted', checksum: 'sha-protocol' }] });
    }
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
    if (url === `/api/c2c/project-vault/${PID}`) return (routes.vault ?? (() => ok(VAULT)))();
    if (url.startsWith(`/api/c2c/project-vault/${PID}/search?`)) return ok(SEARCH);
    if (method === 'POST' && url === `/api/authoring/sections/${SEC}/cite-source`) return ok({ success: true, created: true });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true });
  });
}

const props = () => ({ surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openProjectFiles() {
  render(<DocumentAuthoring {...props()} />);
  await screen.findAllByText('Rationale');
  await waitFor(() => expect((document.querySelector('.rse-body .tiptap')?.textContent ?? '')).toContain('product rationale'));
  fireEvent.click(screen.getByTestId('vault-rail-open'));
  return screen.findByRole('complementary', { name: 'Project files' });
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'C2C-101' };
  mockApi();
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('DocumentWorkbench — Project files', () => {
  it('lists the vault read model the Vault surface renders, under the program name', async () => {
    const rail = await openProjectFiles();
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PID}`);
    expect(await within(rail).findByText('Module 5 — Clinical')).toBeTruthy();
    expect(within(rail).getByText('Protocol C2C-101-201 v1.0')).toBeTruthy();
    expect(within(rail).getByText('Statistical Analysis Plan C2C-101-201 v1.0')).toBeTruthy();
    expect(within(rail).getByText(/Project files · C2C-101/)).toBeTruthy();
  });

  it('searches through the vault search route and shows the total', async () => {
    const rail = await openProjectFiles();
    await within(rail).findByText('Module 5 — Clinical');
    fireEvent.change(within(rail).getByLabelText('Search the project vault'), { target: { value: 'analysis' } });
    expect(await within(rail).findByText('1 of 1 match')).toBeTruthy();
    expect(apiRequest.mock.calls.some(c => String(c[1]).startsWith(`/api/c2c/project-vault/${PID}/search?q=analysis`))).toBe(true);
  });

  it('Cite in this section inserts a citation node through the editor and records the source link', async () => {
    const rail = await openProjectFiles();
    fireEvent.click(await within(rail).findByRole('button', { name: /Protocol C2C-101-201 v1\.0/ }));
    const cite = await screen.findByTestId('pf-cite');
    expect(cite.textContent).toContain('Cite in §2.5.1');
    fireEvent.click(cite);
    // The citation node — the editor's own command, so the same DOM the picker produces.
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap a[data-cite="5"]')).not.toBeNull());
    // And the section→source link the Sources rail reads.
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', `/api/authoring/sections/${SEC}/cite-source`, { source_id: 5 }),
    );
  });

  it('a file that is not a data-room source cannot be cited; a reference inserts as text and says it is not a citation', async () => {
    const rail = await openProjectFiles();
    fireEvent.click(await within(rail).findByRole('button', { name: /Statistical Analysis Plan/ }));
    expect(screen.queryByTestId('pf-cite')).toBeNull();
    expect(screen.getByTestId('pf-not-citable').textContent).toContain('cannot be cited');
    fireEvent.click(screen.getByTestId('pf-insert-reference'));
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')?.textContent).toContain('[Ref: “Statistical Analysis Plan C2C-101-201 v1.0” · SAP · §m5.3.5.1 · SHA-256 sha-sap]'));
    expect(document.querySelector('.rse-body .tiptap a[data-cite]')).toBeNull();
  });

  it('a failed vault read is an error with a retry, never an empty vault', async () => {
    mockApi({ vault: () => ok({ success: false, error: 'VAULT_UNAVAILABLE' }, 503) });
    const rail = await openProjectFiles();
    expect(await within(rail).findByTestId('pf-error')).toBeTruthy();
    expect(within(rail).queryByText('Nothing in the vault yet')).toBeNull();
    mockApi();
    fireEvent.click(within(rail).getByRole('button', { name: /Try again|Retry/ }));
    expect(await within(rail).findByText('Module 5 — Clinical')).toBeTruthy();
  });

  it('with no program open the rail says the document is not filed under a program', async () => {
    delete (window as any).C2C_PROJECT;
    mockApi();
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('vault-rail-open'));
    expect(await screen.findByTestId('pf-no-program')).toBeTruthy();
    expect(apiRequest.mock.calls.some(c => String(c[1]).startsWith('/api/c2c/project-vault/'))).toBe(false);
  });
});
