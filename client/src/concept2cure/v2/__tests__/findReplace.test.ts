// @vitest-environment jsdom
/**
 * Find & replace in the canonical section editor.
 *
 * The behaviors pinned here are the ones that make find TRUSTWORTHY on a
 * regulated document rather than decorative:
 *
 *   - a phrase that crosses a formatting boundary ("drug **product**") still
 *     matches — the naive per-text-node search would report "0 matches" for
 *     text the author can see on screen, an honest-count violation;
 *   - a match never crosses a paragraph boundary;
 *   - table cell content is searched (a CTD dossier is mostly tables);
 *   - Replace All is ONE transaction, so ONE undo restores the section;
 *   - with track changes on, a replacement is captured as an attributed
 *     deletion + insertion suggestion pair — find & replace cannot become a
 *     way to slip an untracked edit into a tracked section.
 */

import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

import { TrackChanges, collectSuggestions } from '../editor/suggestions';
import { FindReplace, computeMatches, getFindState } from '../editor/findReplace';

const HUMAN = { id: 'user-7', name: 'Jordan Medical Writer' };

/** The schema as RichSectionEditor builds it (the parts find touches). */
function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: false, author: HUMAN }),
      FindReplace,
    ],
    content,
  });
}

const textOf = (ed: Editor) => ed.state.doc.textContent;

describe('computeMatches', () => {
  it('matches a phrase that crosses a mark boundary', () => {
    const ed = makeEditor('<p>The <strong>drug</strong> product quality</p>');
    // "drug product" spans bold → plain; two separate text nodes.
    expect(computeMatches(ed.state.doc, 'drug product', false)).toHaveLength(1);
    ed.destroy();
  });

  it('never matches across a paragraph boundary', () => {
    const ed = makeEditor('<p>shelf</p><p>life</p>');
    expect(computeMatches(ed.state.doc, 'shelf life', false)).toHaveLength(0);
    ed.destroy();
  });

  it('searches table cells', () => {
    const ed = makeEditor(
      '<table><tbody><tr><th><p>Attribute</p></th></tr><tr><td><p>Assay by HPLC</p></td></tr></tbody></table>'
    );
    expect(computeMatches(ed.state.doc, 'hplc', false)).toHaveLength(1);
    ed.destroy();
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    const ed = makeEditor('<p>Stability stability STABILITY</p>');
    expect(computeMatches(ed.state.doc, 'stability', false)).toHaveLength(3);
    expect(computeMatches(ed.state.doc, 'stability', true)).toHaveLength(1);
    ed.destroy();
  });

  it('reports non-overlapping matches', () => {
    const ed = makeEditor('<p>aaaa</p>');
    expect(computeMatches(ed.state.doc, 'aa', false)).toHaveLength(2);
    ed.destroy();
  });

  it('reports the document positions of the matched text', () => {
    const ed = makeEditor('<p>the assay limit</p>');
    const [m] = computeMatches(ed.state.doc, 'assay', false);
    expect(ed.state.doc.textBetween(m.from, m.to)).toBe('assay');
    ed.destroy();
  });
});

describe('find commands', () => {
  it('setFindQuery populates plugin state; findNext wraps around', () => {
    const ed = makeEditor('<p>alpha beta alpha gamma alpha</p>');
    ed.commands.setFindQuery('alpha');
    let st = getFindState(ed.state);
    expect(st.matches).toHaveLength(3);
    expect(st.activeIndex).toBe(0);

    ed.commands.findNext();
    ed.commands.findNext();
    st = getFindState(ed.state);
    expect(st.activeIndex).toBe(2);
    // Selection follows the focused match.
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('alpha');

    ed.commands.findNext(); // wraps
    expect(getFindState(ed.state).activeIndex).toBe(0);
    ed.commands.findPrevious(); // wraps backwards
    expect(getFindState(ed.state).activeIndex).toBe(2);
    ed.destroy();
  });

  it('recomputes matches as the document changes while a search is open', () => {
    const ed = makeEditor('<p>impurity levels</p>');
    ed.commands.setFindQuery('impurity');
    expect(getFindState(ed.state).matches).toHaveLength(1);
    ed.commands.insertContentAt(ed.state.doc.content.size, '<p>impurity profile</p>');
    expect(getFindState(ed.state).matches).toHaveLength(2);
    ed.destroy();
  });
});

describe('replace', () => {
  it('replaceActiveMatch replaces one occurrence and advances to the next', () => {
    const ed = makeEditor('<p>Drug Substance and Drug Substance</p>');
    ed.commands.setFindQuery('Drug Substance');
    ed.commands.replaceActiveMatch('Active Substance');
    expect(textOf(ed)).toBe('Active Substance and Drug Substance');
    const st = getFindState(ed.state);
    expect(st.matches).toHaveLength(1); // the remaining occurrence
    expect(st.activeIndex).toBe(0); // …is now the focused one
    ed.destroy();
  });

  it('replaceAllMatches replaces every occurrence — and ONE undo restores all of them', () => {
    const ed = makeEditor('<p>API in tables</p><p>API in prose</p><p>final API</p>');
    ed.commands.setFindQuery('API');
    ed.commands.replaceAllMatches('drug substance');
    expect(textOf(ed)).toBe('drug substance in tablesdrug substance in prosefinal drug substance');
    expect(getFindState(ed.state).matches).toHaveLength(0);

    ed.commands.undo();
    expect(textOf(ed)).toBe('API in tablesAPI in prosefinal API');
    ed.destroy();
  });

  it('an empty replacement deletes the matched text', () => {
    const ed = makeEditor('<p>the the assay</p>');
    ed.commands.setFindQuery('the ');
    ed.commands.replaceAllMatches('');
    expect(textOf(ed)).toBe('assay');
    ed.destroy();
  });

  it('with track changes ON, a replacement becomes an attributed strike + insertion, not a silent edit', () => {
    const ed = makeEditor('<p>The shelf life is 24 months.</p>');
    ed.commands.setTrackChangesEnabled(true);
    ed.commands.setFindQuery('24 months');
    ed.commands.replaceActiveMatch('36 months');

    // Nothing was silently removed: the struck original and the pending
    // insertion are both in the document, awaiting review.
    expect(textOf(ed)).toContain('24 months');
    expect(textOf(ed)).toContain('36 months');

    const suggestions = collectSuggestions(ed.state.doc);
    const kinds = suggestions.map(s => s.kind).sort();
    expect(kinds).toEqual(['deletion', 'insertion']);
    for (const s of suggestions) expect(s.authorName).toBe(HUMAN.name);
    ed.destroy();
  });
});
