/**
 * Footnotes reach a filed document as footnotes.
 *
 * ── Why this is not a nicety ─────────────────────────────────────────────────
 * Regulatory tables are built on footnotes. Every Module 3 specification,
 * batch-analysis and stability table carries them — "a Determined by HPLC;
 * b n=3; c ITT population" — and so does every efficacy summary in Module 2.7.
 * The editor had no footnote of any kind: `grep -ri footnote` over the editor,
 * the block model and both renderers returned nothing functional. A writer's
 * only option was a superscript letter and a loose paragraph underneath, which
 * detaches the moment the table moves and cannot survive an export.
 *
 * ── The design, and what each half is for ────────────────────────────────────
 * The note travels WITH its reference (`<sup data-note="...">`) rather than in
 * a separate list, so cutting a table row carries its own note and cannot
 * orphan it. The MARKER is derived from position at render time and never
 * stored — move a row, reorder two tables, and the letters come out right with
 * nobody renumbering by hand.
 *
 * DOCX gets real Word footnotes (FootnoteReferenceRun + Document.footnotes):
 * auto-numbered, at the foot of the cited page, renumbered by Word itself.
 * HTML has no page, so it gets lettered markers and a Notes block after the
 * content — which is where a table's notes sit in a printed submission anyway.
 */
import { describe, expect, it } from 'vitest';
import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToHtml } from '../authoring-blocks-to-html';

const TABLE_WITH_NOTES =
  '<table><tbody>' +
  '<tr><td>Assay<sup data-note="Determined by HPLC.">1</sup></td>' +
  '<td>98.2%<sup data-note="n=3 at release.">2</sup></td></tr>' +
  '</tbody></table>' +
  '<p>Content uniformity was within specification<sup data-note="Determined by HPLC.">x</sup>.</p>';

describe('footnotes', () => {
  it('parses a note off its reference rather than dropping it', () => {
    const blocks = sectionContentToBlocks('<p>Text<sup data-note="A note.">1</sup></p>');
    const runs = blocks.flatMap((b) => b.runs ?? []);
    expect(runs.some((r) => r.footnote === 'A note.')).toBe(true);
  });

  it('leaves ordinary superscript alone — cm², t½ are not footnotes', () => {
    const runs = sectionContentToBlocks('<p>12 cm<sup>2</sup></p>').flatMap((b) => b.runs ?? []);
    const sup = runs.find((r) => r.superScript);
    expect(sup).toBeTruthy();
    expect(sup?.footnote).toBeUndefined();
  });

  it('letters the markers by position and collects the notes after the content', () => {
    const html = blocksToHtml(sectionContentToBlocks(TABLE_WITH_NOTES));

    expect(html).toContain('<sup class="fn-ref">a</sup>');
    expect(html).toContain('<sup class="fn-ref">b</sup>');
    expect(html).toContain('<section class="footnotes">');
    expect(html).toContain('<dd>Determined by HPLC.</dd>');
    expect(html).toContain('<dd>n=3 at release.</dd>');

    // The notes block follows the content that cites them.
    expect(html.indexOf('<section class="footnotes">')).toBeGreaterThan(html.indexOf('<table>'));
  });

  it('gives the same note text ONE letter, however often it is cited', () => {
    const html = blocksToHtml(sectionContentToBlocks(TABLE_WITH_NOTES));

    // "Determined by HPLC." is cited twice — in the table and in the prose.
    expect((html.match(/<sup class="fn-ref">a<\/sup>/g) || []).length).toBe(2);
    // …and appears once in the notes block.
    expect((html.match(/<dd>Determined by HPLC\.<\/dd>/g) || []).length).toBe(1);
    // Two distinct notes, so exactly two definitions.
    expect((html.match(/<dt>/g) || []).length).toBe(2);
  });

  it('emits no notes block at all when nothing cites one', () => {
    const html = blocksToHtml(sectionContentToBlocks('<p>Plain paragraph.</p>'));
    expect(html).not.toContain('footnotes');
  });

  it('does not merge two references to DIFFERENT notes into one run', () => {
    // Adjacent runs are merged when their formatting matches; without the
    // footnote in that comparison the second note would be silently discarded.
    const runs = sectionContentToBlocks(
      '<p><sup data-note="First.">1</sup><sup data-note="Second.">2</sup></p>',
    ).flatMap((b) => b.runs ?? []);
    const notes = runs.map((r) => r.footnote).filter(Boolean);
    expect(notes).toEqual(['First.', 'Second.']);
  });
});
