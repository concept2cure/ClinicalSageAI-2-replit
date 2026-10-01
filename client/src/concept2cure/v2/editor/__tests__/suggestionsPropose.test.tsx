// @vitest-environment jsdom
/**
 * AnA's anchored proposal lands in the existing editor as a tracked redline.
 *
 * Two defects and one missing door, pinned together because they are one path
 * (D2, AnA document awareness, step 4 of 0-survey-critic-and-plan.md):
 *
 * 1. `insertSuggestedContent` over a NON-EMPTY selection deleted the selected
 *    text untracked. It ran `replaceSelection` under SUGGESTION_ACTION_META —
 *    the meta that tells the tracking plugin "leave this one alone" — so the
 *    person's words vanished from the record with no deletion mark, no author
 *    and nothing to reject. An AI suggestion that replaces text must leave that
 *    text struck, attributed to the same author and turn as the insertion.
 *
 * 2. There was no way to put a proposal at a PLACE in a section. AnA could only
 *    insert at the caret. `proposeReplacement` finds a quoted passage, requires
 *    that it identifies exactly one place, and redlines it: the quote struck,
 *    the replacement inserted after it, both under AnA's name. Anything it
 *    cannot do honestly it refuses, with a reason the person is shown.
 *
 * 3. The editor handle and the conversation bridge expose that command, and
 *    refuse where insertSuggestion refuses (source mode, frozen). The bridge
 *    test lives in editorBridgePropose.test.tsx, because it stands up the
 *    canvas and its mocked store.
 *
 * An adversarial review of the first cut (2026-10-01, 2-fixes.txt) found the
 * redline was not always reversible, and pinned the contract this file now
 * holds every door to: after Reject all the section is EXACTLY what it was,
 * and after Accept all it is exactly what was proposed. A multi-paragraph
 * replacement in the middle of a sentence split the paragraph untracked, so
 * rejecting it left the sentence in two halves with empty paragraphs between.
 * The same review found the struck selection attributed to AnA instead of the
 * person whose selection chose it, replacements trimmed, quotes matched more
 * strictly than the reader that produced them writes them, ambiguity counted
 * inside pending suggestions, a contradicting prefix ignored, and the
 * person's caret moved and scrolled.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

import {
  SUGGESTION_ACTION_META,
  TrackChanges,
  collectSuggestions,
  proposeReplacement,
  type SuggestionAuthor,
} from '../suggestions';
import { computeMatches } from '../findReplace';
import { RichSectionEditor, type RichSectionEditorHandle } from '../RichSectionEditor';

/* jsdom has no layout; ProseMirror's scrollIntoView asks for rects. */
const emptyRects = () => [] as unknown as DOMRectList;
const zeroRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = zeroRect;
}

const TURN = '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41';
const ANA: SuggestionAuthor = { id: 'ana', name: 'AnA (AI draft)', sourceRecord: TURN };
const HUMAN: SuggestionAuthor = { id: 'user-7', name: 'Jordan Medical Writer' };

const editors: Editor[] = [];

/** The editor as RichSectionEditor builds it, tracking on under a human. */
function makeEditor(content: string, editable = true): Editor {
  const ed = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: true, author: HUMAN }),
    ],
    content,
    editable,
  });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
  cleanup();
});

function els(html: string, tag: 'ins' | 'del'): HTMLElement[] {
  const host = document.createElement('div');
  host.innerHTML = html;
  return Array.from(host.querySelectorAll<HTMLElement>(tag));
}

/** Every attribute that attributes a suggestion, as the saved HTML carries it. */
function attribution(el: HTMLElement) {
  return {
    authorId: el.getAttribute('data-author-id'),
    authorName: el.getAttribute('data-author-name'),
    at: el.getAttribute('data-at'),
    sourceRecord: el.getAttribute('data-source-record'),
  };
}

const ANA_ATTRS = { authorId: 'ana', authorName: 'AnA (AI draft)', sourceRecord: TURN };

