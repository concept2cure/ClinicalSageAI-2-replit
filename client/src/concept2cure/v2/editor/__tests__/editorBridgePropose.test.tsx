// @vitest-environment jsdom
/**
 * EditorBridge.propose — the conversation's door to an anchored proposal.
 *
 * The conversation never holds the editor; it holds the bridge the embedded
 * workbench hands it for the open section (DocumentWorkbench's
 * `onEditorBridge` effect). An AnA proposal names the section it is for
 * (`sectionId`) and the version of it AnA READ — the SHA-256 of its stored
 * content (`baseSha256`, the hash authoring-read reports) and/or its
 * `updated_at` (`baseUpdatedAt`). The bridge refuses:
 *   - `wrong-section` when the proposal is for a section that is not open;
 *   - `no-base` when it names no version at all — a quote with no base cannot
 *     be shown to have been chosen against the text that is there;
 *   - `stale` when either base differs from the section as loaded, or the
 *     section was saved, reverted or switched after the bridge was handed out;
 *   - `not-editable` when the document is sealed;
 * and otherwise goes through the editor handle's `proposeReplacement`, which
 * refuses for itself where the section cannot take it.
 *
 * Stood up the way the conversation stands it up: DocumentCanvas, expanded,
 * over a mocked store — so the bridge under test is the one the effect builds.
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
/* Header widgets unrelated to the bridge, which reach for hooks this test does
   not stand up — the same stubs the canvas suites use. */
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

/* The sealed-document branch of the bridge, isolated. A sealed document also
   makes the real editor read-only, so the editor's own `not-editable` would
   pass that test whether or not the bridge checks the seal. With `stub.on`,
   the workbench mounts an editor that is always editable and records every
   proposal that reaches it: the refusal must then come from the bridge. */
const stub = vi.hoisted(() => ({ on: false, calls: 0 }));
vi.mock('../RichSectionEditor', async (importOriginal) => {
  const real = await importOriginal<typeof import('../RichSectionEditor')>();
  const Stub = React.forwardRef<unknown, { value?: string }>((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      proposeReplacement: () => {
        stub.calls += 1;
        return { ok: true };
      },
      insertSuggestion: () => true,
      getContent: () => props.value ?? '',
    }));
    return <div className="tiptap" data-testid="editor-stub" />;
  });
  type Props = React.ComponentProps<typeof real.RichSectionEditor>;
  const RichSectionEditor = React.forwardRef<unknown, Props>((props, ref) =>
    stub.on ? (
      <Stub ref={ref} value={props.value} />
    ) : (
      <real.RichSectionEditor {...props} ref={ref as React.Ref<never>} />
    ),
  );
  return { ...real, RichSectionEditor };
});

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

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { DocumentCanvas } from '../DocumentCanvas';
import type { EditorBridge } from '../DocumentWorkbench';
import { clearEditorTarget } from '../../editorTarget';
import { TrackChanges, proposeReplacement } from '../suggestions';
import { computeMatches } from '../findReplace';

const DOC = 'aaaaaaaa-0000-4000-8000-0000000000b4';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
/* What the store says the section was last saved at, and holds. */
const SAVED_AT = '2026-09-30T12:00:00Z';
const STORED = '<p>The product is stable for 18 months at 25 °C/60% RH.</p>';
/* The base authoring-read reports: SHA-256 of the stored content, hex. */
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const STORED_SHA = sha256(STORED);
/* After a save: the row the server hands back. */
const SAVED_AGAIN_AT = '2026-10-01T09:30:00Z';
let patched: string | null = null;
const TURN = 'b2e7d9f0-1a3c-4b5d-9e8f-7a6b5c4d3e21';
const ANA = { id: 'ana', name: 'AnA (AI draft)', sourceRecord: TURN };

const ok = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as Response;

function mockApi(status = 'DRAFT', stored = STORED) {
  const exact: Record<string, () => Response> = {
    [`/api/authoring/docs/${DOC}`]: () =>
      ok({
        success: true,
        document: {
          id: DOC, title: 'Module 3.2.P.8 Stability', module: 'M3', product_code: null,
          status, updated_at: SAVED_AT, section_count: 1,
        },
      }),
    [`/api/authoring/docs/${DOC}/sections`]: () =>
      ok({
        success: true,
        sections: [
          {
            id: 'S1', doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary and Conclusion',
            content: stored, order_index: 0,
            comment_count: 0, revision_count: 1, citation_count: 0, updated_at: SAVED_AT,
          },
        ],
      }),
    [`/api/c2c/projects/${PID}`]: () => ok({ id: PID, name: 'C2C-101', phase: 'planning' }),
  };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: { content?: string }) => {
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      patched = body?.content ?? null;
      return ok({
        success: true,
        section: {
          id: 'S1', doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary and Conclusion',
          content: patched, order_index: 0, comment_count: 0, revision_count: 2, citation_count: 0,
          updated_at: SAVED_AGAIN_AT,
        },
      });
    }
    if (method !== 'GET') return ok({ success: true });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    if (url.startsWith('/api/authoring/sections/S1/')) return ok({ success: true, sources: [], revisions: [] });
    if (url.startsWith('/api/authoring/documents/')) return ok({ success: true, comments: [] });
    const hit = exact[url];
    return hit ? hit() : ok({ success: true });
  });
}

