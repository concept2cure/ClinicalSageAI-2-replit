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
 * editing copy (`c2c_document_id`). A click in an AnA draft or any other
 * working document, or in a document whose binding the list did not state,
 * posts nothing and names the document that holds the filing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

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

function wire(opts: { docs?: DocRow[]; create?: CreateReply; sections?: ReturnType<typeof section>[] } = {}) {
  const sections = [...(opts.sections ?? [S1])];
  const docs = opts.docs ?? [FILING_COPY];
  let release: (() => void) | null = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) {
      return ok({
        success: true,
        documents: docs.map(d => ({ product_code: 'ABC', updated_at: '2026-08-01T10:00:00Z', section_count: 1, ...d })),
      });
    }
    const secs = /^\/api\/authoring\/docs\/([^/]+)\/sections$/.exec(url);
    if (method === 'GET' && secs) {
      return ok({ success: true, sections: sections.map(s => ({ ...s, doc_id: secs[1] })) });
    }
    if (method === 'GET' && url.startsWith('/api/c2c/documents?projectId=')) {
      return ok({ documents: [{ id: C2C_DOC, doc_type: 'bla', agency: 'fda', title: 'BLA 125000', rule_pack_version: 'v1', status: 'draft', readiness: 20 }] });
    }
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

  it('with an AnA draft open (not the filing’s copy), a click posts nothing and names the document that holds the filing', async () => {
    wire({
      docs: [
        { id: 'DRAFT', title: 'Clinical overview draft', module: 'M2', status: 'draft', c2c_document_id: null },
        FILING_COPY,
      ],
    });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();

    fireEvent.click(row);

    // Whatever the click did, it answered; it must not have created anything.
    await screen.findByText(/3\.5 (Clinical summary )?was not started|Section started/);
    expect(creates()).toHaveLength(0);
    await screen.findByText(/3\.5 Clinical summary was not started\. This outline belongs to BLA 125000/);
    expect(row.getAttribute('title')).toMatch(/This outline belongs to BLA 125000, and this document is not its editing copy/);
    expect(row.getAttribute('title')).toMatch(/Open “Quality module” to start it\./);
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('a module-3 working document that is not the filing’s copy does not take a module-2 node', async () => {
    wire({ docs: [{ id: 'D3', title: 'Quality notes', module: 'M3', status: 'draft', c2c_document_id: null }] });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow('Clinical overview');

    fireEvent.click(row);

    await screen.findByText(/2\.5 (Clinical overview )?was not started|Section started/);
    expect(creates()).toHaveLength(0);
    await screen.findByText(/2\.5 Clinical overview was not started\. This outline belongs to BLA 125000/);
    expect(screen.getByText(/Open the document that holds BLA 125000 to start it\./)).toBeTruthy();
  });

  it('when the document list does not say what a document is bound to, nothing is offered', async () => {
    const unsaid: DocRow = { ...FILING_COPY };
    delete unsaid.c2c_document_id;
    wire({ docs: [unsaid] });
    render(<DocumentAuthoring {...props()} />);
    const row = await unstartedRow();
    expect(row.getAttribute('title')).toMatch(/Whether this document is the editing copy of BLA 125000 is not known/);

    fireEvent.click(row);

    await screen.findByText(/3\.5 Clinical summary was not started\. Whether this document/);
    expect(creates()).toHaveLength(0);
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
