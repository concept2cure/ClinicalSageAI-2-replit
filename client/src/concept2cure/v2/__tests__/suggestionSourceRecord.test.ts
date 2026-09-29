// @vitest-environment jsdom
/**
 * The AnA turn record rides on the redline — `data-source-record`.
 *
 * An AnA draft enters a section through `insertSuggestedContent` as a pending
 * insertion. Since D5 (2026-09-26) the insertion mark also carries the id of
 * the retained turn record that produced the words (`sourceRecord`), so that a
 * reviewer's accept or reject can name the turn that proposed them, and the
 * server can verify that id against `ana_turn_records` for the tenant.
 *
 * That chain has three links on the client, and each one can break silently:
 *
 *   1. The mark must render the id into the saved section HTML and parse it
 *      back. Section content is stored as HTML, so an attribute that renders
 *      but does not parse is gone after the first reload — the decision made
 *      tomorrow would name no turn.
 *   2. The review strip groups adjacent spans into one suggestion. Two AnA
 *      drafts from two turns, side by side, must stay two suggestions — merged,
 *      one decision would be recorded against one turn for words the other
 *      turn wrote.
 *   3. The decision handed to the host must carry the id.
 *
 * And the converse: text a human typed is never attributed to a turn record.
 *
 * Per CLAUDE.md ("verify by making the check fail") the sourceRecord clause of
 * the merge guard (`continuesRange`), the mark's `parseHTML` for
 * `data-source-record`, and `insertSuggestedContent`'s `sourceRecord` attr
 * were each removed in turn and the corresponding tests below seen red.
 *
 * Two cases pin defects found while writing this file (2026-09-26) and fixed
 * in suggestions.ts on 2026-09-29: a change id that ignored the turn record,
 * and an insertion mark that did not exclude itself. Each was first an
 * `it.fails` that passed while its defect stood; with the fix, each is a
 * plain `it` that goes red if the fix is reverted.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

import {
  TrackChanges,
  changeIdOf,
  collectSuggestions,
  decisionOf,
  type SuggestionDecision,
} from '../editor/suggestions';

/* Two distinct AnA turn-record ids, uuid-shaped as the server mints them. */
const TURN_A = '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41';
const TURN_B = 'b2e7d9f0-1a3c-4b5d-9e8f-7a6b5c4d3e21';

const ANA_A = { id: 'ana', name: 'AnA (AI draft)', sourceRecord: TURN_A };
const ANA_B = { id: 'ana', name: 'AnA (AI draft)', sourceRecord: TURN_B };
const HUMAN = { id: 'user-7', name: 'Jordan Medical Writer' };

const editors: Editor[] = [];

/** The editor as RichSectionEditor builds it: StarterKit, TableKit and the
 *  track-changes extension, with tracking on under a human author. */
function makeEditor(
  content = '<p></p>',
  onResolve?: (d: SuggestionDecision) => void,
  tracking = true,
): Editor {
  const ed = new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TableKit.configure({ table: { resizable: false } }),
      TrackChanges.configure({ enabled: tracking, author: HUMAN, onResolve }),
    ],
    content,
  });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

/** Every `<ins>` element in some serialized HTML, as DOM elements. */
function insElements(html: string): HTMLElement[] {
  const host = document.createElement('div');
  host.innerHTML = html;
  return Array.from(host.querySelectorAll<HTMLElement>('ins'));
}

/** Insertion mark `sourceRecord` of every text node, in document order. */
function textSources(ed: Editor): Array<{ text: string; sourceRecord: unknown }> {
  const out: Array<{ text: string; sourceRecord: unknown }> = [];
  ed.state.doc.descendants((n) => {
    if (!n.isText) return;
    const m = n.marks.find((k) => k.type.name === 'insertion');
    out.push({ text: n.text ?? '', sourceRecord: m ? m.attrs.sourceRecord : undefined });
  });
  return out;
}

