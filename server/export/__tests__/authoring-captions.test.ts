/**
 * Tables and figures reach a filed document as NUMBERED objects, and the
 * numbers stay right when the document changes.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * Captions existed as TEXT and rendered in both export branches. What did not
 * exist is numbering. In a CTD document a table and a figure are numbered
 * objects — "Table 14.2.1", "Figure 3" — and a reviewer navigates by those
 * numbers. A writer had to type the number into the caption by hand, which
 * makes it wrong the moment a table is inserted above it, with no way to find
 * the ones that went wrong except by reading the document.
 *
 * It was also the missing half of a chain: cross-references could point at
 * SECTIONS but not at "Table 3", because Table 3 was not an object anything
 * could point at.
 *
 * ── The one property that matters ───────────────────────────────────────────
 * THE NUMBER IS DERIVED FROM POSITION AND NEVER STORED. `inserting a table in
 * an earlier section renumbers every table after it, and every reference to
 * them, while no stored content changes at all` is the whole value of the
 * feature, and it is the assertion at the centre of this file: the same stored
 * strings, rendered with one section added ahead of them, come out with
 * different numbers.
 *
 * ── And the failure state ───────────────────────────────────────────────────
 * A reference to a deleted table must SAY so, in the filed document. It may
 * never print a plausible-looking wrong number, and it may never vanish. An
 * uncaptioned table must consume no ordinal — "Table 4" naming an object the
 * document never labels sends a reviewer looking for something that is not
 * there, which is the same refusal an unresolved citation makes when it
 * declines to take a reference-list number.
 */
import { describe, expect, it } from 'vitest';
import {
  sectionContentToBlocks,
  collectCaptionTargets,
  blockCaption,
} from '../authoring-section-content';
import { blocksToHtml } from '../authoring-blocks-to-html';
import { blocksToDocx, sectionBookmarkIds } from '../authoring-blocks-to-docx';
import {
  CROSS_REFERENCE_MISSING_TEXT,
  crossReferenceAnchorId,
  crossReferenceLookupFor,
} from '@shared/authoring/cross-references';
import { makeCaptionNumbering } from '@shared/authoring/captions';
import type { ResolvedImage } from '../authoring-images';

/* Caption ids as the editor issues them — UUIDs, and nothing a reader ever
   sees. Note what is NOT in any stored string below: an ordinal. */
const AE_TABLE = 'e2b0c6a1-4d55-4f70-9a11-77c3e0b41f92';
const PK_TABLE = '9f41d7c2-1b88-4a03-8e64-5d2a0c9b7e31';
const CHROMATOGRAM = '3c7a5e10-88ba-4c92-b0d6-2e1f4a760c58';
const DEMOG_TABLE = '5a1e9b44-6c27-4d18-93f2-0b8c7e5a1d63';

/** A section holding one captioned table. */
const STORED_SAFETY =
  `<table data-caption-id="${AE_TABLE}"><caption>Summary of adverse events</caption>` +
  `<tbody><tr><th>System organ class</th><th>n (%)</th></tr>` +
  `<tr><td>Headache</td><td>12 (4.1)</td></tr></tbody></table>`;

/** A section holding a table AND a figure, plus prose that references the
 *  table in the section above it. */
const STORED_PK =
  `<p>Exposure is summarised in ` +
  `<a data-xref="${PK_TABLE}" data-xref-display="code">Table 9</a>, and the assay in ` +
  `<a data-xref="${CHROMATOGRAM}" data-xref-display="code">Figure 4</a>.</p>` +
  `<table data-caption-id="${PK_TABLE}"><caption>Pharmacokinetic parameters</caption>` +
  `<tbody><tr><th>Cmax</th></tr><tr><td>412 ng/mL</td></tr></tbody></table>` +
  `<img data-caption-id="${CHROMATOGRAM}" src="/api/authoring/images/77" ` +
  `alt="Chromatogram of batch 21-004">`;

/** A section inserted ABOVE the two above. Nothing about their stored strings
 *  changes when it appears — only where they sit. */
