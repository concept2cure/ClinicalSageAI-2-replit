// @vitest-environment jsdom
/**
 * DocumentWorkbench — three keyboard and screen-reader defects from the
 * 2026-09-28 coverage-gap sweep, each pinned through the Authoring surface
 * that mounts the workbench.
 *
 * GA-4  Escape closed only the AnA rail, and the History, Comments, Sources,
 *       Signatures, Audit and Exports rails had no close control inside them:
 *       the way out was to find the toolbar toggle again.
 * GA-5  "Verify ledger" wrote its verdict — including "Ledger BROKEN … treat
 *       this section's record as disputed" — into plain spans with no live
 *       region, so a screen reader announced nothing.
 * GA-6  Closing the inline section rename (Escape, Cancel, or a save)
 *       unmounted the focused control and left focus on <body>.
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
/* Renders the refusal props the workbench hands the bar (GE-P-3); the bar's
   own rendering of them is pinned in authoringFilingBar.test.tsx. */
vi.mock('../surfaces/AuthoringFilingBar', () => ({
  AuthoringFilingBar: (p: { freezeRefusal?: string | null; esignRefusal?: string | null }) => (
    <span data-testid="bar-props">{JSON.stringify({ freeze: p.freezeRefusal ?? null, esign: p.esignRefusal ?? null })}</span>
  ),
}));
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

const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const DOCS = {
  success: true,
  documents: [{ id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1 }],
};
const SECTION = { id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: '<p>The drug substance is a monoclonal antibody.</p>', order_index: 0, comment_count: 0, revision_count: 2, citation_count: 0, updated_at: '2026-07-20T10:00:00Z' };

let docAccess: unknown = undefined;
let ledgerAnswer: () => Response = () => ok({ success: true, intact: true, revisionCount: 2, chainedCount: 2, preLedgerCount: 0, breaks: [] });

/** GET /api/authoring/docs/D1, carrying `access` only when a test set one. */
const docRead = () =>
  ok({ success: true, document: { ...DOCS.documents[0], provenance: null }, ...(docAccess !== undefined ? { access: docAccess } : {}) });

function props() {
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

beforeEach(() => {
  docAccess = undefined;
  ledgerAnswer = () => ok({ success: true, intact: true, revisionCount: 2, chainedCount: 2, preLedgerCount: 0, breaks: [] });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1') return docRead();
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok({ success: true, sections: [SECTION] });
    if (method === 'GET' && url === '/api/authoring/sections/S1/history/verify') return ledgerAnswer();
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') return ok({ success: true, data: [] });
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      return ok({ success: true, section: { ...SECTION, code: '3.2.S.1.1', title: 'General Information (revised)' } });
    }
    return ok({ success: true });
  });
});
afterEach(() => cleanup());

async function mount() {
  render(<DocumentAuthoring {...props()} />);
  await waitFor(() => expect(document.querySelector('.rse-body .tiptap')?.textContent).toContain('monoclonal antibody'));
}

/** The toolbar toggle that opens a rail, by its leading word. */
function toggle(word: string): HTMLButtonElement {
  const bar = document.querySelector('.ed-doc-actions') as HTMLElement;
  return within(bar).getByRole('button', { name: new RegExp('^\\s*' + word) }) as HTMLButtonElement;
}
/** Every open right rail except AnA's. */
const openRails = () =>
  Array.from(document.querySelectorAll('aside.ed-comments')).filter(a => a.getAttribute('aria-label') !== 'AnA — document authoring');

const RAILS = ['Comments', 'History', 'Sources', 'Signatures', 'Audit', 'Exports'];

describe('GA-4: every right rail closes from the keyboard', () => {
  it.each(RAILS)('the %s rail closes on Escape and returns focus to its toggle', async (word) => {
    await mount();
    const t = toggle(word);
    fireEvent.click(t);
    await waitFor(() => expect(openRails()).toHaveLength(1));
    /* Focus where it sits after a click on non-focusable chrome. */
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(openRails(), `${word}: Escape left the rail open`).toHaveLength(0));
    expect(document.activeElement).toBe(toggle(word));
  });

  it.each(RAILS)('the %s rail has its own labelled close control', async (word) => {
    await mount();
    fireEvent.click(toggle(word));
    await waitFor(() => expect(openRails()).toHaveLength(1));
    const close = within(openRails()[0] as HTMLElement).getByRole('button', { name: /^close /i });
    fireEvent.click(close);
    await waitFor(() => expect(openRails()).toHaveLength(0));
    expect(document.activeElement).toBe(toggle(word));
  });

  it('leaves Escape to a text field inside the rail', async () => {
    await mount();
    fireEvent.click(toggle('Comments'));
    await waitFor(() => expect(openRails()).toHaveLength(1));
    const found = openRails()[0].querySelector('textarea');
    expect(found, 'the comments rail renders its comment field').not.toBeNull();
    const field = found as HTMLTextAreaElement;
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(openRails()).toHaveLength(1);
  });
});