/** An `<ins>` exactly as the mark renders one — same attribute names. */
function ins(text: string, sourceRecord: string | null, at = '2026-09-26T10:05:00Z'): string {
  return (
    `<ins data-author-id="ana" data-author-name="AnA (AI draft)" data-at="${at}"` +
    (sourceRecord ? ` data-source-record="${sourceRecord}"` : '') +
    ` class="rse-ins">${text}</ins>`
  );
}

/* ── 1. The id is written into the section HTML and read back out ─────── */

describe('an AnA draft carries its turn record into the saved HTML', () => {
  it('insertSuggestedContent renders data-source-record on every insertion it creates', () => {
    const ed = makeEditor();
    // Structure as well as prose: every node the converter builds carries the
    // same mark, so the id must reach the heading, list and paragraph alike.
    ed.commands.insertSuggestedContent(
      '## Stability\n\nThe product is stable for **24 months**.\n\n- Long-term\n- Accelerated',
      ANA_A,
    );
    const html = ed.getHTML();
    const marks = insElements(html);

    expect(marks.length).toBeGreaterThanOrEqual(4);
    for (const el of marks) {
      expect(el.getAttribute('data-source-record')).toBe(TURN_A);
      expect(el.getAttribute('data-author-id')).toBe('ana');
    }
    // Nothing the draft wrote escaped the mark: no inserted text is unattributed.
    const drafted = textSources(ed).filter((t) => t.text.trim().length > 0);
    expect(drafted.length).toBeGreaterThan(0);
    expect(drafted.every((t) => t.sourceRecord === TURN_A)).toBe(true);
  });

  it('survives a save and reload: the HTML parses back to the same turn record', () => {
    const first = makeEditor();
    first.commands.insertSuggestedContent('Assay remains within 95.0-105.0% of label claim.', ANA_A);
    const saved = first.getHTML();
    expect(saved).toContain(`data-source-record="${TURN_A}"`);

    // A reload builds a fresh editor on the stored content, with tracking on
    // (RichSectionEditor passes it as `content` at construction).
    const reloaded = makeEditor(saved);
    const [range] = collectSuggestions(reloaded.state.doc);
    expect(range).toBeDefined();
    expect(range.kind).toBe('insertion');
    expect(range.authorId).toBe('ana');
    expect(range.text).toBe('Assay remains within 95.0-105.0% of label claim.');
    // The link that breaks silently if parseHTML is missing: rendered, but not
    // read back, the id would vanish on the first reload.
    expect(range.sourceRecord).toBe(TURN_A);
    // And it serializes byte-for-byte as stored, so a reload is not an edit.
    expect(reloaded.getHTML()).toBe(saved);
  });

  it('getHTML → setContent restores the attribute on the mark', () => {
    const first = makeEditor();
    first.commands.insertSuggestedContent('Degradants are controlled per ICH Q3B(R2).', ANA_B);
    const saved = first.getHTML();

    // setContent on a reader's editor (tracking off). With tracking ON,
    // setContent is itself an edit and is tracked as one — not what this
    // test is about.
    const reader = makeEditor('<p>Something else entirely.</p>', undefined, false);
    reader.commands.setContent(saved);

    const ranges = collectSuggestions(reader.state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].sourceRecord).toBe(TURN_B);
    expect(reader.getHTML()).toBe(saved);
    expect(insElements(reader.getHTML()).map((el) => el.getAttribute('data-source-record'))).toEqual([
      TURN_B,
    ]);
  });

  it('parses stored section HTML written by an earlier session', () => {
    // The shape a section row holds after save, with no editor involved.
    const ed = makeEditor(`<p>The impurity is qualified. ${ins('Confirmed by MS/NMR.', TURN_B)}</p>`);
    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].sourceRecord).toBe(TURN_B);
    expect(ranges[0].text).toBe('Confirmed by MS/NMR.');
  });

  it('a stored AnA insertion from before the attribute existed parses as sourceRecord null, never a guess', () => {
    const ed = makeEditor(`<p>${ins('Legacy draft text.', null)}</p>`);
    const [range] = collectSuggestions(ed.state.doc);
    expect(range.authorId).toBe('ana');
    expect(range.sourceRecord).toBeNull();
    expect(ed.getHTML()).not.toContain('data-source-record');
  });
});

