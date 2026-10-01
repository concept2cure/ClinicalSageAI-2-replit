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
import { clearEditorTarget } from '../editorTarget';

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
    const hit = exact[url] ?? prefixed.find(([p]) => url.startsWith(p))?.[1];
    return hit ? hit() : ok({ success: true });
  });
}

/* Hoisted: a mock created inside the host would be a fresh, empty function
   on every render, and the log below would read the newest one. */
const nav = vi.fn();

function LiveHost({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <DocumentCanvas
      docId={DOC}
      programId={PID}
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
  it('names the document type in the type line', async () => {
    render(<LiveHost refreshKey={0} />);
    const card = await screen.findByTestId('document-canvas');
    await within(card).findByRole('article', { name: /2\.5\.1/ });
    expect(card.querySelector('.dcv-kind')?.textContent).toContain('Clinical overview');
  });

  /* A document created without a module (AnA's draft tool without one, or a
     draft opened as a document) is stored as M2 with provenance
     moduleDefaulted: the server assumed it. The type line said "M2" as if it
     had been chosen, so a statistical analysis plan read as Module 2. */
  it('says an assumed module was assumed, and a chosen one plainly', async () => {
    mockApi({
      doc: () => ok({ ...DOC_ROW, document: { ...DOC_ROW.document, provenance: { ...DOC_ROW.document.provenance, moduleDefaulted: true } } }),
    });
    render(<LiveHost refreshKey={0} />);
    const card = await screen.findByTestId('document-canvas');
    await within(card).findByRole('article', { name: /2\.5\.1/ });
    const kind = card.querySelector('.dcv-kind') as HTMLElement;
    expect(kind.textContent).toContain('M2 (assumed)');
    expect(kind.querySelector('[title]')?.getAttribute('title')).toMatch(/No module was chosen/);
    cleanup();

    mockApi();
    render(<LiveHost refreshKey={0} />);
    const plain = await screen.findByTestId('document-canvas');
    await within(plain).findByRole('article', { name: /2\.5\.1/ });
    expect(plain.querySelector('.dcv-kind')?.textContent).toContain('· M2 ·');
    expect(plain.querySelector('.dcv-kind')?.textContent).not.toContain('assumed');
  });

  it('outlines every section, drafted or not, with the count drafted', async () => {
    render(<LiveHost refreshKey={0} />);
    const outline = await screen.findByRole('list', { name: 'Sections' });
    const items = within(outline).getAllByRole('listitem');
    expect(items.map(li => li.getAttribute('data-drafted'))).toEqual(['true', 'true', 'false']);
    expect(within(items[2]).getByText('Not drafted')).toBeTruthy();
    expect(screen.getByTestId('dc-progress').textContent).toBe('2 of 3 sections drafted');
  });

  it('shows the section chosen in the outline', async () => {
    render(<LiveHost refreshKey={0} />);
    const outline = await screen.findByRole('list', { name: 'Sections' });
    fireEvent.click(within(outline).getByRole('button', { name: /2\.5\.2/ }));
    const card = screen.getByTestId('document-canvas');
    expect(await within(card).findByText('Subcutaneous administration.')).toBeTruthy();
  });
});

describe('DocumentCanvas — keeps up while AnA works', () => {
  it('re-reads on a new refreshKey and marks the sections whose text changed', async () => {
    const { rerender } = render(<LiveHost refreshKey={0} />);
    await screen.findByRole('list', { name: 'Sections' });
    const reads = () => apiRequest.mock.calls.filter(c => c[1] === `/api/authoring/docs/${DOC}/sections`).length;

    const revised = JSON.parse(JSON.stringify(SECTIONS));
    revised.sections[2].content = '<p>Exposure was dose-proportional from 10 to 300 mg.</p>';
    mockApi({ sections: () => ok(revised) }); // resets the call log
    rerender(<LiveHost refreshKey={1} />);

    await waitFor(() => expect(reads()).toBe(1));
    const outline = await screen.findByRole('list', { name: 'Sections' });
    await waitFor(() => expect(within(outline).getAllByRole('listitem')[2].getAttribute('data-updated')).toBe('true'));
    expect(within(outline).getAllByRole('listitem')[0].getAttribute('data-updated')).toBeNull();
    expect(screen.getByTestId('dc-progress').textContent).toBe('3 of 3 sections drafted');
    expect(screen.getByTestId('dc-updated').textContent).toBe('Updated after AnA\u2019s last turn: 2.5.3');
  });

  it('a quiet re-read that fails keeps the document on screen and says the refresh failed', async () => {
    const { rerender } = render(<LiveHost refreshKey={0} />);
    await screen.findByRole('list', { name: 'Sections' });
    mockApi({ sections: () => ok({ error: 'boom' }, 500) });
    rerender(<LiveHost refreshKey={1} />);
    expect(await screen.findByTestId('dc-refresh-failed')).toBeTruthy();
    // The record already read stays: a failed refresh is not an empty document.
    expect(screen.getByRole('list', { name: 'Sections' })).toBeTruthy();
    expect(screen.queryByTestId('dc-error')).toBeNull();
  });
});
