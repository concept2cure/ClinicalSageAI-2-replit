// @vitest-environment jsdom
/**
 * DocumentCanvas — the card shows what the document is and how far along it
 * is, and keeps up while AnA works (2026-10-01, founder-directed D2).
 *
 * Before, the card named the CTD module and status, rendered the FIRST section
 * and a "Show all" toggle, and read the store once, when it mounted. It did
 * not say what kind of document it was, which sections were still empty, or
 * that anything had changed after AnA's next turn: reopening the thread was
 * the only way to see a revision.
 *
 *   · the type line names the document type (the stored product code, in words);
 *   · an outline lists every section, drafted or not, with the count drafted;
 *     choosing one shows it in the card;
 *   · a new `refreshKey` (the thread bumps it when AnA's turn ends) re-reads
 *     the record quietly, and the sections whose text changed are marked
 *     updated, with a status line saying so.
 *
 * D4-5b (D4.md §D4.I): the card became a chip. Its meta line carries the type,
 * the module and the count drafted; the outline, the chosen section and the
 * whole-document acts are in the open document (DocumentWorkbench).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
/* The editor's header widgets and the filing dialog are unrelated to the
   canvas contract and reach for hooks a canvas test does not stand up. */
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({
  AuthoringPlaceIntoFiling: ({ docId }: { docId: string }) => (
    <button type="button" data-testid="place-into-filing-stub" data-doc={docId}>Place into filing</button>
  ),
}));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentCanvas } from '../editor/DocumentCanvas';
import { clearEditorTarget } from '../editorTarget';
import { openEditorControl } from '../editor/__tests__/workbenchAssemblyBuild.testSupport';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';

const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const DOC_ROW = {
  success: true,
  document: {
    id: DOC, title: 'Module 2.5 Clinical Overview — C2C-101', module: 'M2', product_code: 'clinical_overview',
    status: 'DRAFT', updated_at: '2026-09-21T10:00:00Z', section_count: 3,
    provenance: { source: 'ana', conversationId: 'thread-1', turnId: 't-9', model: 'claude-fable-5-1' },
  },
};
const SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: DOC, code: '2.5.1', title: 'Product Development Rationale', content: '<p>C2C-101 is a humanized IgG1 monoclonal antibody against IL-23p19.</p>', order_index: 0, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
    { id: 'S2', doc_id: DOC, code: '2.5.2', title: 'Overview of Biopharmaceutics', content: '<p>Subcutaneous administration.</p>', order_index: 1, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
    { id: 'S3', doc_id: DOC, code: '2.5.3', title: 'Overview of Clinical Pharmacology', content: '', order_index: 2, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
  ],
};
const PROGRAM = { id: PID, code: 'CAMA', name: '[Demo · Biotech] C2C-101 anti-IL-23p19 mAb', program_type: 'ind', status: 'active', phase: 'planning' };

function mockApi(over: Partial<Record<'doc' | 'sections', () => Response>> = {}) {
  /* A route table rather than an if-chain: the reads this card makes, and an
     honest default for the rest. */
  const exact: Record<string, () => Response> = {
    [`/api/authoring/docs/${DOC}`]: over.doc ?? (() => ok(DOC_ROW)),
    [`/api/authoring/docs/${DOC}/sections`]: over.sections ?? (() => ok(SECTIONS)),
    [`/api/c2c/projects/${PID}`]: () => ok(PROGRAM),
    '/api/task-management/assignees': () => ok({ success: true, data: [{ id: '42', name: 'OQ Signer' }], total: 1 }),
  };
  const prefixed: Array<[string, () => Response]> = [
    ['/api/authoring/sections/S1/', () => ok({ success: true, sources: [], revisions: [] })],
    ['/api/authoring/documents/', () => ok({ success: true, comments: [] })],
    [`/api/c2c/projects/${PID}/sources`, () => ok({ sources: [] })],
    ['/api/c2c/documents/', () => ok({ success: false }, 404)],
  ];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method !== 'GET') return ok({ success: true });
    const hit = exact[url.split('?')[0]] ?? prefixed.find(([p]) => url.startsWith(p))?.[1];
    return hit ? hit() : ok({ success: true });
  });
}

