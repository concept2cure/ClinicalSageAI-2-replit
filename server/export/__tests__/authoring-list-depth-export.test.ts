/**
 * A nested procedure keeps its step numbers — and a table of figures survives.
 *
 * ── Defect 1: the filed document said something different ────────────────────
 * The parser tracked only the innermost list TYPE (`listOrdered`), never how
 * deep it sat, so a two-rank numbered procedure came out as a flat sequence of
 * top-level items. Neither renderer restarts a rank it was never told about,
 * so the export numbered them straight through. This procedure:
 *
 *     1. Prepare the sample
 *        a. Weigh 5.0 mg
 *        b. Dissolve in 10 mL diluent
 *     2. Inject 20 µL
 *
 * filed as 1, 2, 3, 4. The author's step 2 is "Inject 20 µL"; the filed step 2
 * is "Weigh 5.0 mg". A deviation report, a validation protocol or an IFU that
 * cites step 2 cites a DIFFERENT INSTRUCTION in the copy the agency reads than
 * in the copy the author wrote.
 *
 * Nothing could see it. Every character survives, so the round-trip fidelity
 * gate — which compares text — passed it, and the revision ledger hash-chains
 * a section whose content is correct: the corruption is introduced downstream,
 * at export, after the seal. This is the only defect on the export list that
 * turns filed content into different, plausible, wrong content rather than
 * losing presentation or failing loudly.
 *
 * ── Defect 2: an entire table deleted, silently ──────────────────────────────
 * `<img>` is a void element, so the cell walker visited zero children and a
 * figure in a cell left no trace. A table whose cells hold only figures — the
 * subject and predicate photographs of a substantial-equivalence comparison —
 * then had no text anywhere, and the parser's emptiness filter, which tested a
 * table by running `blockRuns` over its cells, DELETED THE WHOLE TABLE. No
 * placeholder, no warning: the 510(k) files without the comparison it turns on.
 *
 * ── Why the assertions are over the emitted bytes ────────────────────────────
 * The block model is an intermediate. A renderer can hold the right depth and
 * still emit `w:ilvl 0` for every item, and a browser defaults every `ol` rank
 * to decimal whatever the nesting says. So the DOCX assertions read
 * `word/document.xml` out of the real .docx, and the HTML assertions read the
 * emitted markup and the print stylesheet that numbers it.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import * as docx from 'docx';

import { sectionContentToBlocks, MAX_LIST_DEPTH } from '../authoring-section-content';
import { blocksToDocx, orderedListNumbering } from '../authoring-blocks-to-docx';
import { blocksToHtml, PRINT_STYLES } from '../authoring-blocks-to-html';
import type { ResolvedImage } from '../authoring-images';

/** 1×1 transparent PNG — a real file. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function documentXml(
  html: string,
  images?: Map<string, ResolvedImage>,
): Promise<string> {
  const doc = new docx.Document({
    numbering: orderedListNumbering(docx),
    sections: [{ children: blocksToDocx(docx, sectionContentToBlocks(html), images) as never[] }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  return new AdmZip(buf).getEntry('word/document.xml')!.getData().toString('utf8');
}

/** A test method as a writer authors one: steps with sub-steps. */
const PROCEDURE = `<ol>
  <li>Prepare the sample.
    <ol>
      <li>Weigh 5.0 mg of drug substance.</li>
      <li>Dissolve in 10 mL of diluent.</li>
    </ol>
  </li>
  <li>Inject 20 µL onto the column.</li>
</ol>`;