/* ── 2. Two turns side by side are two suggestions ────────────────────── */

describe('collectSuggestions keeps drafts from different turns apart', () => {
  it('does NOT merge two adjacent AnA insertions from different turn records', () => {
    // Same author ('ana'), same kind, same minute, touching in one paragraph —
    // every merge criterion but the turn record agrees.
    const ed = makeEditor(`<p>${ins('First turn wrote this. ', TURN_A)}${ins('Second turn wrote this.', TURN_B)}</p>`);
    const ranges = collectSuggestions(ed.state.doc);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].to).toBe(ranges[1].from); // genuinely adjacent
    expect(ranges.map((r) => [r.text, r.sourceRecord])).toEqual([
      ['First turn wrote this. ', TURN_A],
      ['Second turn wrote this.', TURN_B],
    ]);
  });

  it('does NOT merge an AnA insertion that names a turn with one that names none', () => {
    const ed = makeEditor(`<p>${ins('Recorded turn. ', TURN_A)}${ins('Unrecorded turn.', null)}</p>`);
    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges.map((r) => r.sourceRecord)).toEqual([TURN_A, null]);
  });

  it('does merge adjacent spans of the same turn into one suggestion', () => {
    // Bold splits the draft into separate text nodes; the mark is the same, so
    // the review strip must still show ONE suggestion for the one draft.
    const ed = makeEditor();
    ed.commands.insertSuggestedContent('Shelf life is **24 months** at 2-8 °C.', ANA_A);
    let textNodes = 0;
    ed.state.doc.descendants((n) => {
      if (n.isText) textNodes += 1;
    });
    expect(textNodes).toBe(3);

    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].text).toBe('Shelf life is 24 months at 2-8 °C.');
    expect(ranges[0].sourceRecord).toBe(TURN_A);
  });

  it('does merge same-turn spans parsed from stored HTML', () => {
    const ed = makeEditor(
      `<p>${ins('Plain then ', TURN_A)}<strong>${ins('bold', TURN_A)}</strong>${ins(' then plain.', TURN_A)}</p>`,
    );
    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].text).toBe('Plain then bold then plain.');
    expect(ranges[0].sourceRecord).toBe(TURN_A);
  });
});

/* ── 3. The decision names the turn ───────────────────────────────────── */

describe('the decision carries the turn record', () => {
  it('decisionOf copies sourceRecord from the range', () => {
    const ed = makeEditor(`<p>${ins('Proposed by turn B.', TURN_B)}</p>`);
    const [range] = collectSuggestions(ed.state.doc);
    const d = decisionOf(range, 'reject');
    expect(d.sourceRecord).toBe(TURN_B);
    expect(d.authorId).toBe('ana');
    expect(d.text).toBe('Proposed by turn B.');
    expect(d.decision).toBe('reject');
  });

  it('decisionOf keeps null as null — an unknown turn is not invented', () => {
    const d = decisionOf(
      {
        from: 1,
        to: 5,
        kind: 'insertion',
        authorId: 'user-7',
        authorName: 'Jordan Medical Writer',
        at: '2026-09-26T10:05:00Z',
        sourceRecord: null,
        text: 'typed',
      },
      'accept',
    );
    expect(d.sourceRecord).toBeNull();
  });

  it('resolving one suggestion in the editor hands the host its turn record', () => {
    const seen: SuggestionDecision[] = [];
    const ed = makeEditor(
      `<p>${ins('First turn. ', TURN_A)}${ins('Second turn.', TURN_B)}</p>`,
      (d) => seen.push(d),
    );
    const [, second] = collectSuggestions(ed.state.doc);
    ed.commands.resolveSuggestion(second, 'accept');

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ decision: 'accept', text: 'Second turn.', sourceRecord: TURN_B });
    // Only the decided suggestion was touched; the other turn's draft is pending.
    expect(collectSuggestions(ed.state.doc).map((r) => r.sourceRecord)).toEqual([TURN_A]);
  });

  it('"Reject all" hands the host one decision per turn, each naming its own', () => {
    const seen: SuggestionDecision[] = [];
    const ed = makeEditor(
      `<p>${ins('First turn. ', TURN_A)}${ins('Second turn.', TURN_B)}</p>`,
      (d) => seen.push(d),
    );
    ed.commands.resolveAllSuggestions('reject');

    expect(seen.map((d) => [d.text, d.sourceRecord]).sort()).toEqual(
      [
        ['First turn. ', TURN_A],
        ['Second turn.', TURN_B],
      ].sort(),
    );
    expect(ed.getText().trim()).toBe('');
  });

  /* changeIdOf keys on kind + author + minute + text, and the turn record
   * when there is one. Without it, two AnA turns that produce the same words in
   * the same minute (the same question asked twice) shared a change id: the
   * single-decision upsert overwrote the first verdict with the second, and
   * the bulk route's `byId` kept one change per id, so "Accept all" named one
   * turn twice and dropped the other. */
  it('identical drafts from two turns in one minute are two changes', () => {
    const base = {
      from: 1,
      to: 12,
      kind: 'insertion' as const,
      authorId: 'ana',
      authorName: 'AnA (AI draft)',
      at: '2026-09-26T10:05:00Z',
      text: 'Not applicable.',
    };
    expect(changeIdOf({ ...base, sourceRecord: TURN_A })).not.toBe(
      changeIdOf({ ...base, sourceRecord: TURN_B }),
    );
  });
});