/** AnA's proposal, as the conversation hands it over. */
const ask = (ed: Editor, quote: string, replacement: string, ctx: { prefix?: string; suffix?: string } = {}) =>
  proposeReplacement(ed, { quote, replacement, author: ANA, ...ctx });
const OK = { ok: true };
const refused = (reason: string) => ({ ok: false, reason });

/* ── 1. Insert over a selection strikes the selection ───────────────── */

describe('insertSuggestedContent over a selection', () => {
  it('strikes the selected text as the person\u2019s deletion, then inserts AnA\u2019s text', () => {
    const ed = makeEditor('<p>The product is stable for 18 months at 25 °C.</p>');
    const [hit] = computeMatches(ed.state.doc, '18 months', true);
    ed.commands.setTextSelection(hit);

    expect(ed.commands.insertSuggestedContent('24 months', ANA)).toBe(true);

    const html = ed.getHTML();
    const dels = els(html, 'del');
    expect(dels.map((d) => d.textContent), 'the selected text left the record untracked').toEqual([
      '18 months',
    ]);
    const [ins] = els(html, 'ins');
    expect(ins?.textContent).toBe('24 months');
    // The person chose what goes: their selection, their deletion — not AnA's,
    // and not AnA's turn record. The words that come in are AnA's.
    expect(attribution(dels[0])).toMatchObject({
      authorId: 'user-7',
      authorName: 'Jordan Medical Writer',
      sourceRecord: null,
    });
    expect(attribution(ins)).toMatchObject(ANA_ATTRS);
    expect(attribution(dels[0]).at).toBe(attribution(ins).at);
    // Redlines read struck-then-inserted, inline where a phrase replaced a phrase.
    expect(collectSuggestions(ed.state.doc).map((r) => [r.kind, r.authorId, r.text, r.sourceRecord])).toEqual([
      ['deletion', 'user-7', '18 months', null],
      ['insertion', 'ana', '24 months', TURN],
    ]);
    expect(ed.state.doc.childCount).toBe(1);
    expect(ed.getText()).toBe('The product is stable for 18 months24 months at 25 °C.');
    // Kept out of undo history, as the insert always was.
    expect(ed.can().undo()).toBe(false);
  });

  it('strikes the text of every paragraph a selection spans, joining none of them', () => {
    const ed = makeEditor('<p>First claim.</p><p>Second claim.</p>');
    const [a] = computeMatches(ed.state.doc, 'claim.', true);
    const [b] = computeMatches(ed.state.doc, 'Second', true);
    ed.commands.setTextSelection({ from: a.from, to: b.to });
    ed.commands.insertSuggestedContent('One merged claim.', ANA);

    // Both paragraphs stand, every selected word still in them, struck.
    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.getText()).toBe('First claim.\n\nSecondOne merged claim. claim.');
    expect(collectSuggestions(ed.state.doc).map((r) => [r.kind, r.authorId, r.text])).toEqual([
      ['deletion', 'user-7', 'claim.'],
      ['deletion', 'user-7', 'Second'],
      ['insertion', 'ana', 'One merged claim.'],
    ]);
  });

  it('withdraws a pending insertion inside the selection, as a hand deletion does', () => {
    const ed = makeEditor(
      '<p>Stable for <ins data-author-id="user-7" data-author-name="Jordan Medical Writer" data-at="2026-09-30T09:00:00Z">about </ins>18 months.</p>',
    );
    const [hit] = computeMatches(ed.state.doc, 'about 18 months', true);
    ed.commands.setTextSelection(hit);
    ed.commands.insertSuggestedContent('24 months', ANA);
    expect(collectSuggestions(ed.state.doc).map((r) => [r.kind, r.authorId, r.text])).toEqual([
      ['deletion', 'user-7', '18 months'],
      ['insertion', 'ana', '24 months'],
    ]);
  });

  it('a collapsed caret still inserts with nothing struck (the shipped behaviour)', () => {
    const ed = makeEditor('<p>Stability summary.</p>');
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    ed.commands.insertSuggestedContent('Long-term data support 24 months.', ANA);
    expect(els(ed.getHTML(), 'del')).toHaveLength(0);
    expect(els(ed.getHTML(), 'ins').map((e) => e.textContent)).toEqual([
      'Long-term data support 24 months.',
    ]);
  });
});