describe('a nested procedure keeps its ranks through the parse', () => {
  it('records the depth of every item instead of flattening them', () => {
    const items = sectionContentToBlocks(PROCEDURE);
    expect(items.map((b) => b.kind)).toEqual(Array(4).fill('list-item'));
    /* Was [0,0,0,0] — every sub-step promoted to a top-level step. */
    expect(items.map((b) => b.depth ?? 0)).toEqual([0, 1, 1, 0]);
    expect(items.every((b) => b.ordered)).toBe(true);
  });

  it('keeps the kind of each rank, so notes under a step stay bulleted', () => {
    const items = sectionContentToBlocks(
      '<ol><li>Step<ul><li>note</li></ul></li><li>Next</li></ol>',
    );
    expect(items.map((b) => [b.ordered ?? false, b.depth ?? 0])).toEqual([
      [true, 0],
      [false, 1],
      [true, 0],
    ]);
  });

  it('leaves a flat list exactly as it was — the fix adds nothing to it', () => {
    const items = sectionContentToBlocks('<ol><li>one</li><li>two</li></ol>');
    expect(items.map((b) => b.depth)).toEqual([undefined, undefined]);
  });

  it('treats an li with no list around it as a top-level item, not a drop', () => {
    const items = sectionContentToBlocks('<li>orphaned by malformed markup</li>');
    expect(items).toHaveLength(1);
    expect(items[0].depth ?? 0).toBe(0);
    expect(items[0].runs.map((r) => r.text).join('')).toContain('orphaned');
  });
});

