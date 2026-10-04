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
 * Three layers, all pinned here:
 *   - the three suggestion commands are kept out of undo history;
 *   - a recorded decision is an undo and redo floor: Undo reverses what came
 *     after it and nothing before it, also once history has cut its oldest
 *     events, and Redo re-applies nothing undone before it; decisionFloorAllows
 *     answers for the floor before a press (remaining gap (e), below);
 *   - the read-and-clear of accepted authors and texts keeps only entries whose
 *     text is present, unmarked, in the document being saved.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { closeHistory, undoDepth } from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';

import {
  TrackChanges,
  collectSuggestions,
  decisionFloorAllows,
  settleAcceptedContributions,
  type AcceptedInsertion,
  type SuggestionAuthor,
  type SuggestionDecision,
  type SuggestionRange,
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

/* ── Remaining gap (e): the reviewer's OWN tracked edit ─────────────────────
   Keeping the decision out of history was not enough. The reviewer's typing,
   the thing decided on, is an ordinary history entry, and the tracking plugin
   passes undo through untracked. So ⌘Z after an accept of one's own tracked
   insertion removed the accepted text, and after an accept of one's own
   tracked deletion brought the deleted text back unmarked, while the audit
   trail kept "accept" for both. Periodic review 2026-09-28, editor family,
   P11-B-4 remaining gap (e). */

interface OwnEdit {
  kind: SuggestionRange['kind'];
  content: string;
  /** The reviewer's own edit, made with tracking on. */
  edit: (editor: Editor) => void;
  /** The pending change the edit leaves. */
  pending: string;
  /** The text once that change is accepted. */
  accepted: string;
}

const OWN_EDITS: OwnEdit[] = [
  {
    kind: 'insertion',
    content: '<p>Base text.</p>',
    edit: (editor) => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent(' Typed clause.');
    },
    pending: ' Typed clause.',
    accepted: 'Base text. Typed clause.',
  },
  {
    kind: 'deletion',
    content: '<p>Keep this. Remove this.</p>',
    edit: (editor) => {
      // Paragraph content starts at position 1.
      const from = 1 + editor.state.doc.textContent.indexOf(' Remove this.');
      editor.chain().setTextSelection({ from, to: from + ' Remove this.'.length }).deleteSelection().run();
    },
    pending: ' Remove this.',
    accepted: 'Keep this.',
  },
];

const pendingOf = (editor: Editor) =>
  collectSuggestions(editor.state.doc).map((r) => [r.kind, r.text]);

/** The reviewer makes the edit, then accepts it with one of the two commands. */
function editThenAccept(own: OwnEdit, how: 'one' | 'all') {
  const made = makeEditor(own.content);
  own.edit(made.editor);
  expect(pendingOf(made.editor)).toEqual([[own.kind, own.pending]]);
  if (how === 'one') {
    const [target] = collectSuggestions(made.editor.state.doc);
    made.editor.chain().focus().resolveSuggestion(target, 'accept').run();
  } else {
    made.editor.chain().focus().resolveAllSuggestions('accept').run();
  }
  expect(made.decisions.map((d) => d.decision)).toEqual(['accept']);
  expect(made.editor.state.doc.textContent).toBe(own.accepted);
  return made;
}

