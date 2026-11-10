// @vitest-environment jsdom
/**
 * FILING_SPINE.md F4 — an unstarted section can be started.
 *
 * The governed outline names every part the filing needs. A node with no
 * section in the open document used to answer a click with a toast, "no draft
 * yet in this document", and nothing else: the outline listed the work and
 * offered no way to begin it. A click now creates the section through the one
 * create route, `POST /api/authoring/sections`, with the node's code, and opens
 * it in the editor with the cursor in it. A refusal is shown in the server's
 * words, and a frozen or approved document offers no start.
 *
 * Only in the right document. The outline is the project's governed filing,
 * and a project holds many authoring documents of which one is the filing's
 * editing copy (`c2c_document_id`). Since 3d9879dfc7 an AnA draft or any other
 * unbound working copy is shown as its saved draft, with no filing outline to
 * start from, and a document whose binding is not stated fails closed: the
 * outline is said to be unread and nothing is offered or posted.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
  };
});

import { ApiRequestError } from '@/lib/queryClient';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const PROJECT_ID = '11111111-2222-3333-4444-555555555555';
const C2C_DOC = 'C2CDOC-1';

function ok(payload: unknown, status = 200) {
  return { ok: true, status, json: async () => payload } as Response;
}

const section = (id: string, code: string, title: string, order: number) => ({
  id, doc_id: 'D1', code, title, content: order === 0 ? '<p>The drug substance is a small molecule.</p>' : '',
  order_index: order, comment_count: 0, revision_count: 1, citation_count: 0,
  updated_at: '2026-10-08T10:00:00Z',
});
const S1 = section('S1', '3.1', 'Quality overview', 0);
const S2 = section('S2', '3.5', 'Clinical summary', 1);

type CreateReply =
  | 'created'
  | 'hold'
  | { refuse: number; error: string; code?: string; startedMeanwhile?: boolean };

interface DocRow { id: string; title: string; module: string; status: string; c2c_document_id?: string | null }

/** The filing's editing copy, as GET /api/authoring/docs lists it. */
const FILING_COPY: DocRow = { id: 'D1', title: 'Quality module', module: 'M3', status: 'draft', c2c_document_id: C2C_DOC };

/** The list as GET /api/authoring/docs answers a project read (authoring-document-read.ts): success, and each row's program_id. */
const scopedList = (url: string, body: { success?: boolean; documents: object[] }) => {
  const programId = new URLSearchParams(url.split('?')[1]).get('programId');
  return programId === null ? body : { success: true, ...body, documents: body.documents.map(row => ({ program_id: programId, ...row })) };
};
/** GET /api/c2c/documents as server/routes/c2c/documents.ts answers it: each row's project_id, and `scope` lists only that part. */
const c2cDocuments = (url: string, home: object[], market: object[] = []) => {
  const query = new URLSearchParams(url.split('?')[1]);
  const rows = query.get('scope') === 'market' ? market : query.get('scope') === 'home' ? home : [...home, ...market];
  return { documents: rows.map(row => ({ ...row, project_id: query.get('projectId') })) };
};
/** A listed document's header (authoring-document-read.ts readAuthoringDocument: the row and its client_program_id), and the project's filings. */
function governedRead(url: string, pathname: string, docs: readonly DocRow[]): Response | null {
  const header = /^\/api\/authoring\/docs\/([^/]+)$/.exec(pathname);
  const listed = header && docs.find(d => d.id === header[1]);
  if (listed) return ok({ success: true, document: { ...listed, client_program_id: PROJECT_ID } });
  if (!url.startsWith('/api/c2c/documents?projectId=')) return null;
  return ok(c2cDocuments(url, [{ id: C2C_DOC, doc_type: 'bla', agency: 'fda', title: 'BLA 125000', rule_pack_version: 'v1', status: 'draft', readiness: 20 }]));
}