const STORED_DEMOGRAPHICS =
  `<table data-caption-id="${DEMOG_TABLE}"><caption>Baseline demographics</caption>` +
  `<tbody><tr><th>Age</th></tr><tr><td>47.2</td></tr></tbody></table>`;

/** Bytes for the one figure, so it renders rather than filing a placeholder. */
const IMAGES = new Map<string, ResolvedImage>([
  [
    '/api/authoring/images/77',
    {
      buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
      mimeType: 'image/png',
      width: 300,
      height: 200,
    } as ResolvedImage,
  ],
]);

/** The sections of the document, as the export writes them. */
const SECTIONS = [
  { id: 'sec-demographics', code: '2.7.3.1', title: 'Demographics' },
  { id: 'sec-safety', code: '2.7.4.1', title: 'Adverse Events' },
  { id: 'sec-pk', code: '2.7.2.1', title: 'Pharmacokinetics' },
];

/**
 * Render a whole document exactly as the export route does: ONE pass over every
 * section to number the captions and build the cross-reference directory, then
 * a second pass to render with its own counter over the same blocks.
 */
function renderDocumentHtml(storedSections: string[]): string {
  const parsed = storedSections.map(sectionContentToBlocks);
  const directory = makeCaptionNumbering();
  const captionTargets = parsed.flatMap((blocks) =>
    collectCaptionTargets(blocks, directory),
  );
  const crossRefs = crossReferenceLookupFor([...SECTIONS, ...captionTargets]);
  const captions = makeCaptionNumbering();
  return parsed
    .map((blocks) => blocksToHtml(blocks, IMAGES, { crossRefs, captions }))
    .join('');
}

describe('caption parsing', () => {
  it('carries the object’s identity and its words, and no ordinal anywhere', () => {
    const blocks = sectionContentToBlocks(STORED_PK);
    const table = blocks.find((b) => b.kind === 'table')!;
    const figure = blocks.find((b) => b.kind === 'image')!;

    expect(table.captionId).toBe(PK_TABLE);
    expect(table.caption).toBe('Pharmacokinetic parameters');
    expect(figure.captionId).toBe(CHROMATOGRAM);
    expect(figure.alt).toBe('Chromatogram of batch 21-004');
    /* No ordinal anywhere on the objects themselves. The only "Table 9" in the
       parse is the cross-reference's cached text — a stale rendering neither
       renderer prints, and exactly what the stored form is designed to make
       harmless. */
    expect(JSON.stringify([table, figure])).not.toMatch(/Table \d|Figure \d/);
  });

  it('recognises a table by its caption and a figure by its alt text', () => {
    const blocks = sectionContentToBlocks(STORED_PK);
    expect(blocks.map(blockCaption).filter(Boolean)).toEqual([
      { kind: 'table', caption: 'Pharmacokinetic parameters', id: PK_TABLE },
      { kind: 'figure', caption: 'Chromatogram of batch 21-004', id: CHROMATOGRAM },
    ]);
  });

  it('does not make an UNCAPTIONED table a numbered object', () => {
    /* A layout table with no caption is not "Table 4": numbering it would name
       an object the filed document never labels, and a reviewer told to turn to
       Table 4 would find nothing. */
    const blocks = sectionContentToBlocks(
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    );
    expect(blocks.map(blockCaption)).toEqual([null]);
  });

  it('offers only the objects that can be pointed at as reference targets', () => {
    /* A caption with no id still NUMBERS — the ordinal is positional and needs
       no identity — it just cannot be referenced. Stored content written before
       captions had ids looks exactly like this. */
    const blocks = sectionContentToBlocks(
      '<table><caption>Anonymous table</caption><tbody><tr><td>a</td></tr></tbody></table>' +
        STORED_SAFETY,
    );
    const numbering = makeCaptionNumbering();
    const targets = collectCaptionTargets(blocks, numbering);

    expect(targets.map((t) => t.id)).toEqual([AE_TABLE]);
    // And it is Table 2, because the anonymous one above it took Table 1.
    expect(targets[0].code).toBe('Table 2');
  });
});