/** Mount the canvas expanded and resolve with the bridge its workbench builds. */
async function openBridge(): Promise<() => EditorBridge> {
  let latest: EditorBridge | null = null;
  render(
    <DocumentCanvas
      docId={DOC}
      programId={PID}
      conversationId="thread-1"
      fromThisConversation
      expanded
      onExpandedChange={() => undefined}
      onNav={() => undefined}
      onAsk={() => undefined}
      fireToast={() => undefined}
      onEditorBridge={(_docId, bridge) => {
        latest = bridge;
      }}
    />,
  );
  await screen.findByTestId('dc-expanded');
  await vi.waitFor(
    () => {
      if (!latest || !document.querySelector('.dcv-workbench .tiptap')) throw new Error('no editor bridge yet');
    },
    { timeout: 4000 },
  );
  // Always the newest: the effect rebuilds the bridge when the section row changes.
  return () => latest!;
}

const PROPOSAL = { sectionId: 'S1', quote: '18 months', replacement: '24 months' };

beforeEach(() => {
  mockApi();
  clearEditorTarget();
  stub.on = false;
  stub.calls = 0;
  patched = null;
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
});

const noRedline = () => {
  expect(document.querySelector('.dcv-workbench del')).toBeNull();
  expect(document.querySelector('.dcv-workbench ins')).toBeNull();
};

describe('EditorBridge.propose — which section, and which version of it', () => {
  it('redlines the open section when the base hash is the section as loaded', async () => {
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({ ok: true });
    const del = document.querySelector('.dcv-workbench del[data-author-id="ana"]');
    const ins = document.querySelector('.dcv-workbench ins[data-author-id="ana"]');
    expect(del?.textContent).toBe('18 months');
    expect(ins?.textContent).toBe('24 months');
    expect(del?.getAttribute('data-source-record')).toBe(TURN);
  });

  it('redlines when the base updated_at is the section as loaded, in either serialization', async () => {
    const bridge = await openBridge();
    // The same instant written with milliseconds is the same base.
    await expect(
      bridge().propose({ ...PROPOSAL, baseUpdatedAt: '2026-09-30T12:00:00.000Z' }, ANA),
    ).resolves.toEqual({ ok: true });
    expect(document.querySelector('.dcv-workbench del[data-author-id="ana"]')?.textContent).toBe('18 months');
  });

  it('refuses stale when the hash AnA read is not the stored content, and changes nothing', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: sha256('<p>An older text.</p>') }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    noRedline();
  });

  it('refuses stale when the section was saved after AnA read it, and changes nothing', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, baseUpdatedAt: '2026-09-29T08:00:00Z' }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    noRedline();
  });

  it('refuses stale when either of two bases differs', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA, baseUpdatedAt: '2026-09-29T08:00:00Z' }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: sha256('other'), baseUpdatedAt: SAVED_AT }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    noRedline();
  });

  it('refuses no-base when the proposal names no version of the section', async () => {
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL }, ANA)).resolves.toEqual({ ok: false, reason: 'no-base' });
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: '', baseUpdatedAt: null }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'no-base' });
    noRedline();
  });

  it('refuses wrong-section when the proposal is for a section that is not open', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, sectionId: 'S2', baseSha256: STORED_SHA }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'wrong-section' });
    noRedline();
  });

  it('passes the editor’s own refusal through, and keeps the existing fields', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, quote: '36 months', baseSha256: STORED_SHA }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'not-found' });
    expect(bridge()).toMatchObject({ docId: DOC, sectionCode: '3.2.P.8.1', editable: true });
    expect(typeof bridge().insert).toBe('function');
  });
});

