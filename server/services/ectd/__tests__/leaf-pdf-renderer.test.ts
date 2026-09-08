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

/**
 * Structural fidelity of stored document HTML.
 *
 * Each case below is content that a reviewer would have read wrong, or not read
 * at all, in a filed leaf. They were found by rendering representative CSR and
 * protocol markup and extracting the text back out with pdfjs. The reducer that
 * produced them stripped tags with regexes, so anything whose meaning lived in
 * the structure rather than the characters was lost without a trace.
 */
describe('htmlToPlainText — structural fidelity', () => {
  it('never drops a figure silently', () => {
    // The failure this pins shut: "See figure. After." — a cross-reference in
    // the surrounding prose pointing at content that is no longer on the page,
    // with nothing to indicate a figure was ever there.
    const out = htmlToPlainText(
      '<p>See figure.</p><img src="fig1.png" alt="Kaplan-Meier survival curve"><p>After.</p>',
    );
    expect(out).toContain('[Figure: Kaplan-Meier survival curve]');
    expect(out).toContain('See figure.');
    expect(out).toContain('After.');
  });

  it('falls back to the file name when a figure has no alt text', () => {
    expect(htmlToPlainText('<p>x</p><img src="/uploads/2026/consort.png">')).toContain(
      '[Figure: consort.png]',
    );
  });

  it('keeps ordered-list numbering, including an explicit start', () => {
    // "as described in step 3" needs a step 3 to point at.
    expect(
      htmlToPlainText('<ol><li>Screening</li><li>Randomization</li><li>Follow-up</li></ol>'),
    ).toBe('1. Screening\n2. Randomization\n3. Follow-up');
    expect(htmlToPlainText('<ol start="3"><li>Third</li><li>Fourth</li></ol>')).toBe(
      '3. Third\n4. Fourth',
    );
  });

  it('keeps list nesting depth distinguishable', () => {
    // Flattened, the sub-criteria of "Inclusion" became siblings of "Exclusion"
    // and which criteria belonged to which heading was unrecoverable.
    const out = htmlToPlainText(
      '<ul><li>Inclusion<ul><li>Age 18-65<ul><li>documented</li></ul></li>' +
        '<li>ECOG 0-1</li></ul></li><li>Exclusion</li></ul>',
    );
    expect(out).toBe('- Inclusion\n  - Age 18-65\n    - documented\n  - ECOG 0-1\n- Exclusion');
    const indents = out.split('\n').map((line) => /^ */.exec(line)![0].length);
    expect(indents).toEqual([0, 2, 4, 2, 0]);
  });

  it('separates definition terms from their definitions', () => {
    // Previously: "AEAdverse eventSAESerious AE".
    const out = htmlToPlainText(
      '<dl><dt>AE</dt><dd>Adverse event</dd><dt>SAE</dt><dd>Serious AE</dd></dl>',
    );
    expect(out).toContain('AE: Adverse event');
    expect(out).toContain('SAE: Serious AE');
    expect(out).not.toContain('eventSAE');
  });

  it('decodes the named and numeric entities a document actually contains', () => {
    // Only five entities were decoded, so "37&deg;C" printed literally.
    const out = htmlToPlainText(
      '<p>37&deg;C &plusmn;2 &mdash; &ndash; &alpha; &le; &#8805; &#x00B1; &amp; &lt;5%</p>',
    );
    expect(out).toBe('37°C ±2 — – α ≤ ≥ ± & <5%');
    // The lone '&' above is a decoded &amp;, not a survivor: no entity syntax
    // may reach the page.
    expect(out).not.toMatch(/&[a-z]+;|&#x?[0-9a-f]+;/i);
  });

  it('preserves indentation inside <pre>', () => {
    expect(htmlToPlainText('<pre>SAS PROC MIXED\n  MODEL chg = trt base;\nRUN;</pre>')).toBe(
      'SAS PROC MIXED\n  MODEL chg = trt base;\nRUN;',
    );
  });

  it('does not leak stylesheet or script bodies into the document', () => {
    expect(htmlToPlainText('<style>p{color:red}</style><p>Body</p><script>alert(1)</script>')).toBe(
      'Body',
    );
  });

  it('keeps a row intact when a cell contains a block element or a nested table', () => {
    // Both used to break the row across lines and leave a dangling " | ".
    expect(
      htmlToPlainText(
        '<table><tr><th><h4>Arm</h4></th><th>n</th></tr><tr><td>Active</td><td>150</td></tr></table>',
      ),
    ).toBe('Arm | n\nActive | 150');
    expect(
      htmlToPlainText(
        '<table><tr><td><table><tr><td>x</td><td>y</td></tr></table></td><td>z</td></tr></table>',
      ),
    ).toBe('x | y | z');
    expect(htmlToPlainText('<table><tr><td>Dose<br>10 mg</td><td>n=50</td></tr></table>')).toBe(
      'Dose 10 mg | n=50',
    );
  });

  it('keeps the shared inline marks the DOCX pipeline also emits', () => {
    // Routed through inlineMarksToText rather than reimplemented, so an
    // unresolved suggestion is never silently settled by one pipeline only.
    expect(htmlToPlainText('<p>Administer <del>100 mg</del><ins>200 mg</ins> daily.</p>')).toBe(
      'Administer [-100 mg-][+200 mg+] daily.',
    );
    expect(htmlToPlainText('<p>10<sup>6</sup> CFU/mL</p>')).toBe('10^6 CFU/mL');
    // Subscript stays a written formula: dropping it gives CO2, which is right.
    expect(htmlToPlainText('<p>H<sub>2</sub>O and CO<sub>2</sub></p>')).toBe('H2O and CO2');
  });

  it('is total over malformed markup and empty input', () => {
    // A submission export must not fail on whatever an author pasted in.
    expect(() => htmlToPlainText('<p>unclosed <b>bold <td>weird')).not.toThrow();
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('plain text, no markup')).toBe('plain text, no markup');
  });

  it('is deterministic — the leaf checksum contract depends on it', () => {
    const html =
      '<ol><li>A<ul><li>B</li></ul></li></ol><table><tr><td>x</td><td>y</td></tr></table>';
    expect(htmlToPlainText(html)).toBe(htmlToPlainText(html));
  });
});

describe('renderLeafPdf — list nesting reaches the page', () => {
  it('draws each nesting level further from the margin than the one above it', async () => {
    // The string-level test above passes whether or not the indent survives
    // rendering: wrapLine used to split the whole line on /\s+/, which discarded
    // the leading indent before the first word was measured. htmlToPlainText
    // could compute the hierarchy perfectly and the page would still come out
    // flat — so the assertion that matters is made against the rendered PDF.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await renderLeafPdf(
      '<ul><li>Inclusion<ul><li>Age 18-65<ul><li>documented</li></ul></li></ul></li>' +
        '<li>Exclusion</li></ul>',
      { title: 'Eligibility' },
    );
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
    const items = (await (await doc.getPage(1)).getTextContent()).items as any[];
    const xOf = (needle: string) =>
      items.find((i) => i.str.includes(needle))?.transform[4] as number;

    const inclusion = xOf('Inclusion');
    const age = xOf('Age 18-65');
    const documented = xOf('documented');
    const exclusion = xOf('Exclusion');

    expect(age).toBeGreaterThan(inclusion);
    expect(documented).toBeGreaterThan(age);
    // A top-level item returns to the margin — otherwise depth would be
    // monotonically increasing noise rather than structure.
    expect(exclusion).toBeCloseTo(inclusion, 1);
  }, 20_000);
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
