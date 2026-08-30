/**
 * @vitest-environment jsdom
 *
 * The round-trip fidelity gate for the canonical section editor.
 *
 * This is the acceptance test the retired ENABLE_RICH_SECTION_EDITOR flag
 * demanded before rich editing could ship: prove the editor's parse/serialize
 * cycle preserves the stored content's text exactly, across every content
 * generation the store holds (textarea plain text, execCommand-era HTML,
 * clean editor HTML, suggestion marks).
 *
 * Per the repository working agreement ("verify by making the check fail"),
 * the gate is exercised on content it exists to CATCH: HTML whose text a
 * schema parse would silently drop. The test first proves the loss is real
 * (parse retains less text than the DOM holds), then proves the gate flags
 * it lossy so the editor refuses rich mode for that section.
 */

import { describe, expect, it } from 'vitest';
import { Editor, generateJSON } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';

import {
  assessFidelity,
  htmlVisibleText,
  looksLikeHtml,
  normalizeForCompare,
  plainTextToHtml,
} from '../../client/src/concept2cure/v2/editor/roundTrip';
import { TrackChanges } from '../../client/src/concept2cure/v2/editor/suggestions';
import { CommentAnchor } from '../../client/src/concept2cure/v2/editor/commentAnchor';

const EXTENSIONS = [
  StarterKit,
  TableKit.configure({ table: { resizable: false } }),
  Superscript,
  Subscript,
  TrackChanges,
  CommentAnchor,
];

function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: EXTENSIONS,
    content,
  });
}

function jsonDocText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(jsonDocText).join('');
  return node.type === 'doc' ? inner : inner + '\n';
}

/** stored → parse → serialize → parse again: the second cycle must be a fixed
 *  point, and no cycle may lose a word. */
function roundTrip(storedHtml: string) {
  const ed1 = makeEditor(storedHtml);
  const html1 = ed1.getHTML();
  const text1 = ed1.getText({ blockSeparator: '\n' });
  ed1.destroy();
  const ed2 = makeEditor(html1);
  const html2 = ed2.getHTML();
  const text2 = ed2.getText({ blockSeparator: '\n' });
  ed2.destroy();
  return { html1, html2, text1, text2 };
}