describe('Undo stops at a recorded decision on the reviewer’s own tracked edit', () => {
  it.each(OWN_EDITS)('own $kind: Accept, then Undo: the accepted change stands', (own) => {
    const { editor } = editThenAccept(own, 'one');

    editor.commands.undo();

    // The shipped code returned the text to before the edit, unmarked, with the
    // recorded "accept" still standing.
    expect(editor.state.doc.textContent).toBe(own.accepted);
    expect(pendingOf(editor)).toEqual([]);
    editor.destroy();
  });

  it.each(OWN_EDITS)('own $kind: Accept all, then Undo: the accepted change stands', (own) => {
    const { editor } = editThenAccept(own, 'all');

    editor.commands.undo();

    expect(editor.state.doc.textContent).toBe(own.accepted);
    expect(pendingOf(editor)).toEqual([]);
    editor.destroy();
  });

  it.each(OWN_EDITS)(
    'own $kind: typing after the decision is still undoable, Undo stops at the decision, Redo re-applies it',
    (own) => {
      const { editor } = editThenAccept(own, 'one');
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent(' After.');
      expect(pendingOf(editor)).toEqual([['insertion', ' After.']]);

      // Typed within the grouping delay and next to the decided change, so
      // without a closed history group it would join the pre-decision entry.
      editor.commands.undo();
      expect(editor.state.doc.textContent).toBe(own.accepted);
      expect(pendingOf(editor)).toEqual([]);

      editor.commands.undo();
      expect(editor.state.doc.textContent).toBe(own.accepted);
      expect(pendingOf(editor)).toEqual([]);

      editor.commands.redo();
      expect(editor.state.doc.textContent).toBe(`${own.accepted} After.`);
      expect(pendingOf(editor)).toEqual([['insertion', ' After.']]);
      editor.destroy();
    },
  );

  it.each(OWN_EDITS)('CONTROL: own $kind with no decision: Undo and Redo behave as before', (own) => {
    const { editor, decisions } = makeEditor(own.content);
    const original = editor.getHTML();
    own.edit(editor);

    editor.commands.undo();
    expect(editor.getHTML()).toBe(original);

    editor.commands.redo();
    expect(pendingOf(editor)).toEqual([[own.kind, own.pending]]);
    expect(decisions).toEqual([]);
    editor.destroy();
  });

  it('CONTROL: an AnA insert is not a decision; the typing before it stays undoable', () => {
    const { editor, decisions } = makeEditor('<p>Base text.</p>');
    OWN_EDITS[0].edit(editor);
    editor.chain().focus().insertSuggestedContent(DRAFT, ANA).run();

    editor.commands.undo();

    expect(editor.state.doc.textContent).not.toContain('Typed clause.');
    expect(pendingOf(editor)).toEqual([['insertion', DRAFT]]);
    expect(decisions).toEqual([]);
    editor.destroy();
  });
});

/* ── The same gap through Redo ──────────────────────────────────────────────
   A decision stays out of history, so prosemirror-history keeps its redo stack
   across it and only remaps it. A step undone BEFORE the decision could then be
   redone AFTER it: delete a pending insertion (tracking on removes it outright),
   undo the delete, accept the insertion, press Redo, and the delete ran again
   over the accepted text while the record kept "accept". Periodic review
   2026-09-28, editor family, P11-B-4 remaining gap (e), adversarial review. */

/** `text` is pending. The reviewer deletes it, undoes the delete, accepts it. */
function deleteUndoThenAccept(editor: Editor, text: string) {
  // Paragraph content starts at position 1.
  const from = 1 + editor.state.doc.textContent.indexOf(text);
  editor.chain().setTextSelection({ from, to: from + text.length }).deleteSelection().run();
  expect(editor.state.doc.textContent).not.toContain(text);
  editor.commands.undo();
  expect(pendingOf(editor)).toEqual([['insertion', text]]);
  const [target] = collectSuggestions(editor.state.doc);
  editor.chain().focus().resolveSuggestion(target, 'accept').run();
}

/** The reviewer's own tracked insertion, typed and then left as its own step. */
function ownInsertionAccepted() {
  const own = OWN_EDITS[0];
  const made = makeEditor(own.content);
  own.edit(made.editor);
  // A pause before the delete: without it the delete joins the typing's step.
  made.editor.view.dispatch(closeHistory(made.editor.state.tr));
  deleteUndoThenAccept(made.editor, own.pending);
  expect(made.editor.state.doc.textContent).toBe(own.accepted);
  return { ...made, own };
}