describe('EditorBridge.propose — text the editor cannot strike', () => {
  it('passes unsupported-content through for a quote in inline code, and changes nothing', async () => {
    // Inline code takes no other mark, so the quote could not be struck: the
    // editor used to answer ok with nothing struck (round two, D1).
    const withCode = '<p>Store the lot under <code>batch_id</code> for 18 months.</p>';
    mockApi('DRAFT', withCode);
    const bridge = await openBridge();
    await expect(
      bridge().propose({ sectionId: 'S1', quote: 'batch_id', replacement: 'lot_id', baseSha256: sha256(withCode) }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'unsupported-content' });
    noRedline();
    // The plain words beside it still take a proposal.
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: sha256(withCode) }, ANA),
    ).resolves.toEqual({ ok: true });
  });
});

describe('EditorBridge.propose — after a save', () => {
  it('a base read before the save is stale after it, through the old bridge and the new one', async () => {
    const bridge = await openBridge();
    const before = bridge();
    await expect(before.propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({ ok: true });

    // Save the redlined section the way the person does: a reason, then Save.
    fireEvent.change(await screen.findByTestId('change-reason'), {
      target: { value: 'AnA stability update' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-section'));
    });
    await vi.waitFor(() => {
      if (patched == null || bridge() === before) throw new Error('not saved yet');
    });

    const proposal = { sectionId: 'S1', quote: '25 °C', replacement: '30 °C' };
    // The bridge handed out before the save names a section that is no longer the record.
    await expect(before.propose({ ...proposal, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
    // The new one refuses the old bases, by hash and by updated_at…
    await expect(bridge().propose({ ...proposal, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
    await expect(bridge().propose({ ...proposal, baseUpdatedAt: SAVED_AT }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
    // …and takes the bases of what was saved.
    await expect(
      bridge().propose({ ...proposal, baseSha256: sha256(patched!), baseUpdatedAt: SAVED_AGAIN_AT }, ANA),
    ).resolves.toEqual({ ok: true });
  });
});

describe('EditorBridge.propose — a sealed document', () => {
  it('refuses not-editable on a frozen document', async () => {
    mockApi('FROZEN');
    const bridge = await openBridge();
    expect(bridge().editable).toBe(false);
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'not-editable',
    });
    noRedline();
  });

  it('refuses for the seal itself, even where the editor would take the proposal', async () => {
    stub.on = true;
    // The control: an open document reaches the (always-editable) editor.
    const open = await openBridge();
    await expect(open().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({ ok: true });
    expect(stub.calls).toBe(1);
    cleanup();

    mockApi('FROZEN');
    const sealed = await openBridge();
    await expect(sealed().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'not-editable',
    });
    expect(stub.calls, 'a sealed document\u2019s proposal reached the editor').toBe(1);
  });
});

/* ── Round two of the review: the editor behind the bridge ─────────────────
 *
 * What a proposal that reaches the editor (above) then does to the section,
 * for the verifier's second-round findings (2026-10-01, 2-fixes-round2.txt).
 * They belong with suggestionsPropose.test.tsx's contract — Reject all leaves
 * the section exactly as it was, live and after a reload; Accept all leaves
 * exactly what was proposed — and live here only because that file is at its
 * max-lines limit. Plain editors, built as RichSectionEditor builds them; the
 * mocks above do not reach them.
 */

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});
function makeEditor(content: string): Editor {
  const ed = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: true, author: { id: 'user-7', name: 'Jordan Medical Writer' } }),
    ],
    content,
  });
  editors.push(ed);
  return ed;
}

type Act = (ed: Editor) => void;
const ask = (ed: Editor, quote: string, replacement: string, ctx: { prefix?: string; suffix?: string } = {}) =>
  proposeReplacement(ed, { quote, replacement, author: ANA, ...ctx });
const propose = (quote: string, replacement: string): Act => (ed) => {
  expect(ask(ed, quote, replacement)).toEqual({ ok: true });
};
/** The person selects `quote` and asks for `draft` over it. */
const draftOver = (quote: string, draft: string): Act => (ed) => {
  ed.commands.setTextSelection(computeMatches(ed.state.doc, quote, true)[0]);
  expect(ed.commands.insertSuggestedContent(draft, ANA)).toBe(true);
};
/** Decide everything `act` proposed, `action`, on an editor holding `html`
 *  as the app restores saved HTML (setContentUntracked). */
const decideReloaded = (html: string, action: 'accept' | 'reject') => {
  const ed = makeEditor('<p></p>');
  ed.commands.setContentUntracked(html);
  ed.commands.resolveAllSuggestions(action);
  return ed.getHTML();
};

/** Reject all restores the section, live and after a reload; Accept all, live
 *  and after a reload, is `intended`. */
function expectRoundTrip(content: string, act: Act, intended: string) {
  const ed = makeEditor(content);
  const original = ed.getHTML();
  act(ed);
  const proposed = ed.getHTML();
  expect(proposed, 'the act proposed nothing').not.toBe(original);
  const live = makeEditor(content);
  act(live);
  live.commands.resolveAllSuggestions('accept');
  expect(live.getHTML(), 'Accept all').toBe(intended);
  ed.commands.resolveAllSuggestions('reject');
  expect(ed.getHTML(), 'Reject all').toBe(original);
  expect(decideReloaded(proposed, 'reject'), 'Reject all after a reload').toBe(original);
  expect(decideReloaded(proposed, 'accept'), 'Accept all after a reload').toBe(intended);
}

/** `act` refused — `outcome` is what it returned — and the section untouched. */
function expectRefused(content: string, act: (ed: Editor) => unknown, outcome: unknown) {
  const ed = makeEditor(content);
  const before = ed.getHTML();
  expect(act(ed)).toEqual(outcome);
  expect(ed.getHTML()).toBe(before);
}

const INLINE_CODE = '<p>Use <code>batch_id</code> here.</p>';
const CODE_BLOCK = '<pre><code>let x = 1;</code></pre><p>Closing.</p>';
const STORE = '<p>Store at 25 C for use.</p>';
const ITEMS = '<ul><li><p>Old item</p></li><li><p>Keep</p></li></ul><p>x</p>';

describe('round two, D1 — text that cannot be struck is refused, not silently kept', () => {
  // Inline code excludes every other mark and a code block allows none, so
  // the strike was skipped: ok came back with the quote unstruck, and Accept
  // all left words nobody proposed beside the replacement.
  it.each([
    [INLINE_CODE, 'batch_id', 'lot_id'],
    [INLINE_CODE, 'Use batch_id here.', 'Use lot here.'],
    [CODE_BLOCK, 'x = 1', ''],
    [CODE_BLOCK, 'x = 1', 'y = 2'],
  ])('%s: a proposal on %j refuses unsupported-content', (content, quote, replacement) => {
    expectRefused(content, (ed) => ask(ed, quote, replacement), { ok: false, reason: 'unsupported-content' });
  });

  it.each(['batch_id', 'Use batch_id'])('a draft over a selection of %j returns false', (quote) => {
    const act = (ed: Editor) => {
      ed.commands.setTextSelection(computeMatches(ed.state.doc, quote, true)[0]);
      return ed.commands.insertSuggestedContent('lot_id', ANA);
    };
    expectRefused(INLINE_CODE, act, false);
  });

  it('the plain text beside the code still takes a proposal', () => {
    expectRoundTrip(INLINE_CODE, propose('here.', 'there.'), '<p>Use <code>batch_id</code> there.</p>');
  });
});

describe('round two, D2 — an edge space is never owned only by the suggestion', () => {
  // Saved HTML collapses the insertion's edge space into the document's own
  // (or drops it at a paragraph edge). When the one kept was inside <ins>,
  // '25 C' → '30 C ' rejected after a reload gave "25 Cfor use.".
  it.each([
    ['ends in a space before the document\u2019s own', STORE, propose('25 C', '30 C '), '<p>Store at 30 C for use.</p>'],
    ['ends in a space at its paragraph\u2019s end', `${STORE}<p>End.</p>`, propose('for use.', 'for storage. '), '<p>Store at 25 C for storage.</p><p>End.</p>'],
    ['starts with a space after a quote ending in one', STORE, propose('25 C ', ' 30 C '), '<p>Store at 30 C for use.</p>'],
    ['drafted over a selection ends in a space before the document\u2019s own', STORE, draftOver('25 C', '30 C '), '<p>Store at 30 C for use.</p>'],
    ['keeps an edge space the document does not have', STORE, propose('25 C for', '30 C, for'), '<p>Store at 30 C, for use.</p>'],
  ])('a replacement that %s', (_case, content, act, intended) => {
    expectRoundTrip(content, act, intended);
  });
});

describe('round two, D3 — whole list items', () => {
  it.each([
    ['a struck item goes on accept', '<ul><li><p>A</p></li><li><p>Old</p></li></ul><p>x</p>', propose('Old', ''), '<ul><li><p>A</p></li></ul><p>x</p>'],
    ['a struck middle item goes on accept', '<ol><li><p>A</p></li><li><p>Old</p></li><li><p>C</p></li></ol><p>x</p>', propose('Old', ''), '<ol><li><p>A</p></li><li><p>C</p></li></ol><p>x</p>'],
    ['a list replacing an item becomes sibling items', ITEMS, propose('Old item', '- first\n- second'), '<ul><li><p>first</p></li><li><p>second</p></li><li><p>Keep</p></li></ul><p>x</p>'],
    ['so does a numbered one', '<ol><li><p>Keep</p></li><li><p>Old item</p></li></ol><p>x</p>', propose('Old item', '1. first\n2. second'), '<ol><li><p>Keep</p></li><li><p>first</p></li><li><p>second</p></li></ol><p>x</p>'],
    ['so does a list drafted over a selected item', '<ul><li><p>Old</p></li></ul><p>B</p>', draftOver('Old', '- x'), '<ul><li><p>x</p></li></ul><p>B</p>'],
    ['paragraphs replacing an item stay in it', '<ul><li><p>Old</p></li></ul><p>x</p>', propose('Old', 'P1\n\nP2'), '<ul><li><p>P1</p><p>P2</p></li></ul><p>x</p>'],
  ])('%s', (_case, content, act, intended) => {
    expectRoundTrip(content, act, intended);
  });

  it.each(['## Heading\n\nBody', '| A | B |\n| --- | --- |\n| 1 | 2 |', '- a\n\nAfter the list'])(
    'refuses structural for a whole item replaced by %j, which a list item cannot be',
    (replacement) => {
      expectRefused(ITEMS, (ed) => ask(ed, 'Old item', replacement), { ok: false, reason: 'structural' });
    },
  );
});

describe('round two, D4 — the person\u2019s selection does not grow over AnA\u2019s insertion', () => {
  // The quote itself, a selection ending at it, one starting where AnA's words go.
  it.each(['25 C', 'at 25 C', ' for use'])('a selection of %j keeps exactly its words', (words) => {
    const ed = makeEditor(STORE);
    ed.commands.setTextSelection(computeMatches(ed.state.doc, words, true)[0]);
    expect(ask(ed, '25 C', '30 C')).toEqual({ ok: true });
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe(words);
  });

  it('a caret at the end of the quote stays there, before AnA\u2019s words', () => {
    const ed = makeEditor(STORE);
    ed.commands.setTextSelection(computeMatches(ed.state.doc, '25 C', true)[0].to);
    expect(ask(ed, '25 C', '30 C')).toEqual({ ok: true });
    expect(ed.state.doc.textBetween(1, ed.state.selection.from)).toBe('Store at 25 C');
  });
});

describe('round two, D5 — real text that looks like a reader marker still anchors', () => {
  it.each([
    ['a prefix line', '<p>Intro.</p><p>- 5 mg daily.</p><p>Assay is ok.</p><p>Assay is ok.</p>', { prefix: 'Intro.\n- 5 mg daily.\n' }, 2],
    ['a suffix line', '<p>Assay is</p><p>1. high</p><p>Assay is</p><p>low</p>', { suffix: '\n1. high' }, 0],
  ])('%s that is a paragraph\u2019s own text', (_case, content, ctx, struck) => {
    const ed = makeEditor(content);
    expect(ask(ed, 'Assay is', 'X', ctx)).toEqual({ ok: true });
    const paras = Array.from(ed.view.dom.querySelectorAll('p'));
    expect(paras.findIndex((p) => p.querySelector('del'))).toBe(struck);
    expect(ed.view.dom.querySelectorAll('del')).toHaveLength(1);
  });

  it('still reads a real marker past, and still refuses context that fits neither way', () => {
    const list = '<ul><li><p>Assay is 98.0%.</p></li><li><p>Assay is 99.1%.</p></li></ul>';
    expect(ask(makeEditor(list), 'Assay is', 'X', { prefix: '- Other.\n- ' })).toEqual({ ok: false, reason: 'not-found' });
    expect(ask(makeEditor(list), 'Assay is', 'X', { prefix: '- Assay is 98.0%.\n- ' })).toEqual({ ok: true });
  });
});

describe('round two, D6 — the documented trailing-paragraph limit', () => {
  it('a section ending in a list gains the editor\u2019s empty paragraph on any transaction', () => {
    // StarterKit's TrailingNode, not suggestions.ts; documented there.
    const ed = makeEditor('<p>Intro.</p><ul><li><p>Assay is 98.0%.</p></li></ul>');
    expect(ed.getHTML()).not.toMatch(/<p><\/p>$/);
    expect(ask(ed, 'Intro.', 'Opening.')).toEqual({ ok: true });
    expect(ed.getHTML()).toMatch(/<\/ul><p><\/p>$/);
  });
});