describe('round-trip fidelity gate', () => {
  it('plain textarea-era content survives conversion with every word intact', () => {
    const stored =
      'Primary endpoint was overall survival.\n\nSecondary endpoints included PFS & ORR.\nAnalysis per ICH E9.';
    expect(looksLikeHtml(stored)).toBe(false);
    const html = plainTextToHtml(stored);
    const json = generateJSON(html, EXTENSIONS);
    const verdict = assessFidelity(stored, json);
    expect(verdict.lossy).toBe(false);
    expect(verdict.parsedText).toContain('PFS & ORR');
  });

  it('execCommand-era DocCanvas HTML normalizes without losing a word', () => {
    // The shape blocksToHtml + execCommand actually persisted: h2, p, b/i/u,
    // list markup, and the .dc-prov provenance strip div.
    const stored =
      '<h2>Device Description</h2>' +
      '<p>The <b>BX-204</b> assay uses <i>rezatinib</i> as reference standard.</p>' +
      '<div class="dc-prov"><span class="dc-prov-src">CSR 2.7.3</span><span class="dc-prov-conf" data-c="hi">HI</span><span class="dc-prov-audit">a1b2c3</span></div>' +
      '<ul><li>Sensitivity 98.2%</li><li>Specificity 97.1%</li></ul>';
    const json = generateJSON(stored, EXTENSIONS);
    const verdict = assessFidelity(stored, json);
    expect(verdict.lossy).toBe(false);
    for (const phrase of ['BX-204', 'rezatinib', 'CSR 2.7.3', 'Sensitivity 98.2%', 'Specificity 97.1%']) {
      expect(verdict.parsedText).toContain(phrase);
    }
  });

  it('serialize→parse is a fixed point (no drift on repeated save)', () => {
    const stored =
      '<h2>Stability</h2><p>Store at 2–8 °C.</p><table><tbody><tr><th>Time</th><th>Assay %</th></tr><tr><td>0 m</td><td>100.1</td></tr></tbody></table>';
    const { html1, html2, text1, text2 } = roundTrip(stored);
    expect(html2).toBe(html1);
    expect(normalizeForCompare(text2)).toBe(normalizeForCompare(text1));
    expect(text1).toContain('100.1');
  });

  it('CATCHES the loss case: text a schema parse silently drops is flagged, not rewritten', () => {
    // execCommand paste could carry a <style> block. The DOM holds its text;
    // ProseMirror's parse drops it. Saving the parse would rewrite the record.
    const stored =
      '<p>Acceptance criterion: ±5%.</p><style>.x{color:red}</style><p>Method: HPLC.</p>';

    // 1) The loss is real — this is the check being shown to fail on the case
    //    it exists to catch (a naive rich editor would persist this parse).
    const json = generateJSON(stored, EXTENSIONS);
    const domText = normalizeForCompare(htmlVisibleText(stored));
    const parsedText = normalizeForCompare(jsonDocText(json));
    expect(parsedText).not.toBe(domText);
    expect(domText).toContain('.x{color:red}');
    expect(parsedText).not.toContain('.x{color:red}');

    // 2) The gate catches it and the editor must refuse rich mode.
    const verdict = assessFidelity(stored, json);
    expect(verdict.lossy).toBe(true);
  });

  it('suggestion and comment marks persist through save/reload with attribution', () => {
    const stored =
      '<p>Baseline text <ins data-author-id="u1" data-author-name="Dana Reviewer" data-at="2026-08-17T09:30:00Z">added claim</ins> and ' +
      '<del data-author-id="u1" data-author-name="Dana Reviewer" data-at="2026-08-17T09:30:00Z">struck claim</del> with ' +
      '<span data-comment-id="c-42">an annotated range</span>.</p>';
    const { html1, html2 } = roundTrip(stored);
    expect(html2).toBe(html1);
    expect(html1).toContain('data-author-name="Dana Reviewer"');
    expect(html1).toContain('<ins');
    expect(html1).toContain('<del');
    expect(html1).toContain('data-comment-id="c-42"');
    // Text of both pending states is retained: the suggestion is unresolved.
    const ed = makeEditor(html1);
    const text = ed.getText();
    ed.destroy();
    expect(text).toContain('added claim');
    expect(text).toContain('struck claim');
  });

  it('prose containing tag-shaped tokens is plain text, not HTML to parse away', () => {
    // A textarea author can legitimately write `<critical>` as prose. Any-tag
    // detection routed this through an HTML parse that swallowed the token on
    // BOTH sides of the fidelity comparison — a silent loss the gate itself
    // could not see. Known-tag detection keeps it literal.
    const stored = 'Alarm fires above the <critical> threshold & logs the event.';
    expect(looksLikeHtml(stored)).toBe(false);
    const html = plainTextToHtml(stored);
    const ed = makeEditor(html);
    const text = ed.getText();
    ed.destroy();
    expect(text).toContain('<critical>');
    expect(text).toContain('& logs');
    // Real markup still detects as markup.
    expect(looksLikeHtml('<p>real markup</p>')).toBe(true);
    expect(looksLikeHtml('x <ins data-author-id="a">y</ins>')).toBe(true);
  });

  it('plain text with single newlines survives the text-format serializer', () => {
    const stored = 'Line one\nLine two\n\nParagraph two';
    const ed = makeEditor(plainTextToHtml(stored));
    const back = ed.getText({
      blockSeparator: '\n\n',
      textSerializers: { hardBreak: () => '\n' },
    });
    ed.destroy();
    expect(normalizeForCompare(back)).toBe(normalizeForCompare(stored));
    // And the words arrive in order, unfused across the break.
    expect(back).toContain('Line one');
    expect(back).toContain('Line two');
  });
});

/**
 * BP-W1-1 — the editor must be able to MAKE the content a CTD needs, not just
 * round-trip content that arrives by paste.
 */
describe('BP-W1-1 authoring capabilities', () => {
  it('superscript and subscript survive as formatting, not just as text', () => {
    // Before the extensions were wired in, "cm<sup>2</sup>" parsed to plain
    // "cm2": the fidelity gate passed (no TEXT was lost) while the meaning
    // changed — the silent-flatten defect this pins.
    const stored = '<p>Body surface area in cm<sup>2</sup>; CO<sub>2</sub> headspace ≤ 5%.</p>';
    const { html1, html2 } = roundTrip(stored);
    expect(html2).toBe(html1);
    expect(html1).toContain('<sup>');
    expect(html1).toContain('<sub>');
  });

  it('a stability table can be AUTHORED with the editor commands and serializes as a real table', () => {
    // The ribbon's insert-table button runs exactly this chain. 3 storage
    // conditions × timepoint columns — the wave-gate shape, built from
    // nothing rather than pasted.
    const ed = makeEditor('<p></p>');
    ed.chain().focus().insertTable({ rows: 4, cols: 3, withHeaderRow: true }).run();
    ed.chain().focus().insertContent('Condition').run();
    const html = ed.getHTML();
    ed.destroy();
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect((html.match(/<tr>/g) ?? []).length).toBe(4);
    expect(html).toContain('Condition');

    // And the authored table re-parses as itself: authoring → save → reload.
    const { html1, html2 } = roundTrip(html);
    expect(html2).toBe(html1);
    expect(html1).toContain('<table');
  });

  it('table structure commands work against an authored table', () => {
    const ed = makeEditor('<p></p>');
    ed.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    ed.chain().focus().addRowAfter().run();
    ed.chain().focus().addColumnAfter().run();
    const html = ed.getHTML();
    ed.destroy();
    expect((html.match(/<tr>/g) ?? []).length).toBe(3);
    // 3 columns in the header row after addColumnAfter.
    expect((html.match(/<th[\s>]/g) ?? []).length).toBe(3);
  });
});