/* ── 2. proposeReplacement ───────────────────────────────────────────── */

describe('proposeReplacement — one quoted place, redlined', () => {
  it('strikes the single match and inserts the replacement after it, both AnA\u2019s', () => {
    const ed = makeEditor('<p>The product is stable for 18 months at 25 °C/60% RH.</p>');
    expect(ask(ed, '18 months', '24 months')).toEqual(OK);

    const html = ed.getHTML();
    const [del] = els(html, 'del');
    const [ins] = els(html, 'ins');
    expect(del?.textContent).toBe('18 months');
    expect(ins?.textContent).toBe('24 months');
    expect(attribution(del)).toMatchObject(ANA_ATTRS);
    expect(attribution(ins)).toMatchObject(ANA_ATTRS);
    expect(attribution(del).at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/);
    expect(attribution(del).at).toBe(attribution(ins).at);
    // Inline, in the same paragraph, struck text kept: the record still reads
    // what was there until someone decides.
    expect(ed.state.doc.childCount).toBe(1);
    expect(ed.getText()).toBe('The product is stable for 18 months24 months at 25 °C/60% RH.');
    expect(html).not.toContain('data-author-id="user-7"');
    // The same history rule as insertSuggestedContent: not an undo entry.
    expect(ed.can().undo()).toBe(false);
  });

  it('reads the replacement as the markdown subset insertSuggestedContent reads', () => {
    const ed = makeEditor('<p>Shelf life is 18 months.</p>');
    expect(ask(ed, '18 months', '**24 months**')).toEqual(OK);
    const [ins] = els(ed.getHTML(), 'ins');
    expect(ins.textContent).toBe('24 months');
    expect(ed.getHTML()).toMatch(/<strong><ins[^>]*>24 months<\/ins><\/strong>|<ins[^>]*><strong>24 months<\/strong><\/ins>/);
  });
});

describe('proposeReplacement — which place, if exactly one', () => {
  it('refuses not-found when the quote is not in the section, and changes nothing', () => {
    const ed = makeEditor('<p>The product is stable for 18 months.</p>');
    const before = ed.getHTML();
    expect(ask(ed, '36 months', '24 months')).toEqual(refused('not-found'));
    // Exact matching: a quote is the words, not a case-folded guess at them.
    expect(ask(ed, '18 MONTHS', '24 months')).toEqual(refused('not-found'));
    expect(ask(ed, '', 'x')).toEqual(refused('not-found'));
    expect(ed.getHTML()).toBe(before);
  });

  it('refuses ambiguous when the quote occurs twice, and changes nothing', () => {
    const ed = makeEditor('<p>Assay is 98.0%.</p><p>Assay is 99.1%.</p>');
    const before = ed.getHTML();
    expect(ask(ed, 'Assay is', 'Assay was')).toEqual(refused('ambiguous'));
    // Context that both occurrences carry does not pick one either.
    expect(ask(ed, 'Assay is', 'Assay was', { suffix: ' 9' })).toEqual(refused('ambiguous'));
    expect(ed.getHTML()).toBe(before);
  });

  it('lets a suffix pick the occurrence it follows', () => {
    const ed = makeEditor('<p>Assay is 98.0%.</p><p>Assay is 99.1%.</p>');
    expect(ask(ed, 'Assay is', 'Assay was', { suffix: ' 99.1%' })).toEqual(OK);
    const paras = Array.from(ed.view.dom.querySelectorAll('p'));
    expect(paras[0].querySelector('del')).toBeNull();
    expect(paras[1].querySelector('del')?.textContent).toBe('Assay is');
    expect(paras[1].querySelector('ins')?.textContent).toBe('Assay was');
  });

  it('lets a prefix pick the occurrence it precedes, across a paragraph break', () => {
    const ed = makeEditor('<p>Assay is 98.0%.</p><p>Assay is 99.1%.</p>');
    expect(ask(ed, 'Assay is', 'Assay was', { prefix: 'Assay is 98.0%.\n\n' })).toEqual(OK);
    const paras = Array.from(ed.view.dom.querySelectorAll('p'));
    expect(paras[0].querySelector('del')).toBeNull();
    expect(paras[1].querySelector('del')?.textContent).toBe('Assay is');
  });
});