describe('Redo cannot bring back a step undone before a recorded decision', () => {
  it('own insertion: deleted, the delete undone, accepted, then Redo: the accepted text stays', () => {
    const { editor, decisions, own } = ownInsertionAccepted();
    // The reviewer clicks elsewhere before pressing Redo.
    editor.commands.setTextSelection(1);

    editor.commands.redo();

    // Without a redo floor this was 'Base text.', with "accept" still recorded.
    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    expect(editor.state.doc.textContent).toBe(own.accepted);
    expect(pendingOf(editor)).toEqual([]);
    editor.destroy();
  });

  it('AnA draft: deleted, the delete undone, accepted, then Redo: the accepted draft stays', () => {
    const { editor, decisions } = makeEditor(SAVED_WITH_PENDING_DRAFT);
    deleteUndoThenAccept(editor, DRAFT);

    editor.commands.redo();

    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    expect(editor.state.doc.textContent).toContain(DRAFT);
    expect(pendingOf(editor)).toEqual([]);
    editor.destroy();
  });

  it('typing after that decision is redoable once undone', () => {
    const { editor, own } = ownInsertionAccepted();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(' After.');

    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe(own.accepted);

    // The typing emptied the redo stack, so what it now holds came after the
    // decision and Redo re-applies it.
    editor.commands.redo();
    expect(editor.state.doc.textContent).toBe(`${own.accepted} After.`);
    expect(pendingOf(editor)).toEqual([['insertion', ' After.']]);
    editor.destroy();
  });
});

/* ── Past history's depth limit ─────────────────────────────────────────────
   prosemirror-history keeps 100 undo events plus an overflow of 20, and on the
   event after that it cuts the oldest 21. A floor kept as the undo depth at the
   decision then counted events that were gone, so it sat above the decision:
   in a long session, Undo of the reviewer's own typing after an accept did
   nothing at all. Periodic review 2026-09-28, editor family, P11-B-4 remaining
   gap (e), second adversarial review. */

const CLAUSE = ' Typed clause.';
/** Edits typed before the clause. With it, 141 events: history holds 120, its
 *  most, when the decision is taken, and the next edit makes it cut. */
const LONG = 140;

/** `n` edits, each its own undo event, typed at the end of the document. */
function separateEdits(editor: Editor, char: string, n: number) {
  for (let i = 0; i < n; i++) {
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(char);
  }
}

/**
 * `before` edits, then the reviewer's own tracked clause in the first
 * paragraph, accepted, then `after` edits. Tracking is on throughout, unless
 * `trackAfter` is false: then it is switched off once the clause is accepted.
 */
function longSession(before: number, after: number, trackAfter = true) {
  const made = makeEditor('<p>Base text.</p><p>Other.</p>');
  separateEdits(made.editor, 'x', before);
  made.editor.view.dispatch(closeHistory(made.editor.state.tr));
  made.editor.commands.setTextSelection(1 + 'Base text.'.length);
  made.editor.commands.insertContent(CLAUSE);
  const clause = collectSuggestions(made.editor.state.doc).find((r) => r.text === CLAUSE);
  const depthAtDecision = undoDepth(made.editor.state);
  made.editor.chain().focus().resolveSuggestion(clause!, 'accept').run();
  if (!trackAfter) made.editor.commands.setTrackChangesEnabled(false);
  separateEdits(made.editor, 'y', after);
  expect(made.decisions.map((d) => d.decision)).toEqual(['accept']);
  return { ...made, depthAtDecision };
}

/**
 * Press Undo until a press changes nothing. Returns the presses that did.
 * With `foretold`, each press must change the text exactly when it said so
 * beforehand.
 */
function undoUntilRefused(editor: Editor, foretold?: () => boolean): number {
  let undone = 0;
  // History holds at most 120 events, so a count past that is a failure too.
  while (undone <= 120) {
    const before = editor.state.doc;
    const allowed = foretold?.();
    editor.commands.undo();
    const changed = !editor.state.doc.eq(before);
    if (foretold) expect(allowed).toBe(changed);
    if (!changed) break;
    undone++;
  }
  return undone;
}

