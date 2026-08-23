/**
 * @vitest-environment jsdom
 *
 * Track changes as a real capability: edits under tracking become attributed,
 * reviewable suggestions instead of applying silently.
 *
 * Per the working agreement ("verify by making the check fail"), every
 * tracked behavior is paired with its untracked counterpart: the same
 * operation with tracking OFF destroys the text — the exact failure the
 * capability exists to prevent — and with tracking ON it does not.
 */

import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import {
  TrackChanges,
  collectSuggestions,
} from '../../client/src/concept2cure/v2/editor/suggestions';

const AUTHOR = { id: 'user-7', name: 'Jordan Medical Writer' };

function makeEditor(content: string, enabled: boolean): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      TrackChanges.configure({ enabled, author: AUTHOR }),
    ],
    content,
  });
}

describe('track changes — deletions', () => {
  const DOC = '<p>The assay met all acceptance criteria.</p>';

  it('UNTRACKED (the failure case): deleting removes the words from the record', () => {
    const ed = makeEditor(DOC, false);
    // delete "met all " (positions: <p> starts at 1; "The assay " = 10 chars)
    ed.commands.deleteRange({ from: 11, to: 19 });
    const text = ed.getText();
    ed.destroy();
    expect(text).not.toContain('met all');
    expect(text).toContain('The assay acceptance criteria.');
  });

  it('TRACKED: the same deletion keeps the words as an attributed deletion suggestion', () => {
    const ed = makeEditor(DOC, true);
    ed.commands.deleteRange({ from: 11, to: 19 });
    const text = ed.getText();
    const html = ed.getHTML();
    const sugg = collectSuggestions(ed.state.doc);
    ed.destroy();
    // Nothing was destroyed…
    expect(text).toContain('met all');
    // …the struck range is a deletion suggestion carrying the author…
    expect(sugg).toHaveLength(1);
    expect(sugg[0].kind).toBe('deletion');
    expect(sugg[0].text).toBe('met all ');
    expect(sugg[0].authorId).toBe(AUTHOR.id);
    expect(sugg[0].authorName).toBe(AUTHOR.name);
    // …and it persists in the saved HTML as a real <del> with attribution.
    expect(html).toContain('<del');
    expect(html).toContain(`data-author-name="${AUTHOR.name}"`);
  });

  it('accepting a deletion removes the text; rejecting restores it clean', () => {
    // Accept
    let ed = makeEditor(DOC, true);
    ed.commands.deleteRange({ from: 11, to: 19 });
    let sugg = collectSuggestions(ed.state.doc);
    ed.commands.resolveSuggestion(sugg[0], 'accept');
    expect(ed.getText()).not.toContain('met all');
    expect(collectSuggestions(ed.state.doc)).toHaveLength(0);
    ed.destroy();

    // Reject
    ed = makeEditor(DOC, true);
    ed.commands.deleteRange({ from: 11, to: 19 });
    sugg = collectSuggestions(ed.state.doc);
    ed.commands.resolveSuggestion(sugg[0], 'reject');
    expect(ed.getText()).toBe('The assay met all acceptance criteria.');
    expect(collectSuggestions(ed.state.doc)).toHaveLength(0);
    expect(ed.getHTML()).not.toContain('<del');
    ed.destroy();
  });
});