describe('proposeReplacement — deletions, and what it will not touch', () => {
  it('an empty replacement is a deletion proposal only', () => {
    const ed = makeEditor('<p>Stable for 18 months, provisionally, at 25 °C.</p>');
    expect(ask(ed, ', provisionally,', '')).toEqual(OK);
    const html = ed.getHTML();
    expect(els(html, 'ins')).toHaveLength(0);
    const [del] = els(html, 'del');
    expect(del.textContent).toBe(', provisionally,');
    expect(attribution(del)).toMatchObject(ANA_ATTRS);
    expect(collectSuggestions(ed.state.doc).map((r) => r.kind)).toEqual(['deletion']);
  });

  it('refuses rather than restrike text that is already a pending suggestion', () => {
    // A person's pending insertion is theirs to have decided; AnA striking it
    // would turn their proposal into AnA's deletion of it.
    const ed = makeEditor(
      '<p>Stable for <ins data-author-id="user-7" data-author-name="Jordan Medical Writer" data-at="2026-09-30T09:00:00Z">18 months</ins>.</p>',
    );
    const before = ed.getHTML();
    expect(ask(ed, '18 months', '24 months')).toEqual(refused('overlaps-suggestion'));
    expect(ed.getHTML()).toBe(before);
  });

  it('refuses not-editable on an editor that is not editable', () => {
    const ed = makeEditor('<p>Stable for 18 months.</p>', false);
    const before = ed.getHTML();
    expect(ask(ed, '18 months', '24 months')).toEqual(refused('not-editable'));
    expect(ed.getHTML()).toBe(before);
  });
});

/* ── 2b. The contract: reject restores, accept proposes ─────────────────── */

/**
 * Run `act` on a section, then decide everything it proposed — once on the
 * live editor, once on an editor reloaded from the saved HTML (a redline is
 * decided after a save as often as before one) — and return what each
 * decision left, with the section as it was.
 */
function decideBothWays(content: string, act: (ed: Editor) => void) {
  const ed = makeEditor(content);
  const original = ed.getHTML();
  act(ed);
  const proposed = ed.getHTML();
  ed.commands.resolveAllSuggestions('reject');
  const rejectedLive = ed.getHTML();
  const reloaded = makeEditor(proposed);
  reloaded.commands.resolveAllSuggestions('reject');
  const rejectedReloaded = reloaded.getHTML();
  const toAccept = makeEditor(proposed);
  toAccept.commands.resolveAllSuggestions('accept');
  // Accept all before any reload too: a space the saved HTML cannot carry made
  // the two disagree (round two, D2), and only one of them can be the proposal.
  const live = makeEditor(content);
  act(live);
  live.commands.resolveAllSuggestions('accept');
  return { original, proposed, rejectedLive, rejectedReloaded, accepted: toAccept.getHTML(), acceptedLive: live.getHTML() };
}

function expectRoundTrip(r: ReturnType<typeof decideBothWays>, intended: string) {
  expect(r.proposed, 'the act proposed nothing').not.toBe(r.original);
  expect(r.rejectedLive, 'Reject all did not restore the section').toBe(r.original);
  expect(r.rejectedReloaded, 'Reject all after a reload did not restore the section').toBe(r.original);
  expect(r.accepted, 'Accept all is not what was proposed').toBe(intended);
  expect(r.acceptedLive, 'Accept all before a reload is not what was proposed').toBe(intended);
}

const propose = (quote: string, replacement: string) => (ed: Editor) => {
  expect(ask(ed, quote, replacement)).toEqual(OK);
};