describe('GA-5: the ledger verdict is announced', () => {
  async function verify() {
    await mount();
    fireEvent.click(toggle('History'));
    const btn = await screen.findByRole('button', { name: /verify ledger/i });
    /* The regions exist BEFORE the verdict arrives — a live region mounted
       together with its text is not announced. */
    const rail = openRails()[0] as HTMLElement;
    const row = btn.parentElement as HTMLElement;
    expect(within(row).queryAllByRole('status'), 'no status region beside Verify ledger before the verdict').toHaveLength(1);
    expect(within(row).queryAllByRole('alert'), 'no alert region beside Verify ledger before the verdict').toHaveLength(1);
    fireEvent.click(btn);
    return rail;
  }

  it('puts an intact verdict in a status region', async () => {
    const rail = await verify();
    await waitFor(() => {
      const hit = within(rail).getAllByRole('status').find(el => /ledger intact/i.test(el.textContent ?? ''));
      expect(hit, 'the intact verdict is not in a status region').toBeTruthy();
    });
  });

  it('puts a broken verdict in an alert region', async () => {
    ledgerAnswer = () => ok({ success: true, intact: false, revisionCount: 2, chainedCount: 2, preLedgerCount: 0, breaks: [{ revisionId: 'r2', reason: 'hash mismatch' }] });
    const rail = await verify();
    await waitFor(() => {
      const hit = within(rail).getAllByRole('alert').find(el => /ledger broken/i.test(el.textContent ?? ''));
      expect(hit, 'the BROKEN verdict is not in an alert region').toBeTruthy();
    });
  });

  it('puts a failed check in an alert region', async () => {
    ledgerAnswer = () => ok({ error: 'down' }, 503);
    const rail = await verify();
    await waitFor(() => {
      const hit = within(rail).getAllByRole('alert').find(el => /couldn.t recompute the ledger/i.test(el.textContent ?? ''));
      expect(hit, 'the failed check is not in an alert region').toBeTruthy();
    });
  });
});

describe('GA-6: closing the section rename returns focus to Rename', () => {
  const renameBtn = () => screen.getByRole('button', { name: /^\s*rename$/i });
  async function openRename() {
    await mount();
    fireEvent.click(renameBtn());
    return await screen.findByRole('group', { name: /rename section/i });
  }

  it('after Escape', async () => {
    const group = await openRename();
    fireEvent.keyDown(within(group).getByLabelText('Section code'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('group', { name: /rename section/i })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(renameBtn()));
  });

  it('after Cancel', async () => {
    const group = await openRename();
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: /rename section/i })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(renameBtn()));
  });

  it('an Escape the rename handled does not also close the AnA rail', async () => {
    // 2026-09-28: the AnA rail's Escape listener did not check whether the key
    // had already been handled, so leaving the rename also dismissed AnA.
    await mount();
    const ana = () => screen.queryByLabelText(/AnA — document authoring/);
    if (!ana()) fireEvent.click(toggle('AnA'));
    await waitFor(() => expect(ana()).not.toBeNull());
    fireEvent.click(renameBtn());
    const group = await screen.findByRole('group', { name: /rename section/i });
    fireEvent.keyDown(within(group).getByLabelText('Section code'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('group', { name: /rename section/i })).toBeNull());
    expect(ana(), 'AnA closed on an Escape the rename already handled').not.toBeNull();
  });

  it('after a successful rename', async () => {
    const group = await openRename();
    fireEvent.change(within(group).getByLabelText('Section title'), { target: { value: 'General Information (revised)' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: /rename section/i })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(renameBtn()));
  });
});

/* 2026-09-28, coverage-gap sweep GE-P-3: the workbench offered Assign review
   (Send for review since 2026-10-08, which creates the same task with the
   review request, so the same gate applies),
   File to vault, Freeze and E-sign to every member who could open the
   document. GET /docs/:id now carries the caller's `access`; a refused act is
   disabled (never hidden) and described by the server's reason, and an
   unknown one stays enabled for the server to decide. */
describe('GE-P-3: governed acts the server will refuse are disabled with the reason', () => {
  const describedBy = (el: Element) =>
    (el.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  const NO = (act: string) => ({ allowed: false, reason: `${act} needs a grant you do not hold.` });

  it('disables each refused act, states why, and hands the bar its refusals', async () => {
    docAccess = { freeze: NO('Freezing'), esign: NO('Signing'), fileToVault: NO('Filing to the vault'), assignReview: NO('Sending for review') };
    await mount();
    const assign = screen.getByTestId('send-for-review-open') as HTMLButtonElement;
    const vault = screen.getByTestId('file-to-vault-open') as HTMLButtonElement;
    await waitFor(() => expect(assign.disabled, 'Send for review offered to a caller the server will refuse').toBe(true));
    expect(describedBy(assign)).toBe('Sending for review needs a grant you do not hold.');
    expect(vault.disabled).toBe(true);
    expect(describedBy(vault)).toBe('Filing to the vault needs a grant you do not hold.');
    expect(JSON.parse(screen.getByTestId('bar-props').textContent ?? '{}')).toEqual({
      freeze: 'Freezing needs a grant you do not hold.',
      esign: 'Signing needs a grant you do not hold.',
    });

    fireEvent.click(toggle('Tasks'));
    const rt = (await screen.findByTestId('rt-send-review')) as HTMLButtonElement;
    expect(rt.disabled).toBe(true);
    expect(describedBy(rt)).toBe('Sending for review needs a grant you do not hold.');
  });

  it('leaves every act enabled when the access is unknown — not returned, or unreadable', async () => {
    docAccess = { freeze: null, esign: 'garbage', fileToVault: { allowed: 'no' } };
    await mount();
    await waitFor(() => expect(screen.getByTestId('bar-props').textContent).toBe(JSON.stringify({ freeze: null, esign: null })));
    expect((screen.getByTestId('send-for-review-open') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('file-to-vault-open') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(toggle('Tasks'));
    expect(((await screen.findByTestId('rt-send-review')) as HTMLButtonElement).disabled).toBe(false);
  });

  it('enables an act the server allows', async () => {
    docAccess = { freeze: { allowed: true, reason: null }, esign: { allowed: true, reason: null }, fileToVault: { allowed: true, reason: null }, assignReview: { allowed: true, reason: null } };
    await mount();
    await waitFor(() => expect(screen.getByTestId('bar-props').textContent).toBe(JSON.stringify({ freeze: null, esign: null })));
    expect((screen.getByTestId('send-for-review-open') as HTMLButtonElement).disabled).toBe(false);
  });
});
