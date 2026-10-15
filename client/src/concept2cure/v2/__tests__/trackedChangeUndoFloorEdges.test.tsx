// @vitest-environment jsdom
/**
 * The decision floor at its edges: flows trackedChangeUndo.test.tsx does not
 * run. That file is at its lint line limit.
 *
 * Periodic review 2026-09-28, editor family, P11-B-4 remaining gap (e). A
 * recorded accept or reject is an undo and redo floor (suggestions.ts,
 * decisionFloor). The floor follows history's own cut: past its depth limit
 * prosemirror-history drops its oldest events, and a floor counted from the
 * bottom of the stack would sit above the decision for good. Two ways that can
 * go wrong survived the lane's own tests. The round-2c reviewer showed each with
 * a probe, and they are pinned here:
 *   - the "that was an Undo" mark must describe the LAST transaction only. Kept
 *     set, an Undo pressed after the decision turns cut detection off, and the
 *     long-session bug comes back: Undo stops short of the decision, silently
 *     (P1);
 *   - the redo floor must lapse even when the undo floor is 0: a decision taken
 *     through AnA's Redo door, with an empty undo stack, must not leave Redo of
 *     later typing refused (P2).
 * P3 and P4 are guards: two decisions with a cut between them, and tracking off
 * through three cuts.
 */
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { closeHistory, undoDepth } from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';

import { TrackChanges, collectSuggestions, decisionFloorAllows, type SuggestionDecision } from '../editor/suggestions';

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') {
    proto.getClientRects = function () {
      return [] as unknown as DOMRectList;
    };
  }
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

const REVIEWER = { id: 'reviewer-7', name: 'Reviewer' };
const DRAFT = 'Confirmed by MS/NMR.';
const SAVED_WITH_PENDING_DRAFT =
  '<p>The impurity is below the qualification threshold. ' +
  `<ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="2026-07-20T10:05:00Z">${DRAFT}</ins></p>`;
const CLAUSE = ' Typed clause.';

function make(content: string): { editor: Editor; decisions: SuggestionDecision[] } {
  const decisions: SuggestionDecision[] = [];
  const editor = new Editor({
    extensions: [StarterKit, TrackChanges.configure({ enabled: true, author: REVIEWER, onResolve: (d) => decisions.push(d) })],
    content,
  });
  return { editor, decisions };
}

/** `n` separate history events: each character typed after a history break. */
function edits(editor: Editor, ch: string, n: number): void {
  for (let i = 0; i < n; i++) {
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(ch);
  }
}

/** The reviewer types their own clause into the first paragraph and accepts it. */
function acceptClause(editor: Editor): void {
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.commands.setTextSelection(1 + 'Base text.'.length);
  editor.commands.insertContent(CLAUSE);
  const clause = collectSuggestions(editor.state.doc).find((r) => r.text === CLAUSE)!;
  editor.chain().focus().resolveSuggestion(clause, 'accept').run();
}

/** Press Undo until a press changes nothing; each press must be foretold by the predicate the ribbon will use. */
function undoUntilRefused(editor: Editor): number {
  let undone = 0;
  while (undone <= 120) {
    const before = editor.state.doc;
    const foretold = editor.can().undo() && decisionFloorAllows(editor.state, 'undo');
    editor.commands.undo();
    const changed = !editor.state.doc.eq(before);
    expect(foretold, `press ${undone + 1} was foretold wrongly`).toBe(changed);
    if (!changed) break;
    undone++;
  }
  return undone;
}

describe('the decision floor at its edges (P11-B-4, remaining gap e)', () => {
  it('P1: an Undo after the decision does not turn the cut off: Undo later reverses exactly what came after it', () => {
    const { editor, decisions } = make('<p>Base text.</p><p>Other.</p>');
    edits(editor, 'x', 50);
    acceptClause(editor);
    expect(undoDepth(editor.state)).toBe(51);
    edits(editor, 'y', 1);
    editor.commands.undo(); // the reviewer takes back a typo
    expect(editor.state.doc.textContent).toBe(`Base text.${CLAUSE}Other.${'x'.repeat(50)}`);
    edits(editor, 'z', 70); // the 70th makes history cut its 21 oldest events
    expect(undoDepth(editor.state)).toBe(100);

    expect(undoUntilRefused(editor), 'Undo stopped short of the decision, or went past it').toBe(70);
    expect(editor.state.doc.textContent).toBe(`Base text.${CLAUSE}Other.${'x'.repeat(50)}`);
    expect(editor.getHTML().startsWith(`<p>Base text.${CLAUSE}</p>`), 'the accepted clause came back marked').toBe(true);
    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    editor.destroy();
  });

  it("P2: a decision taken with nothing to undo still lets Redo re-apply the reviewer's later typing", () => {
    const { editor, decisions } = make(SAVED_WITH_PENDING_DRAFT);
    const from = 1 + editor.state.doc.textContent.indexOf(DRAFT);
    editor.chain().setTextSelection({ from, to: from + DRAFT.length }).deleteSelection().run();
    editor.commands.undo();
    const [target] = collectSuggestions(editor.state.doc);
    editor.chain().focus().resolveSuggestion(target, 'accept').run();
    expect(decisions.map((d) => d.decision)).toEqual(['accept']);
    expect(undoDepth(editor.state)).toBe(0);

    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(' More.');
    editor.commands.undo();
    expect(editor.state.doc.textContent).not.toContain('More.');
    editor.commands.redo();
    expect(editor.state.doc.textContent, 'Redo of typing after the decision was refused').toContain(`${DRAFT} More.`);
    expect(collectSuggestions(editor.state.doc).map((r) => [r.kind, r.text])).toEqual([['insertion', ' More.']]);
    editor.destroy();
  });

  it('P3 (guard): with a cut between two decisions, Undo stops at the second', () => {
    const { editor } = make('<p>Base text.</p><p>Other.</p>');
    edits(editor, 'x', 110);
    acceptClause(editor);
    edits(editor, 'y', 30); // history cuts once
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.setTextSelection(1);
    editor.commands.insertContent('Q');
    const [q] = collectSuggestions(editor.state.doc).filter((r) => r.text === 'Q');
    editor.chain().focus().resolveSuggestion(q, 'accept').run();
    edits(editor, 'z', 7);

    expect(undoUntilRefused(editor)).toBe(7);
    expect(editor.state.doc.textContent.startsWith('QBase text.')).toBe(true);
    editor.destroy();
  });

  it('P4 (guard): with tracking off through three cuts, Undo reverses exactly the typing after the decision', () => {
    const { editor } = make('<p>Base text.</p><p>Other.</p>');
    edits(editor, 'x', 90);
    acceptClause(editor);
    editor.commands.setTrackChangesEnabled(false);
    edits(editor, 'y', 75); // history cuts at 121, 141 and 161 events

    expect(undoUntilRefused(editor)).toBe(75);
    expect(editor.state.doc.textContent).toBe(`Base text.${CLAUSE}Other.${'x'.repeat(90)}`);
    editor.destroy();
  });
});