describe('proposeReplacement — reject restores the section exactly, accept is the proposal', () => {
  it('a phrase replaced inside a sentence', () => {
    expectRoundTrip(
      decideBothWays('<p>Store at 25 °C for use.</p>', propose('25 °C', '30 °C')),
      '<p>Store at 30 °C for use.</p>',
    );
  });

  it('a whole paragraph replaced by two paragraphs', () => {
    expectRoundTrip(
      decideBothWays(
        '<p>Intro.</p><p>Old claim text.</p><p>Closing.</p>',
        propose('Old claim text.', 'New claim one.\n\nNew claim two.'),
      ),
      '<p>Intro.</p><p>New claim one.</p><p>New claim two.</p><p>Closing.</p>',
    );
  });

  it('a whole paragraph replaced by a list: accepting takes the struck paragraph with it', () => {
    expectRoundTrip(
      decideBothWays(
        '<p>Intro.</p><p>Old claim text.</p><p>Closing.</p>',
        propose('Old claim text.', '- first control\n- second control'),
      ),
      '<p>Intro.</p><ul><li><p>first control</p></li><li><p>second control</p></li></ul><p>Closing.</p>',
    );
  });

  it('the tail of a paragraph replaced by two paragraphs', () => {
    expectRoundTrip(
      decideBothWays(
        '<p>Intro. Old tail.</p><p>Closing.</p>',
        propose('Old tail.', 'New A.\n\nNew B.'),
      ),
      '<p>Intro. New A.</p><p>New B.</p><p>Closing.</p>',
    );
  });

  it('refuses structural, changing nothing, when paragraphs would go inside a sentence', () => {
    for (const replacement of ['Line one\n\nLine two', '- a\n- b', '| A | B |\n| --- | --- |\n| 1 | 2 |']) {
      const ed = makeEditor('<p>Before old text after.</p><p>Closing.</p>');
      const before = ed.getHTML();
      expect(ask(ed, 'old text', replacement), replacement).toEqual(refused('structural'));
      expect(ed.getHTML()).toBe(before);
    }
  });

  it('keeps the whitespace a replacement carries (no trimming of an inline edit)', () => {
    const r = decideBothWays('<p>Store at 25 C for use.</p>', propose('25 C ', '30 C '));
    expect(els(r.proposed, 'del').map((d) => d.textContent)).toEqual(['25 C ']);
    expect(els(r.proposed, 'ins').map((d) => d.textContent)).toEqual(['30 C ']);
    expectRoundTrip(r, '<p>Store at 30 C for use.</p>');
    // And a leading space, which trimming took as well.
    expectRoundTrip(
      decideBothWays('<p>Stable for 18 months.</p>', propose(' 18 months', ' 24 months')),
      '<p>Stable for 24 months.</p>',
    );
  });
});

describe('insertSuggestedContent over a selection — reject restores, accept is the proposal', () => {
  const select = (quote: string, draft: string) => (ed: Editor) => {
    const [hit] = computeMatches(ed.state.doc, quote, true);
    ed.commands.setTextSelection(hit);
    expect(ed.commands.insertSuggestedContent(draft, ANA)).toBe(true);
  };

  it('a phrase', () => {
    expectRoundTrip(
      decideBothWays('<p>Stable for 18 months at 25 °C.</p>', select('18 months', '24 months')),
      '<p>Stable for 24 months at 25 °C.</p>',
    );
  });

  it('paragraphs drafted over words mid-sentence go after that paragraph, never into it', () => {
    const r = decideBothWays(
      '<p>Stable for 18 months at 25 °C.</p><p>Closing.</p>',
      select('18 months', 'First point.\n\nSecond point.'),
    );
    expectRoundTrip(r, '<p>Stable for  at 25 °C.</p><p>First point.</p><p>Second point.</p><p>Closing.</p>');
  });

  it('a list drafted over a whole paragraph', () => {
    expectRoundTrip(
      decideBothWays(
        '<p>Intro.</p><p>Old claim text.</p><p>Closing.</p>',
        select('Old claim text.', '- first control\n- second control'),
      ),
      '<p>Intro.</p><ul><li><p>first control</p></li><li><p>second control</p></li></ul><p>Closing.</p>',
    );
  });
});

