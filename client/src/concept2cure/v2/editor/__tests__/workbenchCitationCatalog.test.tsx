// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...(await original<typeof import('@/services/portal/authService')>()), useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
import { DocumentWorkbench } from '../DocumentWorkbench';

const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const DOC = 'dddddddd-0000-4000-8000-000000000001';
const DOC_B = 'dddddddd-0000-4000-8000-000000000002';
const PREV = 'aaaaaaaa-0000-4000-8000-000000000001';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000002';
const AT = '2026-10-14T10:00:00Z';
const doc = { id: DOC, title: 'Stability overview', module: 'M3', product_code: null, status: 'draft', updated_at: AT, section_count: 2 };
const sections = [
  { id: PREV, doc_id: DOC, code: '3.2.P.8.1', title: 'Prior evidence', content: '<p>Prior<a data-cite="201">Prior protocol</a>.</p>', order_index: 0, updated_at: AT },
  { id: SEC, doc_id: DOC, code: '3.2.P.8.2', title: 'Current argument', content: '<p>Current<a data-cite="1">Current report</a>.</p>', order_index: 1, updated_at: AT },
];
const source = (id: number, over: Record<string, unknown> = {}) => ({ id, title: id === 201 ? 'Prior protocol' : `Report ${id}`,
  extractionStatus: 'extracted', textAvailable: (over.extractionStatus ?? 'extracted') === 'extracted', checksum: 'a'.repeat(64), isCurrent: true, dataEligible: true, originalFileAvailable: true, ...over });
const page = (programId: string, rows: ReturnType<typeof source>[], total = rows.length, offset = 0) => ({ projectId: programId,
  sources: rows, total, currentTotal: total, page: { limit: 200, offset }, window: { shown: rows.length, truncated: offset + rows.length < total } });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const props = { onNav: vi.fn(), docs: [doc], docsState: 'ready' as const, status: 'all', reloadDocs: vi.fn(async () => undefined), programId: PID };
function registered(sectionId: string, sourceId: number) { return { id: `citation-${sectionId}-${sourceId}`, section_id: sectionId, source: 'cre_evidence_source', reference_id: String(sourceId) }; }
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
function routes(projectRead: (program: string, offset: number) => Promise<Response>, sectionRows = sections) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const project = /\/api\/c2c\/projects\/([^/]+)\/sources/.exec(url);
    if (project) return projectRead(project[1], Number(new URL(url, 'https://example.test').searchParams.get('offset') ?? 0));
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: sectionRows });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url === `/api/authoring/docs/${DOC}/citations`) return ok([registered(PREV, 201), registered(SEC, 1)]);
    if (url === `/api/authoring/docs/${DOC_B}/sections`) return ok({ sections: [{ ...sections[1], id: 'aaaaaaaa-0000-4000-8000-000000000003', doc_id: DOC_B, content: '<p>Project B.</p>' }] });
    if (url === `/api/authoring/docs/${DOC_B}`) return ok({ document: { ...doc, id: DOC_B } });
    if (url === `/api/authoring/docs/${DOC_B}/citations`) return ok([]);
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return { ...ok({}), ok: false, status: 404 };
    return ok({ success: true });
  });
}
async function openCurrent() {
  await waitFor(() => expect(document.querySelector('.tiptap')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /^3\.2\.P\.8\.2\s*Current argument/ }));
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Current'));
}
function options() {
  fireEvent.click(screen.getByRole('button', { name: /^Cite a source/ }));
  return [...screen.getByRole('combobox', { name: 'Source to cite' }).querySelectorAll('option')].map(option => option.value);
}
beforeEach(() => { apiRequest.mockReset(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('the existing editor reads the whole project citation catalogue', () => {
  it('refreshes current catalogue and association facts when the existing Sources rail is reopened', async () => {
    let reads = 0;
    routes(async program => ok(page(program, ++reads === 1 ? [source(1)] : [source(1), source(2)])));
    render(<DocumentWorkbench {...props} />);
    await openCurrent();
    await waitFor(() => expect(document.querySelector('.tiptap [data-cite="1"]')?.textContent).toBe('[1]'));
    fireEvent.click(screen.getByRole('button', { name: /^Sources/ }));
    await waitFor(() => expect(reads).toBe(2));
    expect(options()).toEqual(['1', '2']);
    expect(apiRequest.mock.calls.filter(([, url]) => url === `/api/authoring/docs/${DOC}/citations`)).toHaveLength(2);
  });
  it('keeps eligible historical numbering without admitting that reference in an unregistered current section', async () => {
    routes(async program => ok(page(program, [source(1), source(201, { isCurrent: false })])),
      [sections[0], { ...sections[1], content: '<p>Current<a data-cite="201">Prior protocol</a> and <a data-cite="1">Current report</a>.</p>' }]);
    render(<DocumentWorkbench {...props} />);
    await openCurrent();
    await waitFor(() => expect(document.querySelector('.tiptap [data-cite="1"]')?.textContent).toBe('[2]'));
    expect(document.querySelector('.tiptap [data-cite="201"]')?.textContent).toContain('Citation unresolved');
    expect(options()).toEqual(['1']);
  });
  it('reads the second page so a registered source in a prior section gives the current marker its correct number', async () => {
    routes(async (program, offset) => ok(page(program, offset === 0 ? Array.from({ length: 200 }, (_, index) => source(index + 1)) : [source(201)], 201, offset)));
    render(<DocumentWorkbench {...props} />);
    await openCurrent();
    await waitFor(() => expect(document.querySelector('.tiptap [data-cite="1"]')?.textContent).toBe('[2]'));
    expect(apiRequest.mock.calls.some(([, url]) => url.includes('offset=200'))).toBe(true);
  });

  it('does not offer superseded, withdrawn or unreadable project sources as new citation choices', async () => {
    routes(async program => ok(page(program, [source(1), source(2, { isCurrent: false }), source(3, { dataEligible: false }), source(4, { extractionStatus: 'failed' })])));
    render(<DocumentWorkbench {...props} />);
    await openCurrent();
    await waitFor(() => expect(apiRequest.mock.calls.some(([, url]) => url.includes(`/projects/${PID}/sources`))).toBe(true));
    expect(options()).toEqual(['1']);
  });

  it('ignores a prior project source read that finishes after switching to another project', async () => {
    let finish!: (response: Response) => void;
    routes((program, offset) => program === PID ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(ok(page(program, [source(301)], 1, offset))));
    const { rerender } = render(<DocumentWorkbench {...props} />);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    rerender(<DocumentWorkbench {...props} programId={OTHER} docs={[{ ...doc, id: DOC_B }]} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Project B'));
    await act(async () => { finish(ok(page(PID, [source(1)]))); });
    expect(options()).toEqual(['301']);
  });
});