describe('the DOCX files the sub-steps at their own rank', () => {
  it('emits w:ilvl 1 for the sub-steps and 0 for the steps', async () => {
    const xml = await documentXml(PROCEDURE);
    /* Read the levels in document order and pair them with their text, so a
       renderer that emits the right multiset in the wrong order still fails. */
    const paragraphs = xml.split(/<w:p[ >]/).slice(1);
    const levels = paragraphs
      .filter((p) => p.includes('<w:numPr>'))
      .map((p) => ({
        level: Number(/<w:ilvl w:val="(\d+)"/.exec(p)?.[1] ?? -1),
        text: [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''),
      }));
    expect(levels).toHaveLength(4);
    /* Was [0,0,0,0]: Word numbered the two sub-steps as steps 2 and 3, and
       "Inject 20 µL" — the author's step 2 — filed as step 4. */
    expect(levels.map((l) => l.level)).toEqual([0, 1, 1, 0]);
    expect(levels[1].text).toContain('Weigh 5.0 mg');
    expect(levels[3].text).toContain('Inject 20 µL');
  });

  it('declares a numbering format for every rank it can emit', async () => {
    const doc = new docx.Document({
      numbering: orderedListNumbering(docx),
      sections: [{ children: blocksToDocx(docx, sectionContentToBlocks(PROCEDURE)) as never[] }],
    });
    const buf = await docx.Packer.toBuffer(doc);
    const numbering = new AdmZip(buf).getEntry('word/numbering.xml')!.getData().toString('utf8');

    /* Read OUR definition, not the file's. `docx` always writes its own
       default bullet abstract numbering, which declares nine levels — so
       scanning the whole numbering.xml for `w:ilvl` finds 0-8 no matter what
       this module configures. Written that way first, this assertion passed
       with the definition cut back to two levels: it was reading the
       library's list. (Verified by injecting exactly that.) The ordered
       definition is the abstract block whose first rank is decimal. */
    const ordered = [...numbering.matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)]
      .map((m) => [...m[0].matchAll(/<w:lvl w:ilvl="(\d+)"[\s\S]*?<w:numFmt w:val="([a-zA-Z]+)"/g)]
        .map((l) => ({ level: Number(l[1]), format: l[2] })))
      .find((levels) => levels[0]?.format === 'decimal');
    expect(ordered, 'no ordered numbering definition reached the .docx').toBeTruthy();

    /* Only levels 0 and 1 were declared. Word renders an item referencing an
       undeclared level with NO NUMBER AT ALL, so the third rank of a nested
       procedure would have lost its step identifiers outright — the defect
       waiting one layer below the one being fixed. */
    for (let lvl = 0; lvl <= MAX_LIST_DEPTH; lvl++) {
      expect(
        ordered!.map((l) => l.level),
        `no numbering format declared for level ${lvl}`,
      ).toContain(lvl);
    }
    /* And the formats are the ones PRINT_STYLES mirrors, so the two renditions
       of the same frozen section cannot state different step identifiers. */
    expect(ordered!.slice(0, 3).map((l) => l.format)).toEqual([
      'decimal',
      'lowerLetter',
      'lowerRoman',
    ]);
  });

  it('clamps a depth beyond the declared ranks rather than emitting an unnumbered step', async () => {
    const deep = `<ol>${'<li>x<ol>'.repeat(9)}<li>too deep</li>${'</ol></li>'.repeat(9)}</ol>`;
    const xml = await documentXml(deep);
    const levels = [...xml.matchAll(/<w:ilvl w:val="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...levels)).toBeLessThanOrEqual(MAX_LIST_DEPTH);
    expect(xml).toContain('too deep');
  });
});

describe('the PDF branch nests the same ranks, and numbers them the same way', () => {
  it('opens the sub-list inside the step it belongs to', () => {
    const html = blocksToHtml(sectionContentToBlocks(PROCEDURE));
    /* Was one flat <ol> of four siblings, which a browser numbers 1-2-3-4. */
    expect(html).toBe(
      '<ol><li>Prepare the sample.' +
        '<ol><li>Weigh 5.0 mg of drug substance.</li><li>Dissolve in 10 mL of diluent.</li></ol>' +
        '</li><li>Inject 20 µL onto the column.</li></ol>',
    );
  });

  it('closes every list and item it opens, at any depth', () => {
    const html = blocksToHtml(sectionContentToBlocks(PROCEDURE));
    for (const tag of ['ol', 'ul', 'li']) {
      const open = html.match(new RegExp(`<${tag}[ >]`, 'g'))?.length ?? 0;
      const close = html.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0;
      expect(close, `unbalanced <${tag}> in the print HTML`).toBe(open);
    }
  });

  it('numbers each rank as the DOCX does, so the two renditions agree', () => {
    /* The DOCX numbering definition is decimal / lowerLetter / lowerRoman. A
       browser defaults EVERY ol rank to decimal, so without these rules the
       PDF and the DOCX of the same frozen section state different step
       identifiers — "step 2.a" in one is "step 2.2" in the other.

       Read as an exact selector→format map rather than with a loose regex.
       Written as `/\bol ol\s*\{[^}]*lower-alpha/` first, this passed with the
       `ol ol` rule deleted: that pattern also matches the last two selectors
       of `ol ol ol ol ol {`. (Verified by deleting the rule and watching it
       stay green.) */
    const rules = new Map(
      [...PRINT_STYLES.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => [
        // The selector capture runs back to the previous `}`, so it carries
        // the preceding comment and newlines with it; the selector is the
        // last line of that.
        (sel.trim().split('\n').pop() ?? '').trim().replace(/\s+/g, ' '),
        body.trim(),
      ]),
    );
    expect(rules.get('ol')).toContain('decimal');
    expect(rules.get('ol ol')).toContain('lower-alpha');
    expect(rules.get('ol ol ol')).toContain('lower-roman');
  });

  it('does not wrap a flat list in anything new', () => {
    expect(blocksToHtml(sectionContentToBlocks('<ol><li>one</li><li>two</li></ol>'))).toBe(
      '<ol><li>one</li><li>two</li></ol>',
    );
  });

  it('starts a new list when the kind changes at the same rank', () => {
    expect(blocksToHtml(sectionContentToBlocks('<ol><li>a</li></ol><ul><li>b</li></ul>'))).toBe(
      '<ol><li>a</li></ol><ul><li>b</li></ul>',
    );
  });
});

/* ── The comparison table that used to disappear ─────────────────────────── */

const SUBJECT = '/api/authoring/images/subject_1';
const PREDICATE = '/api/authoring/images/predicate_2';
const FIGURE_TABLE =
  '<table><caption>Table 5-2. Subject and predicate device</caption><tbody>' +
  '<tr><th>Subject device</th><th>Predicate K18XXXX</th></tr>' +
  `<tr><td><img src="${SUBJECT}" alt="Subject device"></td>` +
  `<td><img src="${PREDICATE}" alt="Predicate device"></td></tr>` +
  '</tbody></table>';

const bothResolved = (): Map<string, ResolvedImage> =>
  new Map([
    [SUBJECT, { buffer: PNG_1X1, mimeType: 'image/png', width: 1, height: 1 }],
    [PREDICATE, { buffer: PNG_1X1, mimeType: 'image/png', width: 1, height: 1 }],
  ]);

describe('a table whose cells hold figures is not deleted', () => {
  it('parses to a table that keeps both figures (the old failure returned nothing)', () => {
    const blocks = sectionContentToBlocks(FIGURE_TABLE);
    /* Was []. The whole comparison — headers, caption and both figures — was
       removed from the export by the emptiness filter. */
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
    expect(blocks[0].rows).toHaveLength(2);
    expect(blocks[0].rows![1].map((c) => c.images?.[0]?.src)).toEqual([SUBJECT, PREDICATE]);
    expect(blocks[0].caption).toContain('Subject and predicate');
  });

  it('files a real w:tbl with both images embedded as media parts', async () => {
    const doc = new docx.Document({
      numbering: orderedListNumbering(docx),
      sections: [
        {
          children: blocksToDocx(
            docx,
            sectionContentToBlocks(FIGURE_TABLE),
            bothResolved(),
          ) as never[],
        },
      ],
    });
    const buf = await docx.Packer.toBuffer(doc);
    const zip = new AdmZip(buf);
    const xml = zip.getEntry('word/document.xml')!.getData().toString('utf8');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Subject device');
    /* Two drawings inside the table, and two real media parts behind them. */
    expect([...xml.matchAll(/<w:drawing>/g)]).toHaveLength(2);
    expect(zip.getEntries().filter((e) => e.entryName.startsWith('word/media/'))).toHaveLength(2);
  });

  it('states an unresolvable figure in the cell rather than filing an empty one', async () => {
    const xml = await documentXml(FIGURE_TABLE, new Map());
    expect(xml).toContain('<w:tbl>');
    expect(xml).toMatch(/Figure not exported: Subject device/);
    expect(xml).toMatch(/Figure not exported: Predicate device/);
  });

  it('renders the figures into the PDF branch cells too', () => {
    const html = blocksToHtml(sectionContentToBlocks(FIGURE_TABLE), bothResolved());
    expect(html).toContain('<table>');
    expect([...html.matchAll(/<td><figure><img src="data:image\/png;base64,/g)]).toHaveLength(2);
    expect(html).toContain('alt="Subject device"');
  });

  it('survives with NO text anywhere — two photographs side by side', () => {
    /* The case the emptiness filter actually deleted, and the reason the
       fixture above is not enough on its own: that one has a header row, so
       once the cell walker keeps the figures the table has text and passes
       the filter either way. A writer laying two device photographs beside
       each other in a bare two-cell table has no text at all, `blockRuns`
       returns nothing, and the WHOLE TABLE was filtered out of the export.
       (Verified by removing the table clause from the filter and watching
       only this one turn red.) */
    const bare =
      `<table><tr><td><img src="${SUBJECT}" alt=""></td>` +
      `<td><img src="${PREDICATE}" alt=""></td></tr></table>`;
    const blocks = sectionContentToBlocks(bare);
    expect(blocks, 'a table with no text was deleted from the export').toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
    expect(blocks[0].rows![0].map((c) => c.images?.[0]?.src)).toEqual([SUBJECT, PREDICATE]);
    expect(blocksToHtml(blocks, bothResolved())).toContain('<table>');
  });

  it('keeps a genuinely empty table out — emptiness is having no cells', () => {
    expect(sectionContentToBlocks('<table><tbody></tbody></table>')).toEqual([]);
  });

  it('leaves an all-text table exactly as it was', () => {
    const blocks = sectionContentToBlocks(
      '<table><tr><td>Accuracy</td><td>&#177;10%</td></tr></table>',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].rows![0].map((c) => c.runs.map((r) => r.text).join(''))).toEqual([
      'Accuracy',
      '±10%',
    ]);
    expect(blocks[0].rows![0].every((c) => c.images === undefined)).toBe(true);
  });
});