describe('insertSuggestedContent at a caret — reject restores, accept is the proposal', () => {
  const at = (where: (ed: Editor) => number, draft: string) => (ed: Editor) => {
    ed.commands.setTextSelection(where(ed));
    expect(ed.commands.insertSuggestedContent(draft, ANA)).toBe(true);
  };
  const endOfFirst = (ed: Editor) => ed.state.doc.firstChild!.nodeSize - 1;

  it('one paragraph at the end of a paragraph', () => {
    expectRoundTrip(
      decideBothWays('<p>Stability summary.</p><p>Closing.</p>', at(endOfFirst, 'Long-term data.')),
      '<p>Stability summary.</p><p>Long-term data.</p><p>Closing.</p>',
    );
  });

  it('two paragraphs at the end of the section', () => {
    expectRoundTrip(
      decideBothWays('<p>Stability summary.</p>', at((ed) => ed.state.doc.content.size - 1, 'One.\n\nTwo.')),
      '<p>Stability summary.</p><p>One.</p><p>Two.</p>',
    );
  });

  it('a paragraph with the caret mid-sentence goes after that paragraph', () => {
    expectRoundTrip(
      decideBothWays('<p>Stability summary.</p>', at(() => 10, 'Long-term data.')),
      '<p>Stability summary.</p><p>Long-term data.</p>',
    );
  });

  it('paragraphs at the start of a paragraph go before it', () => {
    expectRoundTrip(
      decideBothWays('<p>Stability summary.</p>', at(() => 1, 'One.\n\nTwo.')),
      '<p>One.</p><p>Two.</p><p>Stability summary.</p>',
    );
  });

  it('paragraphs into an empty paragraph fill it, and rejecting leaves it empty again', () => {
    expectRoundTrip(
      decideBothWays(
        '<p>Stability summary.</p><p></p><p>Closing.</p>',
        at((ed) => ed.state.doc.firstChild!.nodeSize + 1, 'One.\n\nTwo.'),
      ),
      '<p>Stability summary.</p><p>One.</p><p>Two.</p><p>Closing.</p>',
    );
  });

  it('a table at the end of a paragraph', () => {
    const r = decideBothWays(
      '<p>Stability summary.</p><p>Closing.</p>',
      at(endOfFirst, '| A | B |\n| --- | --- |\n| 1 | 2 |'),
    );
    expect(r.rejectedLive).toBe(r.original);
    expect(r.rejectedReloaded).toBe(r.original);
    expect(r.accepted).toMatch(/^<p>Stability summary\.<\/p><table[^]*<\/table><p>Closing\.<\/p>$/);
  });

  it('a person typing inside a drafted paragraph keeps it standing when the draft is rejected', () => {
    // The paragraph is the draft's only while nothing else is in it.
    const ed = makeEditor('<p>Stability summary.</p><p>Closing.</p>');
    ed.commands.setTextSelection(ed.state.doc.firstChild!.nodeSize - 1);
    ed.commands.insertSuggestedContent('Long-term data.', ANA);
    ed.commands.insertContent(' Mine.');
    const draft = collectSuggestions(ed.state.doc).find((r) => r.authorId === 'ana')!;
    ed.commands.resolveSuggestion(draft, 'reject');
    expect(ed.state.doc.childCount).toBe(3);
    expect(ed.state.doc.child(1).textContent).toBe(' Mine.');
  });
});

/* ── 2c. Matching agrees with the reader ─────────────────────────────── */

