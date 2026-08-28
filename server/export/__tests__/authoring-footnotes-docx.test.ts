/**
 * Footnotes reach Word as REAL footnotes, not as superscript text.
 *
 * The HTML half of this feature is covered by authoring-footnotes.test.ts. This
 * one packs an actual .docx and reads the XML, because everything that makes a
 * footnote useful to a reviewer lives in the file format rather than in the
 * text: Word auto-numbers footnotes, places them at the foot of the page they
 * are cited on, renumbers them when content moves, and lists them in the
 * References pane. A superscript letter does none of that — it is a rendering
 * artefact that happens to look like a note.
 *
 * Two files have to agree for that to work, which is why this test reads both:
 *   word/document.xml   must carry <w:footnoteReference w:id="N"/> at the citation
 *   word/footnotes.xml  must carry the note text under that same id
 * A reference with no matching note is a Word document that opens with an empty
 * footnote, and a note with no reference never appears at all — either way the
 * writer's note is gone from the filing, which is the failure this guards.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import * as docx from 'docx';
import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToDocx, orderedListNumbering } from '../authoring-blocks-to-docx';

/** Mirrors what the export route does: one sink for the whole document, ids
 *  unique across the file, identical note text reusing its id. */
function packWithFootnotes(html: string) {
  const notes = new Map<string, number>();
  const footnoteSink = (text: string): number => {
    const hit = notes.get(text);
    if (hit !== undefined) return hit;
    const id = notes.size + 1;
    notes.set(text, id);
    return id;
  };
  const children = blocksToDocx(docx, sectionContentToBlocks(html), undefined, { footnoteSink });
  const doc = new docx.Document({
    numbering: orderedListNumbering(docx),
    ...(notes.size > 0
      ? {
          footnotes: Object.fromEntries(
            [...notes.entries()].map(([text, id]) => [
              String(id),
              { children: [new docx.Paragraph({ text })] },
            ]),
          ),
        }
      : {}),
    sections: [{ children: children as never[] }],
  });
  return docx.Packer.toBuffer(doc).then((buf) => {
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    const zip = new AdmZip(buf);
    const read = (p: string) => zip.getEntry(p)?.getData().toString('utf8') ?? '';
    return { document: read('word/document.xml'), footnotes: read('word/footnotes.xml') };
  });
}

const SPEC_TABLE =
  '<table><tbody><tr>' +
  '<td>Assay<sup data-note="Determined by HPLC.">1</sup></td>' +
  '<td>98.2%<sup data-note="n=3 at release.">2</sup></td>' +
  '</tr></tbody></table>';

describe('footnotes in a packed .docx', () => {
  it('emits a real w:footnoteReference, not a superscript run', async () => {
    const { document } = await packWithFootnotes('<p>Text<sup data-note="A note.">1</sup></p>');

    expect(document).toMatch(/<w:footnoteReference\b[^>]*w:id="1"/);
    // The marker character the author typed must NOT survive as literal text —
    // Word owns the numbering, and printing "1" beside its own marker would
    // double it.
    expect(document).not.toMatch(/<w:t[^>]*>1<\/w:t>/);
  });

  it('writes the note text into footnotes.xml under the id that cites it', async () => {
    const { document, footnotes } = await packWithFootnotes(SPEC_TABLE);

    expect(footnotes).toContain('Determined by HPLC.');
    expect(footnotes).toContain('n=3 at release.');

    // Every id referenced in the body must exist in footnotes.xml. A dangling
    // reference opens in Word as an empty footnote.
    const referenced = [...document.matchAll(/<w:footnoteReference\b[^>]*w:id="(\d+)"/g)].map((m) => m[1]);
    expect(referenced.length).toBe(2);
    for (const id of referenced) {
      expect(footnotes).toMatch(new RegExp(`<w:footnote\\b[^>]*w:id="${id}"`));
    }
  });

  it('carries a footnote out of a TABLE CELL — the case the feature exists for', async () => {
    const { document } = await packWithFootnotes(SPEC_TABLE);

    // The reference must sit inside the table, not be hoisted out of it.
    const table = document.slice(document.indexOf('<w:tbl>'), document.indexOf('</w:tbl>'));
    expect(table).toMatch(/<w:footnoteReference\b/);
  });

  it('degrades to text rather than vanishing when no sink is supplied', async () => {
    // A path that cannot letter a note must still ship the author's words.
    const children = blocksToDocx(docx, sectionContentToBlocks('<p>X<sup data-note="Kept.">1</sup></p>'));
    const doc = new docx.Document({ sections: [{ children: children as never[] }] });
    const buf = await docx.Packer.toBuffer(doc);
    const xml = new AdmZip(buf).getEntry('word/document.xml')!.getData().toString('utf8');

    expect(xml).not.toMatch(/<w:footnoteReference\b/);
    expect(xml).toMatch(/<w:t[^>]*>1<\/w:t>/);
  });
});
