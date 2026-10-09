// @vitest-environment jsdom
/**
 * A recorded tracked-change decision cannot be taken back by Undo, and nothing
 * the document no longer carries is attributed at save time.
 *
 * Periodic review 2026-09-28, editor family, P11-B-4. Accept and Reject report
 * the decision to the host as they run, and the host posts it to the audit
 * trail at once. Both commands, and the AnA insert they act on, were ordinary
 * history entries, so ⌘Z restored the suggestion while the decision stayed
 * recorded — the audit trail said "accepted", the canvas said pending, and the
 * canvas matched the saved baseline, so no unsaved-work guard appeared. The
 * extension's accepted-author list was untouched by the undo, so the next save
 * wrote "AI draft accepted" into the revision ledger for text that was not in
 * it (in the misclick-recovery path, text that had been REJECTED).
 *
 * Two layers, both pinned here:
 *   - the three suggestion commands are kept out of undo history;
 *   - the read-and-clear of accepted authors and texts keeps only entries whose
 *     text is present, unmarked, in the document being saved.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import {
  TrackChanges,
  collectSuggestions,
  settleAcceptedContributions,
  type AcceptedInsertion,
  type SuggestionAuthor,
  type SuggestionDecision,
} from '../editor/suggestions';
import { RichSectionEditor } from '../editor/RichSectionEditor';

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

const ANA = { id: 'ana', name: 'AnA (AI draft)' };
const REVIEWER = { id: 'reviewer-7', name: 'Reviewer' };
const DRAFT = 'Confirmed by MS/NMR.';
const SAVED_WITH_PENDING_DRAFT =
  '<p>The impurity is below the qualification threshold. ' +
  `<ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="2026-07-20T10:05:00Z">${DRAFT}</ins></p>`;

function makeEditor(content: string, enabled = true) {
  const decisions: SuggestionDecision[] = [];
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
      TrackChanges.configure({ enabled, author: REVIEWER, onResolve: (d) => decisions.push(d) }),
    ],
    content,
  });
  return { editor, decisions };
}

type Store = {
  enabled: boolean;
  author: SuggestionAuthor;
  acceptedAuthors: SuggestionAuthor[];
  acceptedInsertions: AcceptedInsertion[];
};
afterEach(() => {
  cleanup();
});

describe('Undo cannot take back a recorded decision', () => {
  it('Accept, then Undo: the suggestion stays accepted', () => {
    const { editor, decisions } = makeEditor(SAVED_WITH_PENDING_DRAFT);
    const [target] = collectSuggestions(editor.state.doc);
    editor.chain().focus().resolveSuggestion(target, 'accept').run();
    expect(decisions.map((d) => d.decision)).toEqual(['accept']);

    editor.commands.undo();

    // The shipped code returned 1: the redline back on screen, the audit trail
    // still saying "accepted".
    expect(collectSuggestions(editor.state.doc)).toHaveLength(0);
    expect(editor.state.doc.textContent).toContain(DRAFT);
    editor.destroy();
  });

  it('Reject, then Undo: the rejected text does not come back', () => {
    const { editor, decisions } = makeEditor(SAVED_WITH_PENDING_DRAFT);
    const [target] = collectSuggestions(editor.state.doc);
    editor.chain().focus().resolveSuggestion(target, 'reject').run();
    expect(decisions.map((d) => d.decision)).toEqual(['reject']);

    editor.commands.undo();

    expect(collectSuggestions(editor.state.doc)).toHaveLength(0);
    expect(editor.state.doc.textContent).not.toContain(DRAFT);
    editor.destroy();
  });

  it('Accept all, then Undo: nothing returns to pending', () => {
    const { editor, decisions } = makeEditor(
      '<p><ins data-author-id="ana" data-author-name="AnA (AI draft)">First clause.</ins> Base. ' +
        '<del data-author-id="reviewer-7" data-author-name="Reviewer">Struck clause.</del></p>',
    );
    expect(collectSuggestions(editor.state.doc)).toHaveLength(2);
    editor.chain().focus().resolveAllSuggestions('accept').run();
    expect(decisions).toHaveLength(2);

    editor.commands.undo();

    expect(collectSuggestions(editor.state.doc)).toHaveLength(0);
    expect(editor.state.doc.textContent).toContain('First clause.');
    expect(editor.state.doc.textContent).not.toContain('Struck clause.');
    editor.destroy();
  });

  it('an AnA draft inserted and accepted in this session is not removed by Undo', () => {
    const { editor, decisions } = makeEditor('<p>Base text.</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.chain().focus().insertSuggestedContent(DRAFT, ANA).run();
    const [target] = collectSuggestions(editor.state.doc);
    editor.chain().focus().resolveSuggestion(target, 'accept').run();

    // With only the resolve commands kept out of history, this undid the
    // insertion itself — the accepted text vanished and the "accept" stood.
    editor.commands.undo();

    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    expect(editor.state.doc.textContent).toContain(DRAFT);
    expect(collectSuggestions(editor.state.doc)).toHaveLength(0);
    editor.destroy();
  });

  it('CONTROL: ordinary typing is still undoable', () => {
    const { editor } = makeEditor('<p>Base text.</p>', false);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(' Typed.');
    expect(editor.state.doc.textContent).toBe('Base text. Typed.');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('Base text.');
    editor.destroy();
  });
});

describe('settleAcceptedContributions', () => {
  const store = (entries: AcceptedInsertion[], authors: SuggestionAuthor[]): Store => ({
    enabled: true,
    author: REVIEWER,
    acceptedAuthors: authors,
    acceptedInsertions: entries,
  });

  it('keeps an accepted text present, unmarked, in the document — across a formatting split', () => {
    const { editor } = makeEditor(`<p>Base. Confirmed by <strong>MS/NMR</strong>.</p>`);
    const s = store([{ authorId: 'ana', text: DRAFT }], [ANA]);
    settleAcceptedContributions(s, editor.state.doc);
    expect(s.acceptedInsertions).toEqual([{ authorId: 'ana', text: DRAFT }]);
    expect(s.acceptedAuthors).toEqual([ANA]);
    editor.destroy();
  });

  it('drops a text that is back under a pending insertion mark, and its author with it', () => {
    const { editor } = makeEditor(SAVED_WITH_PENDING_DRAFT);
    const s = store([{ authorId: 'ana', text: DRAFT }], [ANA]);
    settleAcceptedContributions(s, editor.state.doc);
    expect(s.acceptedInsertions).toEqual([]);
    expect(s.acceptedAuthors).toEqual([]);
    editor.destroy();
  });

  it('drops a text that is struck by a pending deletion', () => {
    const { editor } = makeEditor(
      `<p>Base. <del data-author-id="reviewer-7" data-author-name="Reviewer">${DRAFT}</del></p>`,
    );
    const s = store([{ authorId: 'ana', text: DRAFT }], [ANA]);
    settleAcceptedContributions(s, editor.state.doc);
    expect(s.acceptedInsertions).toEqual([]);
    expect(s.acceptedAuthors).toEqual([]);
    editor.destroy();
  });

  it('drops a text the document no longer holds', () => {
    const { editor } = makeEditor('<p>The impurity is below the qualification threshold.</p>');
    const s = store([{ authorId: 'ana', text: DRAFT }], [ANA]);
    settleAcceptedContributions(s, editor.state.doc);
    expect(s.acceptedInsertions).toEqual([]);
    expect(s.acceptedAuthors).toEqual([]);
    editor.destroy();
  });

  it('keeps an author while any one of their accepted texts survives', () => {
    const { editor } = makeEditor('<p>First clause.</p><p>Unrelated.</p>');
    const s = store(
      [
        { authorId: 'ana', text: 'First clause.' },
        { authorId: 'ana', text: 'Second clause.' },
        { authorId: 'u9', text: 'A colleague’s clause.' },
      ],
      [ANA, { id: 'u9', name: 'A colleague' }],
    );
    settleAcceptedContributions(s, editor.state.doc);
    expect(s.acceptedInsertions).toEqual([{ authorId: 'ana', text: 'First clause.' }]);
    expect(s.acceptedAuthors).toEqual([ANA]);
    editor.destroy();
  });

  it('does not match a text across a paragraph boundary', () => {
    // The accepted sentence, split into two paragraphs after the accept: every
    // character is still there, but not as the text that was accepted.
    const { editor } = makeEditor(`<p>${DRAFT}</p>`);
    editor.commands.setTextSelection(1 + 'Confirmed by'.length);
    editor.commands.splitBlock();
    expect(editor.getHTML()).toBe('<p>Confirmed by</p><p> MS/NMR.</p>');
    const s = store([{ authorId: 'ana', text: DRAFT }], [ANA]);
    settleAcceptedContributions(s, editor.state.doc);
    expect(s.acceptedInsertions).toEqual([]);
    editor.destroy();
  });
});

/* ── Through the editor's handle, as the Authoring host reads it at save ── */

function canvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

async function mountTracked() {
  const decisions: SuggestionDecision[] = [];
  const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
  render(
    <RichSectionEditor
      ref={ref}
      value={SAVED_WITH_PENDING_DRAFT}
      onSave={() => undefined}
      storageKey={null}
      track={{ enabled: false, author: REVIEWER, onToggle: () => undefined, onResolve: (d) => decisions.push(d) }}
    />,
  );
  await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
  const accept = () =>
    act(() => {
      const [target] = collectSuggestions(canvas().state.doc);
      canvas().chain().focus().resolveSuggestion(target, 'accept').run();
    });
  return { ref, decisions, accept };
}

describe('the accepted-author read at save time', () => {
  it('the ribbon Undo after Accept leaves the decision, the canvas and the save in agreement', async () => {
    const { ref, decisions, accept } = await mountTracked();
    accept();
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));

    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    expect(collectSuggestions(canvas().state.doc)).toHaveLength(0);
    expect(ref.current!.takeAcceptedAuthors()).toEqual([ANA]);
    expect(ref.current!.takeAcceptedInsertions()).toEqual([{ authorId: 'ana', text: DRAFT }]);
  });

  it('attributes nothing to AnA once the accepted text is gone from the section', async () => {
    const { ref, accept } = await mountTracked();
    accept();
    // The reviewer then deletes the accepted sentence outright (tracking off).
    act(() => {
      const text = canvas().state.doc.textContent;
      const start = text.indexOf(DRAFT);
      // Paragraph content starts at position 1.
      canvas().commands.deleteRange({ from: 1 + start, to: 1 + start + DRAFT.length });
    });
    expect(canvas().state.doc.textContent).not.toContain(DRAFT);

    // The shipped code returned ["ana"] here, and the next save stamped the
    // revision "AI draft accepted".
    expect(ref.current!.takeAcceptedAuthors()).toEqual([]);
    expect(ref.current!.takeAcceptedInsertions()).toEqual([]);
  });

  it('answers the same whichever list the host reads first', async () => {
    const { ref, accept } = await mountTracked();
    accept();
    expect(ref.current!.takeAcceptedInsertions()).toEqual([{ authorId: 'ana', text: DRAFT }]);
    expect(ref.current!.takeAcceptedAuthors()).toEqual([ANA]);
    // Read-and-clear, as before.
    expect(ref.current!.takeAcceptedAuthors()).toEqual([]);
    expect(ref.current!.takeAcceptedInsertions()).toEqual([]);
  });
});