describe('proposeReplacement — a quote as the reader wrote it', () => {
  it('treats a non-breaking space and any whitespace run as one space', () => {
    // Typed in, not parsed: HTML parsing collapses the run before the editor sees it.
    const ed = makeEditor('<p></p>');
    ed.view.dispatch(ed.state.tr.insertText('Store at 25\u00a0°C  for use.', 1).setMeta(SUGGESTION_ACTION_META, true));
    expect(ask(ed, '25 °C for', '30 °C for')).toEqual(OK);
    expect(els(ed.getHTML(), 'del').map((d) => d.textContent)).toEqual(['25 °C  for']);
  });

  it('reads list markers in a prefix as the reader writes them', () => {
    const ed = makeEditor('<ul><li><p>Assay is 98.0%.</p></li><li><p>Assay is 99.1%.</p></li></ul>');
    expect(ask(ed, 'Assay is', 'Assay was', { prefix: '- Assay is 98.0%.\n- ' })).toEqual(OK);
    const items = Array.from(ed.view.dom.querySelectorAll('li'));
    expect(items[0].querySelector('del')).toBeNull();
    expect(items[1].querySelector('del')?.textContent).toBe('Assay is');
  });

  it('reads heading markers and numbered items in a prefix and a suffix', () => {
    const ed = makeEditor('<h2>Results</h2><p>Assay is 98.0%.</p><h2>Release</h2><p>Assay is 99.1%.</p>');
    expect(ask(ed, 'Assay is', 'Assay was', { prefix: '## Release\n\n' })).toEqual(OK);
    expect(ed.view.dom.querySelectorAll('p')[1].querySelector('del')?.textContent).toBe('Assay is');

    const ol = makeEditor('<ol><li><p>Store cold.</p></li><li><p>Ship cold.</p></li></ol><p>Store cold.</p>');
    expect(ask(ol, 'Store cold.', 'Store at 2–8 °C.', { suffix: '\n2. Ship cold.' })).toEqual(OK);
    expect(ol.view.dom.querySelector('li del')?.textContent).toBe('Store cold.');
  });

  it('reads table cell separators in a prefix', () => {
    const ed = makeEditor(
      '<table><tbody><tr><td><p>A</p></td><td><p>Assay is</p></td></tr><tr><td><p>B</p></td><td><p>Assay is</p></td></tr></tbody></table><p>End.</p>',
    );
    expect(ask(ed, 'Assay is', 'X', { prefix: 'A | Assay is\nB | ' })).toEqual(OK);
    const rows = Array.from(ed.view.dom.querySelectorAll('tr'));
    expect(rows[0].querySelector('del')).toBeNull();
    expect(rows[1].querySelector('del')?.textContent).toBe('Assay is');
  });

  it('a quote across a paragraph break is not found — it names no one place to redline', () => {
    const ed = makeEditor('<p>First claim.</p><p>Second claim.</p>');
    expect(ask(ed, 'First claim.\n\nSecond', 'x')).toEqual(refused('not-found'));
  });
});

describe('proposeReplacement — pending suggestions and anchors', () => {
  const STRUCK = (t: string) =>
    `<del data-author-id="user-7" data-author-name="Jordan Medical Writer" data-at="2026-09-30T09:00:00Z">${t}</del>`;

  it('does not count an occurrence inside a pending suggestion toward ambiguity', () => {
    const ed = makeEditor(`<p>Dose ${STRUCK('5 mg')} 10 mg.</p><p>Max 5 mg daily.</p>`);
    expect(ask(ed, '5 mg', '6 mg')).toEqual(OK);
    const paras = Array.from(ed.view.dom.querySelectorAll('p'));
    expect(paras[1].querySelector('del[data-author-id="ana"]')?.textContent).toBe('5 mg');
    expect(paras[0].querySelector('del[data-author-id="ana"]')).toBeNull();
  });

  it('refuses overlaps-suggestion when the only occurrence is inside a pending suggestion', () => {
    const ed = makeEditor(`<p>Dose ${STRUCK('5 mg')} 10 mg.</p>`);
    const before = ed.getHTML();
    expect(ask(ed, '5 mg', '6 mg')).toEqual(refused('overlaps-suggestion'));
    expect(ed.getHTML()).toBe(before);
  });

  it('refuses overlaps-suggestion when the quote runs into a pending deletion', () => {
    const ed = makeEditor(`<p>Dose ${STRUCK('5 mg')} 10 mg.</p>`);
    const before = ed.getHTML();
    expect(ask(ed, 'Dose 5 mg', 'Dose 6 mg')).toEqual(refused('overlaps-suggestion'));
    expect(ed.getHTML()).toBe(before);
  });

  it('refuses not-found when a given prefix or suffix contradicts the one occurrence', () => {
    const ed = makeEditor('<p>Assay is 98.0%.</p>');
    const before = ed.getHTML();
    expect(ask(ed, 'Assay is', 'Assay was', { prefix: 'Completely different ' })).toEqual(refused('not-found'));
    expect(ask(ed, 'Assay is', 'Assay was', { suffix: ' 99.1%' })).toEqual(refused('not-found'));
    expect(ed.getHTML()).toBe(before);
    // Context the occurrence does carry still applies it.
    expect(ask(ed, 'Assay is', 'Assay was', { suffix: ' 98.0%.' })).toEqual(OK);
  });

  it('refuses not-found when the context fits none of several occurrences', () => {
    const ed = makeEditor('<p>Assay is 98.0%.</p><p>Assay is 99.1%.</p>');
    expect(ask(ed, 'Assay is', 'Assay was', { suffix: ' 97.5%' })).toEqual(refused('not-found'));
  });
});

