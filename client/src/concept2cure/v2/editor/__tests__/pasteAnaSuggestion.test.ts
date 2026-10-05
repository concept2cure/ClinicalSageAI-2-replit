// @vitest-environment jsdom
/**
 * A pasted AnA suggestion keeps AnA's name only where the host admits its
 * turn (AnA reasoning round 11, GRD-missed, 2026-10-05).
 *
 * AnA's answer enters a section as a pending insertion carrying her name and
 * her turn record id, and round 11 refuses that insert for an answer a model
 * not admitted by RULE 2 wrote. A paste is a second way in: with track changes
 * off (the database default) a copied AnA insertion pasted elsewhere kept
 * `data-author-id="ana"` and its turn, never meeting the insert gate, and its
 * accept was then filed as AnA's. A pasted AnA mark the host does not admit
 * is now the pasting person's, with no turn: what a paste with track changes
 * on already records.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

import { TrackChanges, collectSuggestions } from '../suggestions';

const TURN_A = '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41';
const HUMAN = { id: 'user-7', name: 'Jordan Medical Writer' };
const ANA_INS = `<p><ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="2026-10-05T10:00:00Z" data-source-record="${TURN_A}">ORR 42% in the 10 mg arm.</ins></p>`;

const editors: Editor[] = [];
function makeEditor(tracking: boolean, admitsAnaSource?: (sourceRecord: string | null) => boolean): Editor {
  const ed = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: tracking, author: HUMAN, ...(admitsAnaSource ? { admitsAnaSource } : {}) }),
    ],
    content: '<p></p>',
  });
  editors.push(ed);
  return ed;
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

/** jsdom has no ClipboardEvent; ProseMirror's paste only needs an event to hand its handlers. */
const paste = (ed: Editor, html: string) =>
  ed.view.pasteHTML(html, new Event('paste') as unknown as Parameters<Editor['view']['pasteHTML']>[1]);
const suggestions = (ed: Editor) => collectSuggestions(ed.state.doc).map((r) => [r.kind, r.authorId, r.authorName, r.sourceRecord, r.text]);

describe('pasting an AnA suggestion', () => {
  it('track changes off: one the host does not admit becomes the pasting person’s, with no turn', () => {
    const ed = makeEditor(false);
    paste(ed, ANA_INS);
    expect(suggestions(ed)).toEqual([['insertion', HUMAN.id, HUMAN.name, null, 'ORR 42% in the 10 mg arm.']]);
  });

  it('track changes off: one the host admits keeps AnA’s name and turn', () => {
    const ed = makeEditor(false, (id) => id === TURN_A);
    paste(ed, ANA_INS);
    expect(suggestions(ed)).toEqual([['insertion', 'ana', 'AnA (AI draft)', TURN_A, 'ORR 42% in the 10 mg arm.']]);
  });

  it('a pasted person’s suggestion keeps its author (negative control)', () => {
    const ed = makeEditor(false);
    paste(ed, '<p><ins data-author-id="user-9" data-author-name="Kim Reviewer" data-at="2026-10-05T10:00:00Z">Assay 98.5%.</ins></p>');
    expect(suggestions(ed)).toEqual([['insertion', 'user-9', 'Kim Reviewer', null, 'Assay 98.5%.']]);
  });

  it('track changes on: the paste is the person’s, as it already was (negative control)', () => {
    const ed = makeEditor(true);
    paste(ed, ANA_INS);
    expect(suggestions(ed).map(([kind, author, , turn]) => [kind, author, turn])).toEqual([['insertion', HUMAN.id, null]]);
  });
});
