// @vitest-environment jsdom
/**
 * DocumentCanvas — the AnA document canvas that converts into the full
 * editor in place (docs/design/ANA_DOCUMENT_CANVAS.md).
 *
 * What is pinned:
 *   · collapsed: the record is READ (GET /docs/:id, /sections), not the
 *     draft's inline text — title, type, project, provenance, the count
 *     drafted and Open; since D4-5b a chip, whose first section and four
 *     actions are in the open document;
 *   · "Open full editor" mounts DocumentWorkbench for the SAME docId, in
 *     place (no navigation); "Back to conversation" collapses it and the
 *     workbench stays mounted (hidden) so its state survives;
 *   · Escape collapses, and focus returns to the header control;
 *   · "Edit in Authoring" carries the document identity on the one editor
 *     channel, with the return route;
 *   · honest states: a failed read is an error with a retry, and a draft with
 *     no program says "Not filed under a project".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
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
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
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
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.split('?')[0] === `/api/authoring/docs/${DOC}`) return (over.doc ?? (() => ok(DOC_ROW)))();
    if (method === 'GET' && url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return (over.sections ?? (() => ok(SECTIONS)))();
    if (method === 'GET' && url === `/api/c2c/projects/${PID}`) return ok(PROGRAM);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/')) return ok({ success: true, sources: [], revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/')) return ok({ success: true, comments: [] });
    if (method === 'GET' && url.startsWith(`/api/c2c/projects/${PID}/sources`)) return ok({ sources: [] });
    if (method === 'GET' && url === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '42', name: 'OQ Signer' }], total: 1 });
    if (method === 'GET' && url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true });
  });
}

/* Hoisted: a mock created inside the host would be a fresh, empty function
   on every render, and the log below would read the newest one. */
const nav = vi.fn();