/* ── 4. A human's typing is never attributed to a turn ────────────────── */

describe('a human insertion names no turn record', () => {
  it('typed text is tracked as the human author with sourceRecord null', () => {
    const ed = makeEditor('<p>Existing sentence.</p>');
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    ed.commands.insertContent(' Added by hand.');

    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      kind: 'insertion',
      authorId: 'user-7',
      authorName: 'Jordan Medical Writer',
      sourceRecord: null,
      text: ' Added by hand.',
    });
    expect(decisionOf(ranges[0], 'accept').sourceRecord).toBeNull();
    expect(ed.getHTML()).not.toContain('data-source-record');
  });

  it('a human typing after an AnA draft that is resolved keeps no turn record', () => {
    // The draft was accepted (its mark stripped); later typing beside the now
    // settled text is the human's, and names no turn.
    const ed = makeEditor();
    ed.commands.insertSuggestedContent('AnA drafted this.', ANA_A);
    ed.commands.resolveAllSuggestions('accept');
    expect(collectSuggestions(ed.state.doc)).toHaveLength(0);

    ed.commands.setTextSelection(endOfText(ed, 'AnA drafted this.'));
    ed.commands.insertContent(' A human wrote this.');

    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ authorId: 'user-7', sourceRecord: null, text: ' A human wrote this.' });
  });

  /* InsertionMark excludes itself (`excludes: 'insertion deletion'`). When it
   * did not, a human typing at the end of AnA's still-pending draft inherited
   * AnA's insertion mark, the tracking plugin added the human's own mark beside
   * it, and collectSuggestions read the FIRST insertion mark on the node —
   * AnA's. The human's words merged into AnA's suggestion, and its decision
   * named turn A as their source, which the server then recorded as verified
   * because the turn exists. */
  it('a human typing at the end of a pending AnA draft is their own change, naming no turn', () => {
    const ed = makeEditor();
    ed.commands.insertSuggestedContent('AnA drafted this.', ANA_A);
    ed.commands.setTextSelection(endOfText(ed, 'AnA drafted this.'));
    ed.commands.insertContent(' A human wrote this.');

    const ranges = collectSuggestions(ed.state.doc);
    expect(ranges.map((r) => [r.authorId, r.sourceRecord, r.text])).toEqual([
      ['ana', TURN_A, 'AnA drafted this.'],
      ['user-7', null, ' A human wrote this.'],
    ]);
  });
});

/** Position just after the text node reading exactly `text`. */
function endOfText(ed: Editor, text: string): number {
  let end = -1;
  ed.state.doc.descendants((n, pos) => {
    if (n.isText && n.text === text) end = pos + n.nodeSize;
  });
  if (end < 0) throw new Error(`no text node reading ${JSON.stringify(text)}`);
  return end;
}
