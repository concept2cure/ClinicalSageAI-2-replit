/**
 * An unresolved tracked change exports as a REAL Word revision, not as coloured text.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * A pending insertion was emitted as a TextRun coloured 067647, a deletion as
 * one coloured B42318 with a strike. It LOOKED like a redline and was not one.
 *
 * Everything a reviewer does with a redline in Word — Accept, Reject, Next,
 * Accept All, the reviewing pane, filtering by author — is driven by w:ins and
 * w:del elements. Against coloured text the entire Review ribbon is inert.
 *
 * That is not a nicety; it is the industry's review loop. A medical writer
 * sends a draft out, QC and the regulatory reviewer work in Word, and the
 * document comes back with revisions to accept. Exporting colours meant every
 * change had to be retyped by hand — and any change the reviewer did not notice
 * stayed in the file as green text, a rendering artefact heading into a
 * submission.
 *
 * ── Why it could not be done before ──────────────────────────────────────────
 * Word attributes a revision, and enables accept/reject on it, only when it
 * carries an author and a date. The editor's suggestion marks have written
 * data-author-name and data-at since they were built (v2/editor/suggestions.ts),
 * but the server parser dropped both, so by the time the renderer saw a tracked
 * change it knew only the KIND. The parser now carries them.
 *
 * These assertions go through docx.Packer and read word/document.xml out of the
 * real .docx, so they are about the file a reviewer actually opens.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import * as docx from 'docx';
import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToDocx, orderedListNumbering } from '../authoring-blocks-to-docx';

const FIXED = '2026-08-20T09:15:00Z';

async function documentXml(html: string, revisionDate = FIXED): Promise<string> {
  const doc = new docx.Document({
    numbering: orderedListNumbering(docx),
    sections: [{ children: blocksToDocx(docx, sectionContentToBlocks(html), undefined, { revisionDate }) as never[] }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  return new AdmZip(buf).getEntry('word/document.xml')!.getData().toString('utf8');
}

/** What the editor actually stores for a tracked edit. */
const TRACKED = `<p>The primary endpoint was <ins data-author-id="7" data-author-name="J. Rivera" data-at="2026-08-19T14:02:00Z">overall survival</ins><del data-author-id="7" data-author-name="J. Rivera" data-at="2026-08-19T14:02:00Z">progression-free survival</del>.</p>`;

describe('tracked changes reach Word as revisions a reviewer can accept', () => {
  it('emits w:ins for an insertion, attributed to its author and time', async () => {
    const xml = await documentXml(TRACKED);

    expect(xml).toMatch(/<w:ins\b/);
    expect(xml).toMatch(/w:author="J\. Rivera"/);
    expect(xml).toMatch(/w:date="2026-08-19T14:02:00Z"/);
    // The inserted words must be inside the revision, not merely near it.
    expect(xml).toMatch(/<w:ins\b[^>]*>[\s\S]*?overall survival[\s\S]*?<\/w:ins>/);
  });

  it('emits w:del with delText for a deletion', async () => {
    const xml = await documentXml(TRACKED);

    expect(xml).toMatch(/<w:del\b/);
    // Deleted text lives in w:delText — in w:t it would read as body copy.
    expect(xml).toMatch(/<w:delText[^>]*>progression-free survival<\/w:delText>/);
  });

  /**
   * The regression guard. This is the shape that shipped, and it is exactly
   * what a reviewer cannot act on.
   */
  it('does not fall back to colouring the text', async () => {
    const xml = await documentXml(TRACKED);

    expect(xml, 'the old insertion colour').not.toContain('067647');
    expect(xml, 'the old deletion colour').not.toContain('B42318');
  });

  it('gives every revision a unique id, as Word requires', async () => {
    const xml = await documentXml(TRACKED);
    const ids = [...xml.matchAll(/<w:(?:ins|del)\b[^>]*\bw:id="(\d+)"/g)].map((m) => m[1]);

    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size, 'duplicate revision ids collapse separate edits').toBe(ids.length);
  });

  it('falls back to a named-but-unattributed revision when the mark carries no author', async () => {
    const xml = await documentXml('<p>Dose <ins>10 mg</ins>.</p>');

    // Still a real revision — a mark without attribution must not silently
    // degrade to plain text, which would apply the edit without review.
    expect(xml).toMatch(/<w:ins\b/);
    expect(xml).toMatch(/w:author="Unattributed"/);
    // …and the caller's date is used rather than the wall clock, so the same
    // section exports to the same bytes twice.
    expect(xml).toContain(FIXED);
  });

  it('leaves settled text alone — no revision markup on an ordinary paragraph', async () => {
    const xml = await documentXml('<p>The study met its primary endpoint.</p>');

    expect(xml).not.toMatch(/<w:ins\b/);
    expect(xml).not.toMatch(/<w:del\b/);
    expect(xml).toContain('The study met its primary endpoint.');
  });
});
