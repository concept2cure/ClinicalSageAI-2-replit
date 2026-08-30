/**
 * eCTD leaf PDF renderer — proves the bytes are a real, valid, deterministic PDF
 * (closing the "writes .pdf with non-PDF content" gap). No DB or system binary.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderLeafPdf, htmlToPlainText, toWinAnsiSafe } from '../leaf-pdf-renderer';

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

/**
 * Unicode fidelity in submission text.
 *
 * Every assertion here is a character that a reviewer would have read wrong in a
 * rendered leaf. Found the same way as the table defect above — by extracting
 * text back out of a rendered PDF with pdfjs — and each one is a distinct
 * failure mode:
 *
 *   silent deletion   Greek letters hit `[/[Α-Ωα-ω]/g, '']`. "Spearman ρ = 0.42"
 *                     rendered as "Spearman = 0.42": grammatical, complete-looking,
 *                     and no longer identifying which statistic was computed.
 *   value corruption  a bare-digit superscript map turns "10⁶ CFU/mL" into
 *                     "106 CFU/mL" — four orders of magnitude, still plausible.
 *   needless loss     the tail filter rejected everything above U+00FF, replacing
 *                     en dashes, curly quotes and daggers with '?' even though
 *                     pdf-lib's WinAnsi encoder draws all of them.
 */
describe('htmlToPlainText — a superscript is not silently dropped', () => {
  /* The same failure as the table cells above — the tag is removed and nothing
     is inserted — but the result is not merely run together, it is a DIFFERENT
     VALUE that looks entirely normal. Nothing on the rendered page suggests
     anything was lost, which is what makes it the worst kind of export defect:
     plausible, confident and wrong. */
  it('keeps the magnitude: 10^6, not 106', () => {
    expect(htmlToPlainText('<p>Bioburden was 10<sup>6</sup> CFU/mL.</p>')).toBe(
      'Bioburden was 10^6 CFU/mL.',
    );
  });

  it('keeps an exponent in a unit', () => {
    expect(htmlToPlainText('<p>Surface area 12 cm<sup>2</sup>.</p>')).toBe(
      'Surface area 12 cm^2.',
    );
  });

  it('leaves subscript inline, which is the conventional written form', () => {
    /* The asymmetry is deliberate and is the reason this case is pinned:
       dropping a superscript changes a magnitude, dropping a subscript does
       not. `CO2` reads correctly; `CO_2` would be the unusual rendering. */
    expect(htmlToPlainText('<p>Dissolved CO<sub>2</sub> was measured.</p>')).toBe(
      'Dissolved CO2 was measured.',
    );
  });
});

describe('htmlToPlainText — an unresolved change is not settled for the author', () => {
  /* Stripping ins/del silently ACCEPTED every pending suggestion. The DOCX
     branch states the rule this restores: "an unresolved suggestion is part of
     the record's human-readable form and silently settling it either way at
     export time would fabricate a decision nobody made." */
  it('does not fuse a proposed replacement into one garbled value', () => {
    // Was "Administer 100 mg200 mg daily."
    expect(
      htmlToPlainText('<p>Administer <del>100 mg</del><ins>200 mg</ins> daily.</p>'),
    ).toBe('Administer [-100 mg-][+200 mg+] daily.');
  });

  it('does not accept a proposed DELETION into the filed leaf', () => {
    /* The most dangerous of the four: not garbled, just quietly wrong. The
       leaf stated "Dose 100 mg daily." as settled fact while a reviewer had
       proposed removing that dose. */
    const out = htmlToPlainText('<p>Dose <del>100 mg</del> daily.</p>');
    expect(out).toBe('Dose [-100 mg-] daily.');
    expect(out, 'a pending deletion was rendered as settled text').not.toBe(
      'Dose 100 mg daily.',
    );
  });

  it('does not accept a proposed INSERTION either', () => {
    expect(htmlToPlainText('<p>Dose <ins>200 mg</ins> daily.</p>')).toBe(
      'Dose [+200 mg+] daily.',
    );
  });

  it('handles the attributed marks the editor actually writes', () => {
    /* The editor's suggestion marks carry data-author-name and data-at, so a
       pattern that only matched a bare <ins> would miss every real one. */
    expect(
      htmlToPlainText(
        '<p>x <del data-author-name="QA" data-at="2026-01-01T00:00:00Z">a</del>' +
          '<ins data-author-name="QA">b</ins> y</p>',
      ),
    ).toBe('x [-a-][+b+] y');
  });

  it('leaves settled prose completely alone', () => {
    // The working path: no marks, no brackets, no change.
    expect(htmlToPlainText('<p>Administer 200 mg daily.</p>')).toBe('Administer 200 mg daily.');
  });
});