function Host({ programId = PID, docId = DOC }: { programId?: string | null; docId?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [ask, setAsk] = React.useState('');
  return (
    <div>
      <DocumentCanvas
        docId={docId}
        programId={programId}
        conversationId="thread-1"
        fromThisConversation
        draftTitle="Draft title from the stream"
        expanded={expanded}
        onExpandedChange={setExpanded}
        onNav={nav}
        onAsk={setAsk}
        fireToast={() => undefined}
      />
      <textarea aria-label="Reply to AnA" value={ask} readOnly />
      <output data-testid="nav-log">{expanded ? 'expanded' : 'collapsed'}</output>
    </div>
  );
}

beforeEach(() => {
  mockApi();
  nav.mockReset();
  clearEditorTarget();
});
afterEach(() => { try { localStorage.removeItem('c2c.editor.outline'); } catch { /* none */ } });
afterEach(() => {
  cleanup();
  clearEditorTarget();
});

describe('DocumentCanvas — collapsed', () => {
  // D4-5b: the card became a chip; the first section and the four actions are read and reached in the open document.
  it('renders the record: title, type, project name and phase, provenance, first section, count, actions', async () => {
    render(<Host />);
    const canvas = await screen.findByTestId('document-canvas');
    expect(await within(canvas).findByText('Module 2.5 Clinical Overview — C2C-101')).toBeTruthy();
    // The project: name AND phase, from the program route.
    expect(await within(canvas).findByText(/C2C-101 anti-IL-23p19 mAb · Planning/)).toBeTruthy();
    // Provenance names the model the store recorded and this conversation.
    expect(screen.getByTestId('dc-provenance').textContent).toBe('Drafted by AnA in this conversation · model claude-fable-5-1');
    expect(screen.getByTestId('dc-progress').textContent).toBe('2 of 3 sections drafted');
    // Type, module and status come from the row, not the stream: the chip's meta line.
    const facts = Array.from(canvas.querySelectorAll('.dcv-meta > span')).map(s => s.textContent);
    expect(facts.slice(0, 3)).toEqual(['Clinical overview', 'M2', 'Draft']);
    // The four actions: Open on the chip; the other three in the open document.
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    const expanded = await screen.findByTestId('dc-expanded');
    // The first section, from the record, in the open document's editor; not the second one's body.
    await waitFor(() => expect(expanded.querySelector('.tiptap')?.textContent).toContain('humanized IgG1 monoclonal antibody'));
    expect(expanded.textContent).not.toContain('Subcutaneous administration.');
    expect(openEditorControl('File to vault…').getAttribute('aria-disabled')).toBeNull();
    expect(openEditorControl('Send for review…').getAttribute('aria-disabled')).toBeNull();
    expect(within(expanded).getByTestId('place-into-filing-stub').getAttribute('data-doc')).toBe(DOC);
  });

  it('a failed read is an error with a retry, never an empty document', async () => {
    mockApi({ doc: () => ok({ success: false, error: 'Document not found' }, 404) });
    render(<Host />);
    expect(await screen.findByTestId('dc-error')).toBeTruthy();
    // The server's own sentence, when it sent one, over any local wording.
    expect(screen.getByTestId('dc-error').textContent).toContain('Document not found');
    // The editor cannot be opened on a record that did not read.
    expect((screen.getByTestId('dc-open-editor') as HTMLButtonElement).disabled).toBe(true);
    mockApi();
    fireEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(await screen.findByText('Module 2.5 Clinical Overview — C2C-101')).toBeTruthy();
  });

  it('says "Not filed under a project" when the draft carried no program', async () => {
    render(<Host programId={null} />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    expect(screen.getByTestId('dc-no-program').textContent).toContain('Not filed under a project');
  });

  it('"Open full width" carries the document identity and the return route on the editor channel', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    // D4-5: the card's "Edit in the editor" became the open document's "Open full width".
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    fireEvent.click(await screen.findByTestId('dc-edit-in-authoring'));
    const target = peekEditorTarget();
    expect(target).not.toBeNull();
    expect(target!.docId).toBe(DOC);
    expect(target!.programId).toBe(PID);
    expect(target!.docType).toBeNull();
    expect(target!.returnTo).toEqual({ surface: 'conversation-thread', conversationId: 'thread-1' });
    expect(nav).toHaveBeenCalledWith('document-authoring');
  });
});

describe('DocumentCanvas — converts into the full editor in place', () => {
  it('Open full editor mounts DocumentWorkbench for the same docId without navigating; Back collapses and keeps state; Escape collapses', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    expect(screen.queryByTestId('dc-expanded')).toBeNull();

    fireEvent.click(screen.getByTestId('dc-open-editor'));
    const expanded = await screen.findByTestId('dc-expanded');
    expect(expanded.hasAttribute('hidden')).toBe(false);
    // The workbench, pinned: its tree names THIS document and its editor holds THIS section.
    await waitFor(() => expect(document.querySelector('.ed')).not.toBeNull());
    // Beside the conversation the outline opens closed (D4-4); its toggle in the bar shows it.
    const outline = within(expanded).getByTestId('ed-outline-toggle');
    expect(outline.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(outline);
    expect(await screen.findByRole('button', { name: /^2\.5\.1\s*Product Development Rationale/ })).toBeTruthy();
    await waitFor(() => expect((document.querySelector('.rse-body .tiptap')?.textContent ?? '')).toContain('humanized IgG1'));
    // No navigation happened.
    expect(nav).not.toHaveBeenCalled();
    // The card is hidden while expanded; the bar names the program.
    expect(screen.getByTestId('dc-back')).toBeTruthy();
    // The bar names the program (and so does the workbench's own crumb).
    expect(within(expanded).getAllByText(/C2C-101 anti-IL-23p19 mAb · Planning/).length).toBeGreaterThan(0);

    // Change state inside the workbench: open the Comments rail.
    fireEvent.click(within(expanded).getByRole('button', { name: /^Comments/ }));
    expect(await within(expanded).findByText('No comments yet')).toBeTruthy();

    // Back collapses; the workbench stays mounted, hidden, with its rail open.
    fireEvent.click(screen.getByTestId('dc-back'));
    await waitFor(() => expect(screen.getByTestId('dc-expanded').hasAttribute('hidden')).toBe(true));
    expect(document.querySelector('.ed')).not.toBeNull();
    expect(within(screen.getByTestId('dc-expanded')).getByText('No comments yet')).toBeTruthy();
    // Focus returned to the header control.
    expect(document.activeElement).toBe(screen.getByTestId('dc-open-editor'));

    // Re-expand: same instance, same state, no re-read of the document.
    const readsBefore = apiRequest.mock.calls.filter(c => c[1] === `/api/authoring/docs/${DOC}/sections`).length;
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    await waitFor(() => expect(screen.getByTestId('dc-expanded').hasAttribute('hidden')).toBe(false));
    expect(within(screen.getByTestId('dc-expanded')).getByText('No comments yet')).toBeTruthy();
    expect(apiRequest.mock.calls.filter(c => c[1] === `/api/authoring/docs/${DOC}/sections`).length).toBe(readsBefore);

    // Escape, from the bar, collapses.
    fireEvent.keyDown(screen.getByTestId('dc-back'), { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('dc-expanded').hasAttribute('hidden')).toBe(true));
  });

  it('Escape inside the editor document or a text control belongs to it, not to the canvas', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).not.toBeNull());
    const pm = document.querySelector('.rse-body .tiptap') as HTMLElement;
    fireEvent.keyDown(pm, { key: 'Escape' });
    expect(screen.getByTestId('dc-expanded').hasAttribute('hidden')).toBe(false);
  });

  it('an ask from inside the workbench lands in the host composer, not a second AnA pane', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    const expanded = await screen.findByTestId('dc-expanded');
    await within(expanded).findByTestId('ed-ana');
    // The workbench's own way to the conversation is not offered in a conversation host.
    expect(within(expanded).queryByRole('button', { name: 'Show the conversation' })).toBeNull();
    fireEvent.click(openEditorControl('Draft with AnA', 'ana'));
    const composer = screen.getByLabelText('Reply to AnA') as HTMLTextAreaElement;
    // The person's words only; the section travels in the saved origin (2026-11-09).
    await waitFor(() => expect(composer.value).toBe('Draft this section from the linked section evidence.'));
    expect(within(expanded).queryByLabelText('AnA — document authoring')).toBeNull();
  });
});