function wire(opts: { docs?: DocRow[]; create?: CreateReply; sections?: ReturnType<typeof section>[] } = {}) {
  const sections = [...(opts.sections ?? [S1])];
  const docs = opts.docs ?? [FILING_COPY];
  let release: (() => void) | null = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) {
      return ok(scopedList(url, {
        success: true,
        documents: docs.map(d => ({ product_code: 'ABC', updated_at: '2026-08-01T10:00:00Z', section_count: 1, ...d })),
      }));
    }
    const secs = /^\/api\/authoring\/docs\/([^/]+)\/sections$/.exec(pathname);
    if (method === 'GET' && secs) {
      return ok({ success: true, sections: sections.map(s => ({ ...s, doc_id: secs[1] })) });
    }
    const read = method === 'GET' && governedRead(url, pathname, docs);
    if (read) return read;
    if (method === 'GET' && url === `/api/c2c/documents/${C2C_DOC}/outline`) {
      const node = (key: string, label: string, order: number) => ({
        key, parent_key: null, label, mandatory: true, path_order: order, status: 'todo', draft_source: null, has_content: false, version: 1,
      });
      return ok({
        document: { id: C2C_DOC, title: 'BLA 125000', doc_type: 'bla', agency: 'fda', status: 'draft', readiness: 20 },
        outline: [
          node('2.5', 'Clinical overview', 1),
          node('3.1', 'Quality overview', 2),
          node('3.2.S.1', 'General information', 3),
          node('3.5', 'Clinical summary', 4),
        ],
      });
    }
    if (method === 'POST' && url === '/api/authoring/sections') {
      const reply = opts.create ?? 'created';
      if (reply === 'hold') await new Promise<void>(r => { release = r; });
      else if (reply !== 'created') {
        if (reply.startedMeanwhile) sections.push(S2);
        throw new ApiRequestError(reply.error, reply.refuse, { success: false, error: reply.error }, reply.code);
      }
      sections.push(S2);
      return ok({ success: true, section: S2 }, 201);
    }
    return ok({ success: true });
  });
  return { release: () => release?.() };
}

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

const creates = () => apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/authoring/sections');

/** The outline row for an unstarted node, once the sections have been read. */
async function unstartedRow(label = 'Clinical summary'): Promise<HTMLButtonElement> {
  const el = await screen.findByText(label, { selector: '.ed-tree-row .ed-lbl' });
  const row = el.closest('button') as HTMLButtonElement;
  await waitFor(() => expect(row.getAttribute('title') ?? '').toMatch(/not started in this document/));
  return row;
}

const UNBOUND_NOTE = 'Unbound working copy. These sections belong to the saved draft. Review and place the document into a filing before treating them as filing sections.';
const OUTLINE_UNREAD = 'The governed filing outline could not be read — what is listed below is the document list, not the filing outline.';
const outlineReads = () => apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && /^\/api\/c2c\/documents\/[^/?]+\/outline/.test(String(u)));

/** The project's filings (home and market) are read and the open section is on the canvas: where a bound copy reads its outline. */
async function settled(): Promise<void> {
  await waitFor(() => expect(['&scope=home', '&scope=market'].every(s => apiRequest.mock.calls.some(([, u]) => String(u).endsWith(s)))).toBe(true));
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('The drug substance is a small molecule.'));
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
}

/** The tree pane of a known unbound copy (DocumentWorkbench: unboundDraft), once settled. */
async function expectUnbound(title: string): Promise<void> {
  await waitFor(() => expect(document.querySelector('.ed-tree-m')?.textContent).toBe('Saved draft sections · unbound'));
  expect(document.querySelector('.ed-tree-t')?.textContent).toBe(title);
  expect(screen.getByText(UNBOUND_NOTE)).toBeTruthy();
  await settled();
}

/** No filing outline: no outline read, no outline-only node, no start (startOutlineSection.ts) and nothing posted. */
function expectNoOutlineOffered(): void {
  expect(outlineReads()).toHaveLength(0);
  for (const label of ['Clinical overview', 'General information', 'Clinical summary']) expect(screen.queryByText(label)).toBeNull();
  expect(document.querySelector('[title*="not started in this document"], [aria-label*="Start this section"]')).toBeNull();
  expect(creates()).toHaveLength(0);
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PROJECT_ID };
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('the outline starts a section that is not started yet (F4)', () => {
  it('clicking an unstarted node in the filing’s copy posts the create with its code, opens the new section and puts the cursor in it', async () => {
    wire();
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();
    expect(row.getAttribute('title')).toMatch(/Select to start it/);
    expect(row.getAttribute('aria-label')).toBe('3.5 Clinical summary, required, not started. Start this section in this document.');
    expect(row.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(row);

    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0][2]).toEqual({ doc_id: 'D1', code: '3.5', title: 'Clinical summary', content: '' });

    // Opened: the row is now the active one and the editor is on section 3.5.
    await waitFor(() => expect(row.getAttribute('data-active')).toBe('true'));
    await screen.findByText(/Section started · 3\.5 Clinical summary/);
    await waitFor(() => {
      const el = document.activeElement as HTMLElement | null;
      expect(el?.getAttribute('contenteditable')).toBe('true');
      expect(el?.getAttribute('aria-label') ?? '').toContain('Section 3.5');
    });
    expect(screen.queryByText(/no draft yet in this document/)).toBeNull();
  });

  it('a refused create shows the server’s words and opens nothing', async () => {
    wire({ create: { refuse: 403, error: 'You do not have edit access to this document.' } });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();

    fireEvent.click(row);

    await screen.findByText(/3\.5 was not started — You do not have edit access to this document\./);
    expect(creates()).toHaveLength(1);
    expect(row.getAttribute('data-active')).toBeNull();
  });

  it('a 409 (someone else started it) re-reads, and the node binds to their section', async () => {
    wire({ create: { refuse: 409, error: 'Section 3.5 already exists in this document.', code: 'SECTION_CODE_EXISTS', startedMeanwhile: true } });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();

    fireEvent.click(row);

    await screen.findByText(/3\.5 was not started — Section 3\.5 already exists/);
    await waitFor(() => expect(row.getAttribute('title')).toBe('Clinical summary — open'));
    expect(creates()).toHaveLength(1);
  });

});