describe('proposeReplacement — the person keeps their place', () => {
  it('does not move the caret, and does not scroll', () => {
    const ed = makeEditor('<p>Intro sentence here.</p><p>The product is stable for 18 months.</p>');
    ed.commands.setTextSelection({ from: 2, to: 7 });
    const scrolled: boolean[] = [];
    ed.on('transaction', ({ transaction }) => scrolled.push(transaction.scrolledIntoView));
    expect(ask(ed, '18 months', '24 months')).toEqual(OK);
    expect([ed.state.selection.from, ed.state.selection.to]).toEqual([2, 7]);
    expect(scrolled).toEqual([false]);
  });

  it('a caret after the quote is carried past the proposal, still at the same words', () => {
    const ed = makeEditor('<p>Stable for 18 months. Closing words.</p>');
    const [closing] = computeMatches(ed.state.doc, 'Closing', true);
    ed.commands.setTextSelection(closing.from);
    ask(ed, '18 months', '24 months');
    const sel = ed.state.selection.from;
    expect(ed.state.doc.textBetween(sel, sel + 'Closing'.length)).toBe('Closing');
  });
});

/* ── 3. The handle ───────────────────────────────────────────────────── */

describe('RichSectionEditorHandle.proposeReplacement', () => {
  const base = {
    value: '<p>The product is stable for 18 months.</p>',
    onSave: vi.fn(async () => {}),
    chrome: 'full' as const,
    ariaLabel: 'Section content',
  };
  const PROPOSAL = { quote: '18 months', replacement: '24 months' };

  it('redlines an editable rich section', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(<RichSectionEditor {...base} ref={ref} />);
    expect(ref.current?.proposeReplacement(PROPOSAL, ANA)).toEqual(OK);
    expect(document.querySelector('.tiptap del[data-author-id="ana"]')?.textContent).toBe('18 months');
    expect(document.querySelector('.tiptap ins[data-author-id="ana"]')?.textContent).toBe('24 months');
    expect(ref.current?.getContent()).toContain(`data-source-record="${TURN}"`);
  });

  it('refuses not-editable on a frozen section', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(<RichSectionEditor {...base} ref={ref} readOnly />);
    expect(ref.current?.proposeReplacement(PROPOSAL, ANA)).toEqual(refused('not-editable'));
    expect(document.querySelector('.tiptap del')).toBeNull();
  });

  it('refuses not-editable in source mode, where the editor is not the document', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    const value = '<p>The product is stable for 18 months.</p><figure><img src="x.png" alt="" /></figure>';
    render(<RichSectionEditor {...base} ref={ref} value={value} />);
    expect(ref.current?.proposeReplacement(PROPOSAL, ANA)).toEqual(refused('not-editable'));
    expect(ref.current?.getContent()).toBe(value);
  });
});
