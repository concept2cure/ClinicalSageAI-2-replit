// @vitest-environment jsdom
/**
 * Replacing a section's content wholesale is not an edit by whoever is at the
 * keyboard (row D5, 2026-09-29).
 *
 * RichSectionEditor replaces the whole document three times: seeding a new
 * live-collaboration document from the stored section (on first sync, and when
 * live sync is refused), and restoring the unsaved draft kept in this browser.
 * With track changes on, the tracking plugin marks every document-changing
 * transaction it is not told to skip as a pending insertion by the current
 * author. Through Tiptap's plain `setContent`, the whole stored section became
 * one pending insertion by the person who happened to open it. Because
 * insertion marks exclude each other, it also overwrote AnA's authorship on
 * any AnA suggestion still pending in that content, so accepting it later would
 * have been filed as the person's own words.
 *
 * `setContentUntracked` replaces the content as it is, marks included, and
 * leaves tracking on for what the person types next.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

import { TrackChanges, collectSuggestions } from '../editor/suggestions';

const TURN_A = '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41';
const HUMAN = { id: 'user-7', name: 'Jordan Medical Writer' };

const editors: Editor[] = [];

function makeEditor(): Editor {
  const ed = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: true, author: HUMAN }),
    ],
    content: '<p></p>',
  });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

/** A stored section: settled text, and one AnA suggestion still pending. */
const STORED =
  '<p>The primary endpoint was met. ' +
  `<ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="2026-09-26T10:05:00Z" data-source-record="${TURN_A}" class="rse-ins">The hazard ratio was 0.71.</ins>` +
  '</p><p>Safety was consistent with the known profile.</p>';

const view = (ed: Editor) => collectSuggestions(ed.state.doc).map((r) => [r.authorId, r.sourceRecord ?? null, r.text]);

describe('setContentUntracked', () => {
  it('puts the stored section back as it is: settled text stays settled, AnA’s suggestion stays AnA’s', () => {
    const ed = makeEditor();
    ed.commands.setContentUntracked(STORED);

    expect(view(ed)).toEqual([['ana', TURN_A, 'The hazard ratio was 0.71.']]);
    expect(ed.getText()).toContain('Safety was consistent with the known profile.');
  });

  it('leaves tracking on: what the person types next is theirs', () => {
    const ed = makeEditor();
    ed.commands.setContentUntracked(STORED);
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    ed.commands.insertContent(' No new signals.');

    expect(view(ed)).toEqual([
      ['ana', TURN_A, 'The hazard ratio was 0.71.'],
      ['user-7', null, ' No new signals.'],
    ]);
  });
});

describe('RichSectionEditor replaces content only untracked', () => {
  it('has no plain setContent: every wholesale replacement goes through setContentUntracked', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'editor', 'RichSectionEditor.tsx'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code.match(/commands\.setContent\(/g) ?? []).toEqual([]);
    // The three it has: the collab seed on first sync, the seed when live sync
    // is refused, and the restore of the unsaved draft.
    expect((code.match(/commands\.setContentUntracked\(/g) ?? []).length).toBe(3);
  });
});
