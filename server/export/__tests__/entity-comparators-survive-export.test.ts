/**
 * A specification limit written as `&lt; 0.05%` must reach the filed document.
 *
 * ── The defect this exists to close ──────────────────────────────────────────
 * `htmlToOoxml` decoded HTML entities BEFORE stripping the remaining tags:
 *
 *   '<p>Total impurities were &lt; 0.05% and assay was &gt; 98.0%</p>'
 *     → decode  → '<p>Total impurities were < 0.05% and assay was > 98.0%</p>'
 *     → strip   → 'Total impurities were  98.0%'
 *
 * Decoding first turns an author's literal comparator into something the very
 * next rule reads as a tag, and `/<[^>]+>/g` deletes a tag and inserts nothing.
 * Everything between a `<` and the next `>` — here the acceptance criterion and
 * the assay's own comparator — is gone from the built .docx, with no warning
 * and nothing on the page to suggest a limit was ever stated. A reviewer reads
 * "Total impurities were 98.0%", which is not a weaker claim than the truth; it
 * is a different and alarming one.
 *
 * The order is the whole fix: strip markup first, decode entities last, so an
 * entity is never re-scanned as markup. The eCTD leaf pipeline was already
 * correct — it parses HTML into a tree, where a decoded `<` is text and can
 * never be mistaken for a tag — and its legacy fallback already strips before
 * it decodes. Both are pinned here so neither can regress into the same order.
 *
 * Comparators are not decoration in this domain. `&lt;`, `&gt;`, `&le;`, `&ge;`
 * are how release specifications, impurity limits and acceptance criteria are
 * written, and they arrive entity-encoded because that is how the editor stores
 * a literal `<`.
 */
import { describe, it, expect } from 'vitest';

import { htmlToOoxml } from '../../services/docx/masterDocumentBuilder';
import { htmlToPlainText } from '../../services/ectd/leaf-pdf-renderer';

/** OOXML re-escapes for XML on emit, which is correct; compare on the text. */
const ooxmlText = (xml: string) =>
  xml
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const SPEC = '<p>Total impurities were &lt; 0.05% and assay was &gt; 98.0%</p>';

describe('entity-encoded comparators survive export', () => {
  it('DOCX: keeps the limit, the criterion, and the text between them', () => {
    const text = ooxmlText(htmlToOoxml(SPEC));
    expect(text).toContain('< 0.05%');
    expect(text).toContain('> 98.0%');
    // The words between the two comparators are what the tag-strip ate.
    expect(text).toContain('and assay was');
    expect(text).toBe('Total impurities were < 0.05% and assay was > 98.0%');
  });

  it('eCTD leaf: same document, same text', () => {
    const text = htmlToPlainText(SPEC);
    expect(text).toContain('< 0.05%');
    expect(text).toContain('> 98.0%');
    expect(text).toContain('and assay was');
  });

  it('DOCX: a decoded entity is never re-read as a tag', () => {
    /* The literal string `<not-a-tag>` typed by an author, stored encoded.
       Decoding first would strip it; decoding last keeps it verbatim. */
    const text = ooxmlText(htmlToOoxml('<p>Field &lt;not-a-tag&gt; is required</p>'));
    expect(text).toBe('Field <not-a-tag> is required');
  });

  it('DOCX: a real tag is still stripped, and its content kept', () => {
    /* The other half of the rule: fixing the order must not stop markup from
       being reduced. `<strong>` goes, "98.0%" stays. */
    const text = ooxmlText(htmlToOoxml('<p>Assay <strong>98.0%</strong> of label</p>'));
    expect(text).toBe('Assay 98.0% of label');
  });

  it('DOCX: an entity inside a heading survives too', () => {
    const xml = htmlToOoxml('<h2>Impurities &lt; 0.05%</h2>');
    expect(xml).toContain('Heading2');
    expect(ooxmlText(xml)).toBe('Impurities < 0.05%');
  });

  it('DOCX: &amp; decodes exactly once', () => {
    /* `&amp;lt;` is a literal, author-typed "&lt;" — not a comparator. Decoding
       `&amp;` before `&lt;` would collapse it into one and lose that
       distinction; a single pass over the original text cannot. */
    expect(ooxmlText(htmlToOoxml('<p>Smith &amp; Nephew</p>'))).toBe('Smith & Nephew');
    expect(ooxmlText(htmlToOoxml('<p>Type &amp;lt; to compare</p>'))).toBe('Type &lt; to compare');
  });
});