describe('track changes — insertions', () => {
  const DOC = '<p>Stability data support the shelf life.</p>';

  it('UNTRACKED (the failure case): typed text lands as settled record content', () => {
    const ed = makeEditor(DOC, false);
    ed.commands.insertContentAt(1, 'Provisional: ');
    const html = ed.getHTML();
    ed.destroy();
    expect(html).toContain('Provisional:');
    expect(html).not.toContain('<ins');
  });

  it('TRACKED: inserted text is a pending, attributed insertion', () => {
    const ed = makeEditor(DOC, true);
    ed.commands.insertContentAt(1, 'Provisional: ');
    const html = ed.getHTML();
    const sugg = collectSuggestions(ed.state.doc);
    ed.destroy();
    expect(sugg).toHaveLength(1);
    expect(sugg[0].kind).toBe('insertion');
    expect(sugg[0].text).toBe('Provisional: ');
    expect(sugg[0].authorName).toBe(AUTHOR.name);
    expect(html).toContain('<ins');
  });

  it('accepting an insertion settles the text; rejecting removes it', () => {
    let ed = makeEditor(DOC, true);
    ed.commands.insertContentAt(1, 'Provisional: ');
    ed.commands.resolveSuggestion(collectSuggestions(ed.state.doc)[0], 'accept');
    expect(ed.getText()).toContain('Provisional: Stability');
    expect(ed.getHTML()).not.toContain('<ins');
    ed.destroy();

    ed = makeEditor(DOC, true);
    ed.commands.insertContentAt(1, 'Provisional: ');
    ed.commands.resolveSuggestion(collectSuggestions(ed.state.doc)[0], 'reject');
    expect(ed.getText()).toBe('Stability data support the shelf life.');
    ed.destroy();
  });

  it('deleting your own pending insertion withdraws it for real (no del-over-ins)', () => {
    const ed = makeEditor(DOC, true);
    ed.commands.insertContentAt(1, 'XX');
    expect(ed.getText()).toContain('XX');
    ed.commands.deleteRange({ from: 1, to: 3 });
    const text = ed.getText();
    const sugg = collectSuggestions(ed.state.doc);
    ed.destroy();
    expect(text).not.toContain('XX');
    expect(sugg).toHaveLength(0);
  });

  it('replacing text yields struck-then-inserted, both attributed', () => {
    const ed = makeEditor('<p>Shelf life is 24 months.</p>', true);
    // Replace "24" with "36"
    ed.commands.insertContentAt({ from: 15, to: 17 }, '36');
    const sugg = collectSuggestions(ed.state.doc);
    const text = ed.getText();
    ed.destroy();
    expect(text).toContain('24');
    expect(text).toContain('36');
    expect(sugg).toHaveLength(2);
    const del = sugg.find((s) => s.kind === 'deletion');
    const ins = sugg.find((s) => s.kind === 'insertion');
    expect(del?.text).toBe('24');
    expect(ins?.text).toBe('36');
    // Redline reads struck-then-inserted.
    expect(del!.from).toBeLessThan(ins!.from);
  });
});

describe('track changes — review flows', () => {
  it('resolveAllSuggestions(accept) applies every pending edit at once', () => {
    const ed = makeEditor('<p>One two three four.</p>', true);
    ed.commands.deleteRange({ from: 5, to: 9 }); // strike "two "
    ed.commands.insertContentAt(1, 'Zero '); // propose "Zero "
    expect(collectSuggestions(ed.state.doc).length).toBe(2);
    ed.commands.resolveAllSuggestions('accept');
    const text = ed.getText();
    expect(collectSuggestions(ed.state.doc)).toHaveLength(0);
    expect(text).toBe('Zero One three four.');
    ed.destroy();
  });

  it('resolveAllSuggestions(reject) restores the document exactly', () => {
    const ed = makeEditor('<p>One two three four.</p>', true);
    ed.commands.deleteRange({ from: 5, to: 9 });
    ed.commands.insertContentAt(1, 'Zero ');
    ed.commands.resolveAllSuggestions('reject');
    expect(ed.getText()).toBe('One two three four.');
    expect(collectSuggestions(ed.state.doc)).toHaveLength(0);
    ed.destroy();
  });

  it('AI drafts land as suggestions attributed to AnA, never as settled text', () => {
    const ed = makeEditor('<p></p>', true);
    ed.commands.insertSuggestedContent(
      'Proposed clinical overview.\n\nSecond proposed paragraph.',
      { id: 'ana', name: 'AnA (AI draft)' },
    );
    const sugg = collectSuggestions(ed.state.doc);
    const html = ed.getHTML();
    ed.destroy();
    expect(sugg.length).toBeGreaterThanOrEqual(2);
    expect(sugg.every((s) => s.kind === 'insertion')).toBe(true);
    expect(sugg.every((s) => s.authorId === 'ana')).toBe(true);
    expect(html).toContain('data-author-name="AnA (AI draft)"');
  });

  it('tracking toggles at runtime through the command', () => {
    const ed = makeEditor('<p>Alpha beta.</p>', false);
    ed.commands.deleteRange({ from: 1, to: 7 });
    expect(ed.getText()).toBe('beta.'); // untracked: destroyed
    ed.commands.setTrackChangesEnabled(true);
    ed.commands.deleteRange({ from: 1, to: 5 });
    expect(ed.getText()).toBe('beta.'); // tracked: retained as suggestion
    expect(collectSuggestions(ed.state.doc)).toHaveLength(1);
    ed.destroy();
  });
});