describe('the outline offers a start only where the section can be started (F4)', () => {
  it('an approved document says approved, offers no start and posts nothing', async () => {
    wire({ docs: [{ ...FILING_COPY, status: 'approved' }] });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();
    expect(row.getAttribute('title')).toMatch(/This document is approved, so no section can be added\./);
    expect(row.getAttribute('title')).not.toMatch(/start it|frozen/);
    expect(row.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(row);

    await screen.findByText(/3\.5 Clinical summary was not started\. This document is approved/);
    expect(creates()).toHaveLength(0);
  });

  /* A section of the filing is never started into a copy that is not the filing's. An AnA draft
     (c2c_document_id null) is a known unbound copy: since 3d9879dfc7 it borrows no filing outline,
     so there is no outline node to click, no outline read and nothing to post. The filing's own
     copy stays listed, to be opened instead. */
  it('with an AnA draft open (not the filing’s copy), no filing outline is offered: the tree says unbound and nothing can be started', async () => {
    wire({ docs: [{ id: 'DRAFT', title: 'Clinical overview draft', module: 'M2', status: 'draft', c2c_document_id: null }, FILING_COPY] });
    render(<DocumentAuthoring {...props()} />);
    await expectUnbound('Clinical overview draft');
    expect(screen.getByRole('button', { name: /Quality module/ })).toBeTruthy();
    expectNoOutlineOffered();
  });

  /* The same for a module-3 working document that is not the filing's copy: it takes no module-2
     node. The project's filing is reached only through its explicit start (create its editing copy). */
  it('a module-3 working document that is not the filing’s copy takes no module-2 node: only the filing’s explicit start is offered', async () => {
    wire({ docs: [{ id: 'D3', title: 'Quality notes', module: 'M3', status: 'draft', c2c_document_id: null }] });
    render(<DocumentAuthoring {...props()} />);
    await expectUnbound('Quality notes');
    const filings = screen.getByTestId('ed-filings');
    expect(filings.textContent).toContain('FDA · BLA — home filing');
    expect(within(filings).getByRole('button', { name: 'Create editing copy' })).toBeTruthy();
    expectNoOutlineOffered();
  });

  /* Neither the list nor the header states the binding (known: false). The editor fails closed:
     it says the governed outline could not be read, offers no outline node and starts nothing. */
  it('when neither the document list nor its header says what a document is bound to, the outline fails closed and nothing is offered', async () => {
    const unsaid: DocRow = { ...FILING_COPY };
    delete unsaid.c2c_document_id;
    wire({ docs: [unsaid] });
    render(<DocumentAuthoring {...props()} />);
    expect((await screen.findByText(OUTLINE_UNREAD)).getAttribute('role')).toBe('alert');
    expect(document.querySelector('.ed-tree-m')?.textContent).toBe('1 document · all');
    expect(screen.queryByText(UNBOUND_NOTE)).toBeNull();
    await settled();
    expectNoOutlineOffered();
  });

  it('a section whose code differs only in case is said, not posted into a 409', async () => {
    wire({ sections: [S1, section('S9', '3.2.s.1', 'Drug substance notes', 2)] });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow('General information');
    expect(row.getAttribute('title')).toMatch(/already has a section coded “3\.2\.s\.1”\. The filing reads codes exactly/);

    fireEvent.click(row);

    await screen.findByText(/3\.2\.S\.1 General information was not started\. This document already has a section coded/);
    expect(creates()).toHaveLength(0);
  });

  it('while a create runs, its row is busy and a click on another node is answered, not dropped', async () => {
    const pending = wire({ create: 'hold' });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();
    const other = await unstartedRow('Clinical overview');

    fireEvent.click(row);
    await waitFor(() => expect(row.getAttribute('aria-busy')).toBe('true'));
    expect(row.getAttribute('aria-label')).toMatch(/Starting this section\./);

    fireEvent.click(other);
    await screen.findByText('Starting 3.5 — select 2.5 again when it opens.');
    expect(creates()).toHaveLength(1);

    pending.release();
    await waitFor(() => expect(row.getAttribute('data-active')).toBe('true'));
    expect(row.getAttribute('aria-busy')).toBeNull();
  });
});

/* D4-4 (D4.md §D4.C): the outline appears when asked for, as Claude's sidebar does. A toggle in the bar shows and
   hides it and the choice is remembered; it opens by default on the page at 1280 px and wider, closed beside the
   conversation, and always while no document is open, because then it is the list. Required nodes carry a ring with
   "required" for a screen reader rather than a REQUIRED pill, and unstarted rows are not dimmed by opacity. */
describe('the outline on demand (D4-4)', () => {
  const wide = (matches: boolean) => { (window as any).matchMedia = (q: string) => ({ matches: matches && /min-width:\s*1280px/.test(q), media: q, addEventListener() {}, removeEventListener() {} }); };
  const aside = () => document.querySelector('aside.ed-tree') as HTMLElement;
  const toggle = () => screen.getByTestId('ed-outline-toggle');
  beforeEach(() => { try { localStorage.removeItem('c2c.editor.outline'); } catch { /* none */ } });
  afterEach(() => { delete (window as any).matchMedia; });

  it('opens on the page at 1280 px and wider; the toggle hides it, says so, and is remembered', async () => {
    wide(true); wire();
    const view = render(<DocumentAuthoring {...props()} />);
    await unstartedRow();
    expect(aside().hidden).toBe(false);
    expect(document.querySelector('.ed')?.getAttribute('data-outline')).toBe('open');
    expect(toggle().getAttribute('aria-controls')).toBe(aside().id);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle());
    expect(aside().hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.ed')?.getAttribute('data-outline')).toBe('closed');
    expect(localStorage.getItem('c2c.editor.outline')).toBe('closed');
    view.unmount(); cleanup();
    render(<DocumentAuthoring {...props()} />);
    await unstartedRow();
    expect(aside().hidden).toBe(true);
  });

  it('is closed by default on a narrower page, and open whenever no document is open', async () => {
    wide(false); wire();
    const view = render(<DocumentAuthoring {...props()} />);
    await unstartedRow();
    expect(aside().hidden).toBe(true);
    view.unmount(); cleanup();
    wire({ docs: [] });
    render(<DocumentAuthoring {...props()} />);
    await waitFor(() => expect(document.querySelector('.ed-tree-m')?.textContent).toMatch(/^0 documents/));
    expect(aside().hidden).toBe(false);
    expect((toggle() as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks a required node with a ring and "required" for a screen reader, and no unstarted row is dimmed', async () => {
    wide(true); wire();
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();
    const tree = aside();
    const seen = (el: Element) => { const c = el.cloneNode(true) as Element; c.querySelectorAll('.sr-only').forEach(n => n.remove()); return c.textContent ?? ''; };
    for (const r of tree.querySelectorAll('.ed-tree-row')) expect(seen(r)).not.toMatch(/required/i);
    const rings = tree.querySelectorAll('.ed-tree-row .ed-req');
    expect(rings.length).toBe(3);
    for (const ring of rings) {
      expect(ring.getAttribute('title')).toBe('Required by the rule pack');
      expect(ring.querySelector('.sr-only')?.textContent).toBe('required');
    }
    expect(tree.querySelector('.rd-chip')).toBeNull();
    expect(row.hasAttribute('data-unstarted')).toBe(true);
    for (const r of tree.querySelectorAll<HTMLElement>('.ed-tree-row')) expect(r.style.opacity).toBe('');
    expect(tree.querySelector('.ed-tree-key')?.textContent).toMatch(/required, not started · .*drafted/);
  });
});