/* Hoisted: a mock created inside the host would be a fresh, empty function
   on every render, and the log below would read the newest one. */
const nav = vi.fn();

function LiveHost({ refreshKey, programId = PID }: { refreshKey: number; programId?: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <DocumentCanvas
      docId={DOC}
      programId={programId}
      conversationId="thread-1"
      fromThisConversation
      expanded={expanded}
      onExpandedChange={setExpanded}
      onNav={nav}
      onAsk={() => undefined}
      fireToast={() => undefined}
      refreshKey={refreshKey}
    />
  );
}

/** The chip's Open, then the open document once its editor is up (D4-5b). */
async function openDocument() {
  const open = await screen.findByTestId('dc-open-editor');
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(open);
  const region = await screen.findByTestId('dc-expanded');
  await waitFor(() => expect(region.querySelector('.ed')).not.toBeNull());
  return region;
}
/** Choose a section in the open document's outline (closed in the canvas until its toggle opens it). */
async function chooseSection(region: HTMLElement, name: RegExp) {
  const toggle = within(region).getByTestId('ed-outline-toggle');
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
  fireEvent.click(await within(region).findByRole('button', { name }));
}
const describedBy = (el: Element) => (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  .map(id => document.getElementById(id)?.textContent ?? '').join(' ');

beforeEach(() => {
  mockApi();
  nav.mockReset();
  clearEditorTarget();
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
});

describe('DocumentCanvas — what the document is, and how far along', () => {
  // D4-5b: the card became a chip; the type is the first fact of its meta line (`.dcv-meta`).
  it('names the document type in the type line', async () => {
    render(<LiveHost refreshKey={0} />);
    const card = await screen.findByTestId('document-canvas');
    await within(card).findByTestId('dc-progress');
    expect(card.querySelector('.dcv-meta > span')?.textContent).toBe('Clinical overview');
  });

  /* A document created without a module (AnA's draft tool without one, or a
     draft opened as a document) is stored as M2 with provenance
     moduleDefaulted: the server assumed it. The type line said "M2" as if it
     had been chosen, so a statistical analysis plan read as Module 2.
     D4-5b: the card became a chip; the module is a fact of its meta line (`.dcv-meta`). */
  it('says an assumed module was assumed, and a chosen one plainly', async () => {
    mockApi({
      doc: () => ok({ ...DOC_ROW, document: { ...DOC_ROW.document, provenance: { ...DOC_ROW.document.provenance, moduleDefaulted: true } } }),
    });
    render(<LiveHost refreshKey={0} />);
    const card = await screen.findByTestId('document-canvas');
    await within(card).findByTestId('dc-progress');
    const assumed = within(card.querySelector('.dcv-meta') as HTMLElement).getByText('M2 (assumed)');
    expect(assumed.getAttribute('title')).toMatch(/No module was chosen/);
    cleanup();

    mockApi();
    render(<LiveHost refreshKey={0} />);
    const plain = await screen.findByTestId('document-canvas');
    await within(plain).findByTestId('dc-progress');
    const facts = Array.from(plain.querySelectorAll('.dcv-meta > span')).map(s => s.textContent);
    expect(facts.slice(0, 3)).toEqual(['Clinical overview', 'M2', 'Draft']);
    expect(plain.querySelector('.dcv-meta')?.textContent).not.toContain('assumed');
    expect(plain.querySelector('.dcv-meta [title]')).toBeNull();
  });

  // D4-5b: the chip says the count drafted; every section, drafted or not, is in the open document's Document view.
  it('outlines every section, drafted or not, with the count drafted', async () => {
    render(<LiveHost refreshKey={0} />);
    expect((await screen.findByTestId('dc-progress')).textContent).toBe('2 of 3 sections drafted');
    const region = await openDocument();
    fireEvent.click(within(region).getByRole('button', { name: 'Document' }));
    await waitFor(() => expect(region.querySelectorAll('section.ed-full-sec')).toHaveLength(3));
    const secs = Array.from(region.querySelectorAll('section.ed-full-sec'));
    expect(secs.map(s => s.getAttribute('aria-label'))).toEqual(SECTIONS.sections.map(s => `${s.code} ${s.title}`));
    expect(secs.map(s => !!s.querySelector('.ed-full-sec-empty'))).toEqual([false, false, true]);
    expect(secs[2].textContent).toContain('Not drafted yet.');
  });

  // D4-5b: the card's outline is gone; a section is chosen in the open document's outline and opens in its editor.
  it('shows the section chosen in the outline', async () => {
    render(<LiveHost refreshKey={0} />);
    const region = await openDocument();
    await chooseSection(region, /^2\.5\.2\s*Overview of Biopharmaceutics/);
    await waitFor(() => expect(region.querySelector('.tiptap')?.textContent).toContain('Subcutaneous administration.'));
  });
});

describe('DocumentCanvas — keeps up while AnA works', () => {
  // D4-5b: the card became a chip; the changed sections are named in its refresh line (`dc-updated`), only those.
  it('re-reads on a new refreshKey and marks the sections whose text changed', async () => {
    const { rerender } = render(<LiveHost refreshKey={0} />);
    await screen.findByTestId('dc-progress');
    const reads = () => apiRequest.mock.calls.filter(c => String(c[1]).split('?')[0] === `/api/authoring/docs/${DOC}/sections`).length;

    const revised = JSON.parse(JSON.stringify(SECTIONS));
    revised.sections[2].content = '<p>Exposure was dose-proportional from 10 to 300 mg.</p>';
    mockApi({ sections: () => ok(revised) }); // resets the call log
    rerender(<LiveHost refreshKey={1} />);

    await waitFor(() => expect(reads()).toBe(1));
    await screen.findByTestId('dc-updated');
    expect(screen.getByTestId('dc-progress').textContent).toBe('3 of 3 sections drafted');
    expect(screen.getByTestId('dc-updated').textContent).toBe('Updated after AnA\u2019s last turn: 2.5.3');
  });

  // D4-5b: the card became a chip; the record already read stays as the chip's title and progress.
  it('a quiet re-read that fails keeps the document on screen and says the refresh failed', async () => {
    const { rerender } = render(<LiveHost refreshKey={0} />);
    await screen.findByTestId('dc-progress');
    mockApi({ sections: () => ok({ error: 'boom' }, 500) });
    rerender(<LiveHost refreshKey={1} />);
    expect(await screen.findByTestId('dc-refresh-failed')).toBeTruthy();
    // The record already read stays: a failed refresh is not an empty document.
    expect(screen.getByTestId('dc-progress').textContent).toBe('2 of 3 sections drafted');
    expect(screen.getByText('Module 2.5 Clinical Overview — C2C-101')).toBeTruthy();
    expect(screen.queryByTestId('dc-error')).toBeNull();
  });
});

describe('DocumentCanvas — current partial reads', () => {
  // D4-5b: the card became a chip; the current programme's read shows as its title and progress, never the old one.
  it('masks a same-document prior-programme record and rejects its deferred JSON body', async () => {
    const nextProgram = '5ac45b38-a1d8-4a41-9488-fac39a57b853';
    let releaseBody!: (body: unknown) => void;
    const oldBody = new Promise<unknown>(resolve => { releaseBody = resolve; });
    let decodingOldBody = false;
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      const path = url.split('?')[0];
      if (path.split('?')[0] === `/api/authoring/docs/${DOC}` && !url.includes(nextProgram)) return {
        ok: true, status: 200, json: () => { decodingOldBody = true; return oldBody; },
      } as Response;
      if (path.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: { ...DOC_ROW.document,
        title: 'Current-programme record', readScope: 'document', sourceMetadataState: 'unavailable' } });
      if (path.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ readScope: 'document', sections: [{
        ...SECTIONS.sections[0], content: '<p>Current-programme admitted section.</p>',
      }] });
      return ok({ success: true });
    });
    const view = render(<LiveHost refreshKey={0} />);
    await waitFor(() => expect(decodingOldBody).toBe(true));
    view.rerender(<LiveHost refreshKey={0} programId={nextProgram} />);
    await screen.findByText('Current-programme record');
    expect(screen.getByTestId('dc-progress').textContent).toBe('1 of 1 section drafted');
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${DOC}?programId=${nextProgram}`);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${DOC}/sections?programId=${nextProgram}`);
    await act(async () => { releaseBody({ document: { ...DOC_ROW.document, title: 'Old programme private title' } }); await oldBody; });
    expect(screen.getByText('Current-programme record')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Old programme private title');
    expect(screen.queryByTestId('dc-provenance')).toBeNull();
  });
  // D4-5b: the chip withdraws the read's facts; File to vault is in the open document, which a refused read cannot open.
  it('withdraws cached prose after a quiet refresh confirms current access was refused', async () => {
    const view = render(<LiveHost refreshKey={0} />);
    await screen.findByTestId('dc-progress');
    mockApi({ doc: () => ok({ error: { code: 'AUTHORING_READ_FORBIDDEN', message: 'Current access does not admit this document.' } }, 403) });
    view.rerender(<LiveHost refreshKey={1} />);
    await screen.findByTestId('dc-error');
    expect(screen.queryByTestId('dc-progress')).toBeNull();
    expect(document.body.textContent).not.toContain('C2C-101 is a humanized');
    expect(document.body.textContent).not.toContain('Module 2.5 Clinical Overview');
    expect(screen.queryByTestId('dc-provenance')).toBeNull();
    expect((screen.getByTestId('dc-open-editor') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    expect(screen.queryByTestId('ed-more')).toBeNull();
    expect(screen.queryByText('File to vault…')).toBeNull();
  });

  // D4-5b: the chip keeps scope and progress; whole-document acts are refused in the open document's More menu.
  it.each(['unavailable', 'available'])('preserves admitted sections without guessing origin when partial metadata says %s', async sourceMetadataState => {
    mockApi({
      doc: () => ok({ ...DOC_ROW, document: { ...DOC_ROW.document, section_count: 99,
        readScope: 'sections', sourceMetadataState, provenance: null }, access: {
        fileToVault: { allowed: true }, assignReview: { allowed: true }, placeIntoFiling: { allowed: true },
      } }),
      sections: () => ok({ ...SECTIONS, readScope: 'sections', sections: SECTIONS.sections.slice(0, 2) }),
    });
    render(<LiveHost refreshKey={0} />);
    await screen.findByTestId('dc-progress');
    expect(screen.queryByTestId('dc-provenance')).toBeNull();
    expect(screen.getByTestId('dc-read-scope').textContent).toMatch(/only.*sections|sections.*current access/i);
    expect(screen.getByTestId('dc-progress').textContent).toContain('2 of 2 accessible sections drafted');
    expect((screen.getByTestId('dc-open-editor') as HTMLButtonElement).disabled).toBe(false);
    const region = await openDocument();
    for (const name of ['File to vault…', 'Send for review…']) {
      const item = openEditorControl(name);
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(describedBy(item)).toMatch(/only accessible sections/);
      fireEvent.click(item);
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    await chooseSection(region, /^2\.5\.2\s*Overview of Biopharmaceutics/);
    await waitFor(() => expect(region.querySelector('.tiptap')?.textContent).toContain('Subcutaneous administration.'));
  });

  // D4-5b: the chip's meta line claims no assumed module; File to vault, in the open document's More menu, stays enabled.
  it('does not inherit stored origin or assumed-module claims from unavailable metadata', async () => {
    mockApi({ doc: () => ok({ ...DOC_ROW, document: { ...DOC_ROW.document,
      readScope: 'document', sourceMetadataState: 'unavailable',
      provenance: { ...DOC_ROW.document.provenance, moduleDefaulted: true },
    } }) });
    render(<LiveHost refreshKey={0} />);
    await screen.findByTestId('dc-progress');
    expect(screen.queryByTestId('dc-provenance')).toBeNull();
    expect(document.querySelector('.dcv-meta')?.textContent).not.toContain('assumed');
    await openDocument();
    expect(openEditorControl('File to vault…').getAttribute('aria-disabled')).toBeNull();
  });
});
