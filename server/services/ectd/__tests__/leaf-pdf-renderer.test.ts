/**
 * eCTD leaf PDF renderer — proves the bytes are a real, valid, deterministic PDF
 * (closing the "writes .pdf with non-PDF content" gap). No DB or system binary.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderLeafPdf, htmlToPlainText } from '../leaf-pdf-renderer';

/**
 * Table cells must keep their boundary in the rendered leaf.
 *
 * `tr` produced a line break but `td`/`th` fell through to the generic
 * strip-remaining-tags rule, which inserts nothing — so an HTML table's cells
 * were concatenated: "Arm"+"n" became "Armn", and a dose ran straight into the
 * subject count beside it. No characters were lost, but the boundary between a
 * label and its value was, in a document a regulator reads.
 *
 * Found by extracting text back out of a rendered PDF with pdfjs rather than by
 * reading the reducer — the raw PDF bytes are FlateDecode-compressed, so a
 * substring search over them reports every marker missing whether the content is
 * there or not.
 */
describe('htmlToPlainText — table cell boundaries', () => {
  it('delimits adjacent cells instead of concatenating them', () => {
    const out = htmlToPlainText(
      '<table><tr><th>Arm</th><th>n</th></tr><tr><td>Active 10 mg</td><td>150</td></tr></table>',
    );
    expect(out).toContain('Arm | n');
    expect(out).toContain('Active 10 mg | 150');
    // The regression itself: never run together.
    expect(out).not.toContain('Armn');
    expect(out).not.toContain('mg150');
  });

  it('does not leave a dangling separator at the end of a row', () => {
    // Only the boundary BETWEEN cells becomes a delimiter; the row-final </td>
    // is still stripped by the generic rule.
    const out = htmlToPlainText('<tr><td>a</td><td>b</td></tr>');
    expect(out).toBe('a | b');
  });

  it('leaves non-table content unchanged', () => {
    expect(htmlToPlainText('<p>Endpoint met</p>')).toBe('Endpoint met');
  });
});

describe('htmlToPlainText', () => {
  it('reduces HTML to readable text with block boundaries', () => {
    const out = htmlToPlainText('<h1>Title</h1><p>One &amp; two</p><p>Three</p>');
    expect(out).toContain('Title');
    expect(out).toContain('One & two');
    expect(out).toContain('Three');
    expect(out).not.toMatch(/<[^>]+>/); // no tags remain
  });
});

describe('renderLeafPdf', () => {
  it('produces a valid PDF (correct header, loadable, ≥1 page)', async () => {
    const buf = await renderLeafPdf('<p>Substantial equivalence discussion.</p>', {
      title: 'Section 12',
      sectionCode: '5.3.5.1',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('adds a document-level bookmark (/Outlines) for navigation per FDA eCTD guidance', async () => {
    const buf = await renderLeafPdf('<p>Body.</p>', { title: 'Clinical Overview', sectionCode: '2.5' });
    // A valid /Outlines tree makes the leaf navigable in a reader's bookmark pane.
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(buf.toString('latin1')).toContain('/Outlines');
    expect(buf.toString('latin1')).toContain('Clinical Overview');
  });

  it('is deterministic — identical input yields byte-identical output', async () => {
    const a = await renderLeafPdf('Deterministic content', { title: 'T', sectionCode: '1.1' });
    const b = await renderLeafPdf('Deterministic content', { title: 'T', sectionCode: '1.1' });
    expect(a.equals(b)).toBe(true);
  });

  it('paginates long content across multiple pages', async () => {
    const longText = Array.from({ length: 400 }, (_, i) => `Line ${i} of clinical narrative.`).join('\n');
    const buf = await renderLeafPdf(longText, { title: 'Long' });
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it('renders empty content as a valid one-page PDF (no crash)', async () => {
    const buf = await renderLeafPdf('', { title: 'Empty' });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(buf);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