describe('toWinAnsiSafe — submission text fidelity', () => {
  it('transliterates Greek letters instead of deleting them', () => {
    expect(toWinAnsiSafe('Spearman ρ = 0.42')).toBe('Spearman rho = 0.42');
    expect(toWinAnsiSafe('Kendall τ = 0.31')).toBe('Kendall tau = 0.31');
    expect(toWinAnsiSafe('Δ from baseline -2.4')).toBe('Delta from baseline -2.4');
    expect(toWinAnsiSafe('θ estimate 0.83')).toBe('theta estimate 0.83');
    expect(toWinAnsiSafe('AUC π-corrected')).toBe('AUC pi-corrected');
    expect(toWinAnsiSafe('χ² = 4.21')).toBe('chi^2 = 4.21');
  });

  it('leaves no Greek letter unaccounted for — the fallback marks, never removes', () => {
    // Final sigma and accented forms have no transliteration entry. They must
    // still be visible as a loss; an empty string is the outcome this pins shut.
    for (const greek of ['ς', 'ά', 'ή', 'ώ']) {
      const out = toWinAnsiSafe(`value ${greek} here`);
      expect(out).not.toBe('value  here');
      expect(out).toMatch(/value .+ here/);
    }
  });

  it('keeps exponents as exponents', () => {
    expect(toWinAnsiSafe('10⁶ CFU/mL')).toBe('10^6 CFU/mL');
    // The number must never come out as a different number.
    expect(toWinAnsiSafe('10⁶ CFU/mL')).not.toContain('106');
    expect(toWinAnsiSafe('5×10⁻³ M')).toBe('5×10^-3 M');
    expect(toWinAnsiSafe('1.2×10¹² particles')).toBe('1.2×10^12 particles');
  });

  it('uses one exponent notation throughout, including the Latin-1 superscripts', () => {
    // ¹ ² ³ reach the page as glyphs while ⁴-⁹ and ⁻ do not, so substituting
    // only the latter spelled one number two ways: "5×10⁻³" -> "5×10^-³".
    expect(toWinAnsiSafe('BSA 1.73 m²')).toBe('BSA 1.73 m^2');
    expect(toWinAnsiSafe('250 cm³')).toBe('250 cm^3');
    expect(toWinAnsiSafe('5×10⁻³')).not.toMatch(/[⁰-⁹¹²³⁻]/);
  });

  it('renders subscripts as ordinary digits in chemical formulae', () => {
    expect(toWinAnsiSafe('CO₂ and H₂O')).toBe('CO2 and H2O');
  });

  it('preserves the CP1252 punctuation the encoder can actually draw', () => {
    const text = 'Range 10–20 mg — “primary” and ‘secondary’ • item … † ‡ ™';
    // Not a single character lost or substituted.
    expect(toWinAnsiSafe(text)).toBe(text);
  });

  it('still substitutes operators outside the code page rather than dropping them', () => {
    expect(toWinAnsiSafe('p ≤ 0.05 and n ≥ 30')).toBe('p <= 0.05 and n >= 30');
    expect(toWinAnsiSafe('A → B, ≠ placebo')).toBe('A -> B, != placebo');
  });

  it('leaves WinAnsi characters clinical text depends on untouched', () => {
    const text = 'Cmax 45 µg/mL ± 1.1 at 37 °C, 99 % w/w, ÷ and ×';
    expect(toWinAnsiSafe(text)).toBe(text);
  });
});

describe('renderLeafPdf — the retained characters are drawable', () => {
  // toWinAnsiSafe keeping a character is only correct if pdf-lib's WinAnsi
  // encoder can encode it; if it cannot, drawText throws and the whole
  // submission export fails. This is the half a pure string test cannot prove.
  it('renders CP1252 punctuation and transliterated statistics without throwing', async () => {
    const pdf = await renderLeafPdf(
      '<p>Range 10–20 mg — “primary” and ‘secondary’ • … † ‡ ™ €</p>' +
        '<p>χ² = 4.21, Spearman ρ = 0.42, Δ -2.4, 10⁶ CFU/mL, CO₂, 45 µg/mL ± 1.1</p>',
      { title: 'Statistics', sectionCode: 'm5.3.5.3' },
    );
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('draws the redline brackets and the caret this renderer now emits', async () => {
    /* Held to this file's own standard: a character htmlToPlainText emits is
       only safe if pdf-lib's WinAnsi encoder can actually draw it, or the whole
       submission export throws. `^ [ ] + -` are ASCII and encode, and that is
       asserted rather than assumed — a string test alone cannot prove it. */
    const pdf = await renderLeafPdf(
      '<p>Administer <del>100 mg</del><ins>200 mg</ins> daily; 10<sup>6</sup> CFU/mL.</p>',
      { title: 'Redline', sectionCode: 'm5.3.5.3' },
    );
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('is total over arbitrary Unicode — unmappable input degrades, never crashes', async () => {
    const pdf = await renderLeafPdf('<p>漢字 🧬 ᚠᚢᚦ</p>', { title: 'T' });
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
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