describe('HTML/PDF rendering', () => {
  it('prints the number in the caption position, tables and figures counted separately', () => {
    const html = renderDocumentHtml([STORED_SAFETY, STORED_PK]);

    expect(html).toContain('>Table 1. Summary of adverse events</caption>');
    expect(html).toContain('>Table 2. Pharmacokinetic parameters</caption>');
    // A document has a Table 1 AND a Figure 1 — one shared counter would have
    // made this chromatogram "Figure 3".
    expect(html).toContain('>Figure 1. Chromatogram of batch 21-004</figcaption>');
  });

  it('leaves the figure’s alt text as the author’s words, without the number', () => {
    /* alt is what a screen reader announces. A rendering of position does not
       belong in it. */
    const html = renderDocumentHtml([STORED_PK]);
    expect(html).toContain('alt="Chromatogram of batch 21-004"');
    expect(html).not.toContain('alt="Figure 1.');
  });

  it('makes the caption the anchor a reference to the object lands on', () => {
    const html = renderDocumentHtml([STORED_SAFETY]);
    expect(html).toContain(`<caption id="${crossReferenceAnchorId(AE_TABLE)}">`);
  });

  it('resolves a cross-reference to a TABLE through the same mechanism as a section', () => {
    const html = renderDocumentHtml([STORED_SAFETY, STORED_PK]);

    // The reference prints the table's CURRENT number, not the "Table 9" the
    // editor cached into the stored element's text.
    expect(html).toContain(
      `<a class="xref" href="#${crossReferenceAnchorId(PK_TABLE)}">Table 2</a>`,
    );
    expect(html).toContain(
      `<a class="xref" href="#${crossReferenceAnchorId(CHROMATOGRAM)}">Figure 1</a>`,
    );
    expect(html).not.toContain('>Table 9<');
    expect(html).not.toContain('>Figure 4<');
  });

  it('prints the caption words alongside the number for a code-title reference', () => {
    const stored =
      `<p>See <a data-xref="${AE_TABLE}" data-xref-display="code-title">x</a>.</p>` +
      STORED_SAFETY;
    expect(renderDocumentHtml([stored])).toContain(
      '>Table 1 Summary of adverse events</a>',
    );
  });

  it('INSERTING A TABLE EARLIER RENUMBERS THE REST, with the stored content untouched', () => {
    /* The assertion the whole feature exists for. The two sections' stored
       strings are byte-identical between the two renders — all that changed is
       that a section holding one table now sits above them. */
    const before = renderDocumentHtml([STORED_SAFETY, STORED_PK]);
    const after = renderDocumentHtml([STORED_DEMOGRAPHICS, STORED_SAFETY, STORED_PK]);

    expect(before).toContain('>Table 1. Summary of adverse events</caption>');
    expect(before).toContain('>Table 2. Pharmacokinetic parameters</caption>');
    expect(before).toContain('>Table 2</a>');

    expect(after).toContain('>Table 1. Baseline demographics</caption>');
    expect(after).toContain('>Table 2. Summary of adverse events</caption>');
    expect(after).toContain('>Table 3. Pharmacokinetic parameters</caption>');
    // …and the reference in the PK section moved with it, without that
    // section's stored string changing by one byte.
    expect(after).toContain('>Table 3</a>');
    expect(after).not.toContain('>Table 2</a>');
    // The figure sequence is untouched: no table was added to it.
    expect(after).toContain('>Figure 1. Chromatogram of batch 21-004</figcaption>');
    expect(after).toContain('>Figure 1</a>');
  });

  it('an uncaptioned table consumes no ordinal, so the numbers have no gap', () => {
    const html = renderDocumentHtml([
      '<table><tbody><tr><td>layout</td></tr></tbody></table>' + STORED_SAFETY,
    ]);
    expect(html).toContain('>Table 1. Summary of adverse events</caption>');
    expect(html).not.toContain('Table 2');
  });

  it('states a reference to a DELETED table, and never a plausible number', () => {
    /* The table was removed from the document; the reference to it was not.
       Its section's stored string is unchanged and still holds the id. */
    const html = renderDocumentHtml([
      `<p>As shown in <a data-xref="${AE_TABLE}" data-xref-display="code">Table 1</a>.</p>`,
    ]);

    expect(html).toContain('class="xref-missing"');
    expect(html).toContain(CROSS_REFERENCE_MISSING_TEXT);
    // Not a number, not the editor's cached text, and not silence.
    expect(html).not.toMatch(/Table \d/);
    expect(html.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(0);
  });

  it('still files the author’s caption when the caller supplied no numbering', () => {
    /* The words are authored content and are filed either way. What never
       happens is a number appearing from anywhere but the counter. */
    const html = blocksToHtml(sectionContentToBlocks(STORED_SAFETY), IMAGES);
    expect(html).toContain('<caption>Summary of adverse events</caption>');
    expect(html).not.toContain('Table 1');
  });

  it('does not number a figure that sits inside a table cell', () => {
    /* It is part of the table it sits in — the subject device's photograph in a
       comparison row — and has no caption position of its own to print a number
       in. Numbering it would shift every real figure after it. */
    const html = renderDocumentHtml([
      '<table><caption>Comparison</caption><tbody><tr><td>' +
        '<img src="/api/authoring/images/77" alt="Subject device"></td></tr></tbody></table>' +
        STORED_PK,
    ]);
    expect(html).toContain('>Figure 1. Chromatogram of batch 21-004</figcaption>');
    expect(html).toContain('<figcaption>Subject device</figcaption>');
  });
});

describe('DOCX rendering', () => {
  const loadDocx = async () => await import('docx');

  /** Pack the rendered elements into a real .docx and return its document.xml.
   *  Asserted against the FILE, not the object graph: what a reviewer opens is
   *  word/document.xml, and a bookmark that is well-formed in memory and absent
   *  from the package would pass a weaker check. */
  const xmlOf = async (element: unknown): Promise<string> => {
    const D = await loadDocx();
    const doc = new D.Document({ sections: [{ children: element as never }] });
    const buf = await D.Packer.toBuffer(doc);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    return await zip.file('word/document.xml')!.async('string');
  };

  const textOf = async (element: unknown): Promise<string> =>
    [...(await xmlOf(element)).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join('');

  /** Render a whole document the way the DOCX branch of the route does. */
  const renderDocumentDocx = async (storedSections: string[]) => {
    const D = await loadDocx();
    const parsed = storedSections.map(sectionContentToBlocks);
    const directory = makeCaptionNumbering();
    const targets = parsed.flatMap((b) => collectCaptionTargets(b, directory));
    const crossRefs = crossReferenceLookupFor([...SECTIONS, ...targets]);
    const captions = makeCaptionNumbering();
    return parsed.flatMap((blocks) =>
      blocksToDocx(D, blocks, IMAGES, { crossRefs, captions }),
    );
  };

  it('files the numbered caption, and bookmarks it so a REF field can cite it', async () => {
    const els = await renderDocumentDocx([STORED_SAFETY, STORED_PK]);
    const xml = await xmlOf(els);
    const ids = sectionBookmarkIds(AE_TABLE);

    expect(await textOf(els)).toContain('Table 1. Summary of adverse events');
    expect(xml).toContain('w:bookmarkStart');
    // Two bookmarks, side by side: one over "Table 1" and one over the words,
    // so a number-only reference cannot rewrite itself into a number-and-title
    // one the first time a reviewer presses F9.
    expect(xml).toContain(`w:name="${ids.code}"`);
    expect(xml).toContain(`w:name="${ids.title}"`);
  });

  it('emits a real Word REF field from a reference to a table', async () => {
    const els = await renderDocumentDocx([STORED_SAFETY, STORED_PK]);
    const xml = await xmlOf(els);

    expect(xml).toContain(`REF ${sectionBookmarkIds(PK_TABLE).code} \\h`);
    expect(xml).toContain(`REF ${sectionBookmarkIds(CHROMATOGRAM).code} \\h`);
    // The `code` form cites the code bookmark only — it must not acquire the
    // caption's words when fields are updated.
    expect(xml).not.toContain(`REF ${sectionBookmarkIds(PK_TABLE).title} \\h`);
    // What the page says.
    const text = await textOf(els);
    expect(text).toContain('Table 2');
    expect(text).toContain('Figure 1');
    // Never the number the editor cached into the stored element's text.
    expect(text).not.toContain('Table 9');
  });

  it('INSERTING A TABLE EARLIER RENUMBERS THE FILED WORD DOCUMENT', async () => {
    const before = await textOf(await renderDocumentDocx([STORED_SAFETY, STORED_PK]));
    const after = await textOf(
      await renderDocumentDocx([STORED_DEMOGRAPHICS, STORED_SAFETY, STORED_PK]),
    );

    expect(before).toContain('Table 1. Summary of adverse events');
    expect(before).toContain('Table 2. Pharmacokinetic parameters');
    expect(after).toContain('Table 2. Summary of adverse events');
    expect(after).toContain('Table 3. Pharmacokinetic parameters');
    expect(after).not.toContain('Table 1. Summary of adverse events');
  });

  it('states a reference to a deleted table, and emits no field for it', async () => {
    const D = await loadDocx();
    const els = blocksToDocx(
      D,
      sectionContentToBlocks(
        `<p>See <a data-xref="${AE_TABLE}" data-xref-display="code">Table 1</a>.</p>`,
      ),
      IMAGES,
      { crossRefs: crossReferenceLookupFor(SECTIONS), captions: makeCaptionNumbering() },
    );
    const xml = await xmlOf(els);

    expect(await textOf(els)).toContain(CROSS_REFERENCE_MISSING_TEXT);
    /* No REF field: a REF to a bookmark that was never written renders in Word
       as that program's own error string, which is not a sentence a reviewer of
       a filed submission should ever be shown. */
    expect(xml).not.toContain('w:fldSimple');
    expect(await textOf(els)).not.toMatch(/Table \d/);
  });
});

describe('the two filed formats agree', () => {
  it('numbers the same object the same way in DOCX and in HTML', async () => {
    const D = await import('docx');
    const { default: JSZip } = await import('jszip');
    const stored = [STORED_DEMOGRAPHICS, STORED_SAFETY, STORED_PK];

    const html = renderDocumentHtml(stored);

    const parsed = stored.map(sectionContentToBlocks);
    const directory = makeCaptionNumbering();
    const targets = parsed.flatMap((b) => collectCaptionTargets(b, directory));
    const crossRefs = crossReferenceLookupFor([...SECTIONS, ...targets]);
    const captions = makeCaptionNumbering();
    const children = parsed.flatMap((blocks) =>
      blocksToDocx(D, blocks, IMAGES, { crossRefs, captions }),
    );
    const xml = await (
      await JSZip.loadAsync(
        await D.Packer.toBuffer(new D.Document({ sections: [{ children: children as never }] })),
      )
    )
      .file('word/document.xml')!
      .async('string');
    const docxText = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const htmlText = html.replace(/<[^>]+>/g, '');

    for (const text of [
      'Table 1. Baseline demographics',
      'Table 2. Summary of adverse events',
      'Table 3. Pharmacokinetic parameters',
      'Figure 1. Chromatogram of batch 21-004',
    ]) {
      expect(htmlText, `HTML lost ${text}`).toContain(text);
      expect(docxText, `DOCX lost ${text}`).toContain(text);
    }
    /* And the reference to the PK table says the same thing in both — two
       filed formats of one frozen document must not disagree about which
       table is Table 3. */
    expect(htmlText).toContain('Exposure is summarised in Table 3');
    expect(docxText).toContain('Table 3');
  });
});