describe('DocumentCanvas — accessibility smoke', () => {
  // D4-5b: the card became a chip; Send for review opens from the open document's More menu, modal and labelled.
  it('is a labelled region whose controls have names, and the dialogs it opens are modal and labelled', async () => {
    render(<Host />);
    const canvas = await screen.findByTestId('document-canvas');
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    const label = canvas.getAttribute('aria-labelledby');
    expect(label).toBeTruthy();
    expect(document.getElementById(label!)?.textContent).toBe('Module 2.5 Clinical Overview — C2C-101');
    for (const btn of Array.from(canvas.querySelectorAll('button'))) {
      expect((btn.textContent || btn.getAttribute('aria-label') || '').trim().length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('dc-open-editor').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByTestId('dc-open-editor'));
    await within(await screen.findByTestId('dc-expanded')).findByTestId('ed-more');
    fireEvent.click(openEditorControl('Send for review…'));
    const dlg = await screen.findByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)?.textContent).toBe('Send for review');
    expect(screen.getByLabelText(/Reason for the request/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('DocumentCanvas — a failed program read says so (GE-H-2, 2026-09-28)', () => {
  it.each([
    ['a 500', () => ok({ error: 'boom' }, 500)],
    ['a network failure', () => { throw new Error('network down'); }],
  ])('after %s it does not claim the program is still being read', async (_label, answer) => {
    mockApi();
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string) =>
      method === 'GET' && url === `/api/c2c/projects/${PID}` ? answer() : base(method, url),
    );
    render(<Host />);
    await waitFor(() => expect(screen.getByText(/Project details could not be read/)).toBeTruthy());
    expect(screen.queryByText(/Reading the project…/)).toBeNull();
  });
});

/* D4-5 (D4.md §D4.A): the document in the conversation has one bar, the editor's. The canvas drew its own above it,
   "Back to conversation", the title, the project and an Esc chip, and the editor's bar sat under it. The way back,
   "Open full width" and the status are now in the editor's one bar; Escape still closes. */
describe('one bar for the document in the conversation (D4-5)', () => {
  it('the expanded document has one bar, which carries the way back, the status and "Open full width"', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    const expanded = await screen.findByTestId('dc-expanded');
    await waitFor(() => expect(expanded.querySelector('.ed')).not.toBeNull());
    expect(expanded.getAttribute('data-placement')).toBe('inline');
    expect(expanded.querySelectorAll('.dcv-bar')).toHaveLength(1);
    expect(expanded.querySelector('.dcv-bar-hint')).toBeNull();
    const bar = within(expanded).getByTestId('ed-bar');
    const back = within(bar).getByTestId('dc-back');
    expect(back.getAttribute('aria-label')).toBe('Back to conversation');
    expect(back.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(within(bar).getByTestId('dc-status')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Open full width' }));
    expect(peekEditorTarget()?.returnTo).toEqual({ surface: 'conversation-thread', conversationId: 'thread-1' });
    expect(nav).toHaveBeenCalledWith('document-authoring');
  });

  it('the card no longer carries "Edit in the editor": "Open full width" is in the open document', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    expect(screen.queryByText(/Edit in the editor/)).toBeNull();
    expect(screen.queryByTestId('dc-edit-in-authoring')).toBeNull();
  });
});

/* D4-5b (D4.md §D4.I): under AnA's turn the document is a chip, as Claude shows an artifact: an icon, the title, one
   line of kind and state, and Open. The card carried an uppercase kind line, the outline, the first section, "Show
   all" and four actions; the work happens in the open document, where each of those is reached once. */
describe('the document under the turn is a chip (D4-5b)', () => {
  it('one row of icon, title, meta and Open, with the progress, the project and where it came from', async () => {
    render(<Host />);
    const title = await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    const card = title.closest('.dcv-card') as HTMLElement;
    expect(card.querySelector('.dcv-row .dcv-ic')).not.toBeNull();
    expect(card.querySelector('.dcv-row .dcv-head .dcv-meta')).not.toBeNull();
    expect(within(card).getByTestId('dc-progress')).toBeTruthy();
    expect(within(card).getByTestId('dc-provenance')).toBeTruthy();
    for (const gone of ['.dcv-kind', '.dcv-body', '.dcv-actions', '.dcv-outline']) expect(card.querySelector(gone)).toBeNull();
    expect(within(card).queryByTestId('dc-file-to-vault')).toBeNull();
    expect(within(card).queryByTestId('dc-assign-review')).toBeNull();
    const open = within(card).getByTestId('dc-open-editor');
    expect(open.textContent?.trim()).toBe('Open');
    expect(open.className).toBe('btn ghost small');
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    await waitFor(() => expect(open.getAttribute('aria-expanded')).toBe('true'));
  });

  it('a document filed under no project says so in the chip', async () => {
    render(<Host programId={null} />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    expect(screen.getByTestId('dc-no-program').closest('.dcv-meta')).not.toBeNull();
  });
});
