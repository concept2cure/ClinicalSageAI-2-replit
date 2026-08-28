/**
 * Cross-references survive to a filed document, and stay right when the
 * document is renumbered.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * "See Section 2.7.4.2" was plain, unmanaged text. Renumber or move 2.7.4.2 and
 * every reference to it is silently wrong, in a document a government reviewer
 * reads as the deliverable. Finding them is eye work over hundreds of pages,
 * which is why cross-referencing is one of the most expensive tasks a medical
 * writer does.
 *
 * ── The one property that matters ───────────────────────────────────────────
 * A reference stores THE TARGET'S ID, never its printed number. `renumbering
 * the target changes every rendering of the reference while the referring
 * section's stored content is not touched at all` is the whole value of the
 * feature, and it is the assertion at the centre of this file: the same stored
 * string is rendered against two directories and must come out differently.
 *
 * ── And the failure state ───────────────────────────────────────────────────
 * A reference whose target is gone must SAY so, in the editor and in the filed
 * document. It may never render as a plausible-looking wrong number, and it may
 * never quietly vanish from a filing. Both renderers are held to that here.
 */
import { describe, expect, it } from 'vitest';
import { sectionContentToBlocks, blockRuns } from '../authoring-section-content';
import { blocksToHtml } from '../authoring-blocks-to-html';
import { blocksToDocx, sectionBookmarkIds, sectionHeadingParagraph } from '../authoring-blocks-to-docx';
import {
  CROSS_REFERENCE_MISSING_TEXT,
  crossReferenceAnchorId,
  crossReferenceLookupFor,
} from '@shared/authoring/cross-references';

/* Two section ids. UUID-shaped, as the store issues them. */
const EFFICACY = '7b2c1d84-9a35-4f10-8c2e-1f4a6b0d55e1';
const SAFETY = '1a9e4c77-2b60-4d31-9f88-33c0ae512d40';

/** The document as it stands. */
const ORIGINAL = crossReferenceLookupFor([
  { id: EFFICACY, code: '2.7.4.2', title: 'Efficacy Summary' },
  { id: SAFETY, code: '2.7.4.3', title: 'Safety Summary' },
]);

/** The SAME sections after a section was inserted above them and everything
 *  below renumbered — the routine event this feature exists for. Nothing about
 *  the stored content below changes; only this directory does. */
const RENUMBERED = crossReferenceLookupFor([
  { id: EFFICACY, code: '2.7.5.2', title: 'Efficacy Summary' },
  { id: SAFETY, code: '2.7.5.3', title: 'Safety Summary' },
]);

/** The stored section content. Note what it does NOT contain: the target's
 *  number as data. The digits inside the element are the editor's cache. */
const STORED =
  `<p>Exposure–response is analysed in ` +
  `<a data-xref="${EFFICACY}" data-xref-display="code-title">2.7.4.2 Efficacy Summary</a>` +
  `, and the adverse-event tabulations in ` +
  `<a data-xref="${SAFETY}" data-xref-display="code">2.7.4.3</a>.</p>`;

describe('cross-reference parsing', () => {
  it('keeps the target id off the run, not the printed number', () => {
    const runs = sectionContentToBlocks(STORED).flatMap(blockRuns);
    const refs = runs.filter((r) => r.crossRefTarget);

    expect(refs.map((r) => r.crossRefTarget)).toEqual([EFFICACY, SAFETY]);
    expect(refs.map((r) => r.crossRefDisplay)).toEqual(['code-title', 'code']);
  });

  it('leaves an ordinary anchor alone — a link is not a cross-reference', () => {
    const runs = sectionContentToBlocks(
      '<p>See <a href="https://example.org/guidance">the guidance</a>.</p>',
    ).flatMap(blockRuns);
    expect(runs.some((r) => r.crossRefTarget)).toBe(false);
    expect(runs.map((r) => r.text).join('')).toContain('the guidance');
  });

  it('does not merge two references to DIFFERENT sections into one run', () => {
    /* Adjacent runs merge when their formatting matches. Without the target in
       that comparison the second reference would be silently discarded and a
       filed document would carry one reference where the author wrote two. */
    const runs = sectionContentToBlocks(
      `<p><a data-xref="${EFFICACY}">a</a><a data-xref="${SAFETY}">b</a></p>`,
    ).flatMap(blockRuns);
    expect(runs.filter((r) => r.crossRefTarget).map((r) => r.crossRefTarget)).toEqual([
      EFFICACY,
      SAFETY,
    ]);
  });

  it('keeps a block whose only content is a reference', () => {
    /* The reference's text is resolved at render time, so the block's own text
       can legitimately be empty. The whitespace filter used to delete such a
       block, which would drop the reference out of the filing in silence. */
    const blocks = sectionContentToBlocks(`<p><a data-xref="${EFFICACY}"></a></p>`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].runs.some((r) => r.crossRefTarget === EFFICACY)).toBe(true);
  });
});

