// @vitest-environment jsdom
/**
 * DocumentCanvas — the AnA document canvas that converts into the full
 * editor in place (docs/design/ANA_DOCUMENT_CANVAS.md).
 *
 * What is pinned:
 *   · collapsed: the record is READ (GET /docs/:id, /sections), not the
 *     draft's inline text — title, type, project, provenance, first section
 *     through AuthoredHtml, section count, the four actions;
 *   · "Open full editor" mounts DocumentWorkbench for the SAME docId, in
 *     place (no navigation); "Back to conversation" collapses it and the
 *     workbench stays mounted (hidden) so its state survives;
 *   · Escape collapses, and focus returns to the header control;
 *   · "Edit in Authoring" carries the document identity on the one editor
 *     channel, with the return route;
 *   · honest states: a failed read is an error with a retry, and a draft with
 *     no program says "Not filed under a program".
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
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) return (over.doc ?? (() => ok(DOC_ROW)))();
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) return (over.sections ?? (() => ok(SECTIONS)))();
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
afterEach(() => {
  cleanup();
  clearEditorTarget();
});

describe('DocumentCanvas — collapsed', () => {
  it('renders the record: title, type, project name and phase, provenance, first section, count, actions', async () => {
    render(<Host />);
    const canvas = await screen.findByTestId('document-canvas');
    expect(await within(canvas).findByText('Module 2.5 Clinical Overview — C2C-101')).toBeTruthy();
    // The project: name AND phase, from the program route.
    expect(await within(canvas).findByText(/C2C-101 anti-IL-23p19 mAb · Planning/)).toBeTruthy();
    // Provenance names the model the store recorded and this conversation.
    expect(screen.getByTestId('dc-provenance').textContent).toBe('Drafted by AnA in this conversation · model claude-fable-5-1');
    // The first section, rendered through AuthoredHtml — as elements, from the record.
    expect(within(canvas).getByText('Product Development Rationale')).toBeTruthy();
    expect(within(canvas).getByText(/humanized IgG1 monoclonal antibody/)).toBeTruthy();
    // Not the second one, until asked.
    expect(within(canvas).queryByText('Overview of Biopharmaceutics')).toBeNull();
    expect(within(canvas).getByText('3 sections')).toBeTruthy();
    // The four actions.
    expect(screen.getByTestId('dc-open-editor')).toBeTruthy();
    expect(screen.getByTestId('dc-file-to-vault')).toBeTruthy();
    expect(screen.getByTestId('dc-assign-review')).toBeTruthy();
    expect(screen.getByTestId('place-into-filing-stub').getAttribute('data-doc')).toBe(DOC);
    // Type and status come from the row, not the stream.
    expect(within(canvas).getByText(/Document · M2 · draft/)).toBeTruthy();
  });

  it('"Show all" reveals every section, with an honest "Not drafted yet" for an empty one', async () => {
    render(<Host />);
    const btn = await screen.findByRole('button', { name: /Show all 3 sections/ });
    fireEvent.click(btn);
    expect(await screen.findByText('Overview of Clinical Pharmacology')).toBeTruthy();
    expect(screen.getByText('Not drafted yet.')).toBeTruthy();
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

  it('says "Not filed under a program" when the draft carried no program', async () => {
    render(<Host programId={null} />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    expect(screen.getByTestId('dc-no-program').textContent).toContain('Not filed under a program');
  });

  it('"Edit in Authoring" carries the document identity and the return route on the editor channel', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    fireEvent.click(screen.getByTestId('dc-edit-in-authoring'));
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
    await within(expanded).findByRole('button', { name: /Draft with AnA/ });
    // The workbench's own AnA rail is not offered in a conversation host.
    expect(within(expanded).queryByRole('button', { name: /^AnA(\s|$)/ })).toBeNull();
    fireEvent.click(within(expanded).getByRole('button', { name: /Draft with AnA/ }));
    const composer = screen.getByLabelText('Reply to AnA') as HTMLTextAreaElement;
    await waitFor(() => expect(composer.value).toMatch(/^Draft 2\.5\.1 Product Development Rationale/));
    expect(within(expanded).queryByLabelText('AnA — document authoring')).toBeNull();
  });
});

describe('DocumentCanvas — accessibility smoke', () => {
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

    fireEvent.click(screen.getByTestId('dc-assign-review'));
    const dlg = await screen.findByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)?.textContent).toBe('Assign review');
    expect(screen.getByLabelText(/Reviewer/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