describe('Undo stops exactly at the decision after history has cut its oldest events', () => {
  it.each([1, 16, 40])(
    '141 events, Accept, %i more: Undo reverses exactly those, then stops at the decision',
    (after) => {
      const { editor, depthAtDecision } = longSession(LONG, after);
      expect(depthAtDecision).toBe(120);

      // A floor held at 120 while history fell back to 100 refused every one.
      expect(undoUntilRefused(editor)).toBe(after);
      expect(editor.state.doc.textContent).toBe(`Base text.${CLAUSE}Other.${'x'.repeat(LONG)}`);
      // The accepted clause, unmarked.
      expect(editor.getHTML().startsWith(`<p>Base text.${CLAUSE}</p>`)).toBe(true);
      editor.destroy();
    },
  );

  it('an Undo pressed straight after the edit that made history cut passes', () => {
    // With tracking off nothing is appended to that edit, so the Undo is the
    // first transaction after the cut: the filter has to see the cut itself.
    const { editor } = longSession(LONG, 1, false);

    expect(undoUntilRefused(editor)).toBe(1);
    expect(editor.state.doc.textContent).toBe(`Base text.${CLAUSE}Other.${'x'.repeat(LONG)}`);
    editor.destroy();
  });

  it('once history has cut everything from before the decision, Undo reverses all it still holds', () => {
    // The clause is the only event before the decision. The 120th edit after
    // it makes history cut 21 events: the clause and the first 20 edits.
    const { editor, depthAtDecision } = longSession(0, 120);
    expect(depthAtDecision).toBe(1);

    expect(undoUntilRefused(editor)).toBe(100);
    expect(editor.state.doc.textContent).toBe(`Base text.${CLAUSE}Other.${'y'.repeat(20)}`);
    editor.destroy();
  });
});

/* ── What a control offering Undo or Redo can read ──────────────────────────
   filterTransaction refuses a step at the floor, but can().undo() and
   can().redo() do not run it, so they stay true there and a press does
   nothing. decisionFloorAllows gives the filter's answer before the press. */

/** [Undo, Redo] as decisionFloorAllows answers them. */
const floorAllows = (editor: Editor) =>
  [decisionFloorAllows(editor.state, 'undo'), decisionFloorAllows(editor.state, 'redo')];

describe('decisionFloorAllows', () => {
  it('says no at both floors, where can() says yes, and yes to what came after', () => {
    const { editor, own } = ownInsertionAccepted();
    expect([editor.can().undo(), editor.can().redo()]).toEqual([true, true]);
    expect(floorAllows(editor)).toEqual([false, false]);
    const atDecision = editor.state.doc;
    editor.commands.undo();
    editor.commands.redo();
    expect(editor.state.doc.eq(atDecision)).toBe(true);

    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(' After.');
    // Nothing to redo now: that is can()'s answer, not the floor's.
    expect(floorAllows(editor)).toEqual([true, true]);

    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe(own.accepted);
    expect(floorAllows(editor)).toEqual([false, true]);
    editor.destroy();
  });

  it.each([[LONG, 16], [0, 120]])(
    'after history has cut (%i edits, Accept, %i more), with can() it foretells every Undo press',
    (before, after) => {
      const { editor } = longSession(before, after);
      const live = () => editor.can().undo() && decisionFloorAllows(editor.state, 'undo');
      expect(undoUntilRefused(editor, live)).toBe(Math.min(after, 100));
      editor.destroy();
    },
  );

  it('refuses nothing where prosemirror-history holds nothing, as under live co-editing', () => {
    // Co-editing turns prosemirror-history off and undoes through Yjs.
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), TrackChanges.configure({ author: REVIEWER })],
      content: SAVED_WITH_PENDING_DRAFT,
    });
    const [target] = collectSuggestions(editor.state.doc);
    editor.chain().focus().resolveSuggestion(target, 'accept').run();
    expect(floorAllows(editor)).toEqual([true, true]);
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

async function mountTracked({ value = SAVED_WITH_PENDING_DRAFT, enabled = false } = {}) {
  const decisions: SuggestionDecision[] = [];
  const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
  render(
    <RichSectionEditor
      ref={ref}
      value={value}
      onSave={() => undefined}
      storageKey={null}
      track={{ enabled, author: REVIEWER, onToggle: () => undefined, onResolve: (d) => decisions.push(d) }}
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

  it('the ribbon Undo after accepting one’s own tracked insertion leaves the accepted text (gap (e))', async () => {
    const own = OWN_EDITS[0];
    const { ref, decisions, accept } = await mountTracked({ value: own.content, enabled: true });
    act(() => own.edit(canvas()));
    expect(pendingOf(canvas())).toEqual([[own.kind, own.pending]]);
    accept();
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));

    // The shipped code removed the accepted clause, and the save then dropped it
    // from the accepted texts while the audit trail kept "accept".
    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    expect(canvas().state.doc.textContent).toBe(own.accepted);
    expect(pendingOf(canvas())).toEqual([]);
    expect(ref.current!.takeAcceptedInsertions()).toEqual([{ authorId: REVIEWER.id, text: own.pending }]);
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