describe('HTML/PDF rendering', () => {
  it('prints the target’s CURRENT code and title, and links to it', () => {
    const html = blocksToHtml(sectionContentToBlocks(STORED), undefined, {
      crossRefs: ORIGINAL,
    });
    expect(html).toContain('>2.7.4.2 Efficacy Summary</a>');
    expect(html).toContain('>2.7.4.3</a>');
    expect(html).toContain(`href="#${crossReferenceAnchorId(EFFICACY)}"`);
    expect(html).toContain('class="xref"');
  });

  it('RENUMBERING THE TARGET CHANGES THE RENDERED TEXT, with the stored content untouched', () => {
    /* The assertion the whole feature exists for. One stored string, two
       directories, two renderings — and the string is byte-identical, because
       what it holds is an identity and not a number. */
    const before = blocksToHtml(sectionContentToBlocks(STORED), undefined, {
      crossRefs: ORIGINAL,
    });
    const after = blocksToHtml(sectionContentToBlocks(STORED), undefined, {
      crossRefs: RENUMBERED,
    });

    expect(before).toContain('>2.7.4.2 Efficacy Summary</a>');
    expect(before).toContain('>2.7.4.3</a>');

    expect(after).toContain('>2.7.5.2 Efficacy Summary</a>');
    expect(after).toContain('>2.7.5.3</a>');
    // The old numbers are gone from the rendering entirely — not merely
    // accompanied by the new ones.
    expect(after).not.toContain('2.7.4.2');
    expect(after).not.toContain('2.7.4.3');
  });

  it('never prints the editor’s cached number, even when it is stale', () => {
    /* The stored element's text says 9.9.9. The renderer resolves the target
       and prints what the section is called now. A renderer that fell back to
       the cache would reproduce exactly the bug being fixed. */
    const stale = `<p>See <a data-xref="${EFFICACY}" data-xref-display="code">9.9.9</a>.</p>`;
    const html = blocksToHtml(sectionContentToBlocks(stale), undefined, {
      crossRefs: ORIGINAL,
    });
    expect(html).not.toContain('9.9.9');
    expect(html).toContain('>2.7.4.2</a>');
  });

  it('states a dangling reference rather than printing a number or nothing', () => {
    const dangling = `<p>See <a data-xref="deleted-section-id">2.7.4.9</a>.</p>`;
    const html = blocksToHtml(sectionContentToBlocks(dangling), undefined, {
      crossRefs: ORIGINAL,
    });
    expect(html).toContain('class="xref-missing"');
    expect(html).toContain(CROSS_REFERENCE_MISSING_TEXT);
    // Not the cached number, and not silence.
    expect(html).not.toContain('2.7.4.9');
    expect(html.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(0);
  });

  it('resolves a reference written inside a table cell', () => {
    /* Regulatory tables cite other sections constantly ("see 3.2.P.5.1"). The
       cell path is a separate recursion and had to be threaded too. */
    const html = blocksToHtml(
      sectionContentToBlocks(
        `<table><tbody><tr><td>Method<a data-xref="${SAFETY}" data-xref-display="code">x</a></td></tr></tbody></table>`,
      ),
      undefined,
      { crossRefs: RENUMBERED },
    );
    expect(html).toContain('>2.7.5.3</a>');
  });
});

describe('DOCX rendering', () => {
  /** The real `docx` namespace — the renderer takes it as a parameter. */
  const loadDocx = async () => await import('docx');

  /** Pack the rendered elements into a real .docx and return its document.xml. */
  const xmlOf = async (element: unknown): Promise<string> => {
    const D = await loadDocx();
    const doc = new D.Document({ sections: [{ children: element as never }] });
    const buf = await D.Packer.toBuffer(doc);
    /* Assert against the FILE, not against the renderer's object graph: what a
       reviewer opens is word/document.xml, and a REF field that is well-formed
       in memory and absent from the package would pass a weaker check. */
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    return await zip.file('word/document.xml')!.async('string');
  };

  /** The text a reader sees, in order — every `w:t` concatenated.
   *
   *  Needed alongside the raw XML because a number-and-title reference is TWO
   *  fields with a separator run between them, so the phrase a reviewer reads
   *  is never one contiguous string in the markup. Asserting on the raw XML
   *  alone would test the shape of the file instead of what it says. */
  const textOf = async (element: unknown): Promise<string> =>
    [...(await xmlOf(element)).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join('');

  it('emits a real Word REF field pointing at the target’s bookmark', async () => {
    const D = await loadDocx();
    const els = blocksToDocx(D, sectionContentToBlocks(STORED), undefined, {
      crossRefs: ORIGINAL,
    });
    const xml = await xmlOf(els);

    const ids = sectionBookmarkIds(EFFICACY);
    // What the page says, once the fields are laid end to end.
    expect(await textOf(els)).toContain('2.7.4.2 Efficacy Summary');
    // Real REF fields with \h — Word's own cross-reference, clickable and
    // re-resolvable, not a string that merely looks like one. The number-and-
    // title form is two fields, one per bookmark, so each prints exactly the
    // text this export resolved even after a reviewer updates fields.
    expect(xml).toContain('w:fldSimple');
    expect(xml).toContain(`REF ${ids.code} \\h`);
    expect(xml).toContain(`REF ${ids.title} \\h`);
    // The `code` reference cites the code bookmark ONLY — it must not acquire
    // the target's title the first time somebody presses F9.
    expect(xml).toContain(`REF ${sectionBookmarkIds(SAFETY).code} \\h`);
    expect(xml).not.toContain(`REF ${sectionBookmarkIds(SAFETY).title} \\h`);

  });

  it('writes the bookmark the field cites onto the section heading', async () => {
    const D = await loadDocx();
    const heading = sectionHeadingParagraph(D, {
      id: EFFICACY,
      code: '2.7.4.2',
      title: 'Efficacy Summary',
    });
    const xml = await xmlOf([heading]);
    const ids = sectionBookmarkIds(EFFICACY);

    expect(xml).toContain('w:bookmarkStart');
    expect(xml).toContain(`w:name="${ids.code}"`);
    expect(xml).toContain(`w:name="${ids.title}"`);
    // Both halves of the heading still reach the file.
    expect(xml).toContain('2.7.4.2');
    expect(xml).toContain('Efficacy Summary');
  });

  it('RENUMBERING THE TARGET CHANGES THE WORD TEXT, with the stored content untouched', async () => {
    const D = await loadDocx();
    const before = await textOf(
      blocksToDocx(D, sectionContentToBlocks(STORED), undefined, { crossRefs: ORIGINAL }),
    );
    const after = await textOf(
      blocksToDocx(D, sectionContentToBlocks(STORED), undefined, { crossRefs: RENUMBERED }),
    );

    expect(before).toContain('2.7.4.2 Efficacy Summary');
    expect(before).toContain('2.7.4.3');
    expect(after).toContain('2.7.5.2 Efficacy Summary');
    expect(after).toContain('2.7.5.3');
    expect(after).not.toContain('2.7.4.2');
    expect(after).not.toContain('2.7.4.3');
  });

  it('states a dangling reference in the filed document, and emits no field for it', async () => {
    const D = await loadDocx();
    const els = blocksToDocx(
      D,
      sectionContentToBlocks(`<p>See <a data-xref="deleted-section-id">2.7.4.9</a>.</p>`),
      undefined,
      { crossRefs: ORIGINAL },
    );
    const xml = await xmlOf(els);

    expect(await textOf(els)).toContain(CROSS_REFERENCE_MISSING_TEXT);
    expect(xml).not.toContain('2.7.4.9');
    /* No REF field: a REF to a bookmark that was never written renders in Word
       as its own error string, which is not a sentence a reviewer of a filed
       submission should ever be shown. */
    expect(xml).not.toContain('w:fldSimple');
  });

  it('does not silently drop the reference when no directory is supplied', async () => {
    const D = await loadDocx();
    const els = blocksToDocx(D, sectionContentToBlocks(STORED));
    const text = await textOf(els);
    // Unresolvable is stated, twice — once per reference. Never a number.
    expect(text.split(CROSS_REFERENCE_MISSING_TEXT).length - 1).toBe(2);
    expect(text).not.toContain('2.7.4.2');
    expect(await xmlOf(els)).not.toContain('w:fldSimple');
  });
});

describe('the two filed formats agree', () => {
  it('renders the same resolved text in DOCX and in HTML', async () => {
    const D = await import('docx');
    const { default: JSZip } = await import('jszip');
    const blocks = sectionContentToBlocks(STORED);

    const html = blocksToHtml(blocks, undefined, { crossRefs: RENUMBERED });
    const doc = new D.Document({
      sections: [{ children: blocksToDocx(D, blocks, undefined, { crossRefs: RENUMBERED }) as never }],
    });
    const xml = await (await JSZip.loadAsync(await D.Packer.toBuffer(doc)))
      .file('word/document.xml')!
      .async('string');
    const docxText = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const htmlText = html.replace(/<[^>]+>/g, '');

    for (const text of ['2.7.5.2 Efficacy Summary', '2.7.5.3']) {
      expect(htmlText, `HTML lost ${text}`).toContain(text);
      expect(docxText, `DOCX lost ${text}`).toContain(text);
    }
    /* Neither format may carry the number the section used to have — the two
       filed formats must not disagree about what a reference says. */
    expect(htmlText).not.toContain('2.7.4.2');
    expect(docxText).not.toContain('2.7.4.2');
  });
});
