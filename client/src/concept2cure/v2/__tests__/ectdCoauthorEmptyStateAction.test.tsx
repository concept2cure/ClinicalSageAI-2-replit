// @vitest-environment jsdom
/**
 * eCTD Co-Author on an org with no co-author documents: the empty state names
 * a path that exists, and the pane headers do not describe a document that is
 * not open.
 *
 * ── The finding (launch sweep, empty org) ────────────────────────────────────
 * The artifact pane read "Create a co-author document to draft it against the
 * eCTD backbone … or ask AnA to start one." The surface had no create control
 * (its only POSTs are …/validate and the governed-action sign-off) and no AnA
 * tool writes a coauthor_documents row. Co-author documents are created by
 * placing a document into a filing (AuthoringPlaceIntoFiling → POST
 * /api/coauthor/documents), so the empty state now says that and opens the
 * document editor, which carries that control.
 *
 * Beside it, the AnA pane header read "co-authoring §— — bound to the dossier"
 * while the artifact said "No document selected", and the tree header read
 * "M1--5".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* jsdom has no layout; ProseMirror asks for client rects on mount (same shim
   as ectdCoauthorNoFixtures.test.tsx). */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { EctdCoauthor } from '../surfaces/EctdCoauthor';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj } as Response);

function serveDocs(payload: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(payload);
    return ok({});
  });
}

const makeProps = () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  surface: { id: 'ectd-coauthor', label: 'eCTD' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const text = () => document.body.textContent ?? '';

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('EctdCoauthor — empty org', () => {
  it('names the path that creates a co-author document and offers a control that reaches it', async () => {
    serveDocs({ documents: [], total: 0 });
    const props = makeProps();
    render(<EctdCoauthor {...props} />);

    expect(await screen.findByText('No eCTD documents yet')).toBeTruthy();

    // The promises the surface could not keep, asserted first so a regression
    // names the defect.
    expect(text(), 'no create control exists on this surface').not.toMatch(/Create a co-author document/);
    expect(text(), 'no AnA tool creates a co-author document').not.toMatch(/ask AnA to start one/);

    // The path that does create one is named, and the action reaches it.
    expect(text()).toMatch(/placed into a filing/);
    const open = screen.getByRole('button', { name: 'Open the document editor' });
    fireEvent.click(open);
    expect(props.onNav).toHaveBeenCalledWith('document-authoring');
  });

  it('does not describe a section as being co-authored when no document is open', async () => {
    serveDocs({ documents: [], total: 0 });
    render(<EctdCoauthor {...makeProps()} />);
    await screen.findByText('No eCTD documents yet');

    const hint = document.querySelector('.ec-intel-head .hint')?.textContent ?? '';
    expect(hint, 'the AnA header claimed a binding to a section that is not open').not.toMatch(/§—/);
    expect(hint).not.toMatch(/bound to the dossier/);
    expect(hint).toBe('No document open');

    const treeHead = document.querySelector('.ec-tree-head')?.textContent ?? '';
    expect(treeHead).not.toContain('M1--5');
    expect(treeHead).toContain('M1–M5');
  });

  it('still names the open section once a document is open (over-correction guard)', async () => {
    serveDocs({
      documents: [
        { id: 9101, title: 'Clinical Overview — QX-4', content: '<p>Overview.</p>', status: 'draft', moduleNumber: '2.5' },
      ],
      total: 1,
    });
    render(<EctdCoauthor {...makeProps()} />);
    // The tree row is the settled-read signal.
    await screen.findAllByText('Clinical Overview — QX-4');

    const hint = document.querySelector('.ec-intel-head .hint')?.textContent ?? '';
    expect(hint).toBe('co-authoring §2.5');
    expect(text()).not.toMatch(/No eCTD documents yet/);
  });
});
