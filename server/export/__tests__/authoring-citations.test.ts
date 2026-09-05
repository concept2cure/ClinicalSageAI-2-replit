/**
 * Citations reach a filed document as numbered markers and a reference list,
 * and the numbers stay right when the document changes.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * A CTD module is an argument built on sources, and the editor had no citation
 * of any kind. The ribbon's "Cite" control sent the selected sentence to the
 * assistant pane: nothing was created, nothing stored, nothing numbered, and no
 * reference list existed anywhere in the export. A filed document that makes
 * claims a reviewer cannot trace to a source is the argument without its
 * foundations.
 *
 * ── The one property that matters ───────────────────────────────────────────
 * A citation stores THE SOURCE'S ID, never the number printed at the claim.
 * "[3]" is a rendering of where that source currently sits in this document's
 * reference list. `inserting a citation earlier in the document renumbers
 * everything after it, while no stored content changes at all` is the whole
 * value of the feature, and it is the assertion at the centre of this file: the
 * same stored strings, rendered with one paragraph added ahead of them, come
 * out with different numbers.
 *
 * ── And the failure state ───────────────────────────────────────────────────
 * A citation whose source is unknown must SAY so, in the editor and in the
 * filed document. It may never render as a plausible-looking wrong number, it
 * may never quietly vanish, and it must take no number and no reference-list
 * entry — a marker reading "[4]" above a list with three entries is worse than
 * the broken citation it was trying to describe. Both renderers are held to
 * that here.
 */
import { describe, expect, it } from 'vitest';
import {
  sectionContentToBlocks,
  blockRuns,
  collectCitedSourceIds,
} from '../authoring-section-content';
import { blocksToHtml, renderReferenceListHtml } from '../authoring-blocks-to-html';
import { blocksToDocx, referenceListParagraphs } from '../authoring-blocks-to-docx';
import {
  CITATION_MISSING_TEXT,
  citationAnchorId,
  citationBookmarkId,
  citationLookupFor,
  makeCitationRegistry,
} from '@shared/authoring/citations';

/* Source ids as the canonical source registry issues them: cre_evidence_sources
   serial ids, carried as text. */
const CSR = '41';
const PROTOCOL = '77';
const PUBLICATION = '128';

/** The sources this document can see. */
const LIBRARY = citationLookupFor([
  {
    id: CSR,
    title: 'A Phase 3 Study of CTP-201 in Adults with Moderate Asthma',
    sponsor: 'Concept Therapeutics',
    sourceType: 'csr',
    date: '2024-03-11',
    identifier: 'NCT04991234',
  },
  {
    id: PROTOCOL,
    title: 'CTP-201-301 Clinical Study Protocol, Amendment 3',
    sponsor: 'Concept Therapeutics',
    sourceType: 'protocol',
    date: '2022-08-01',
  },
  {
    id: PUBLICATION,
    title: 'Long-term safety of anti-IL-5 therapy',
    sourceType: 'publication',
    date: '2019-06-14',
    identifier: 'doi:10.1000/example',
  },
]);

/** Stored section content. Note what it does NOT contain: any number. The words
 *  inside each element are the editor's cache of the source's NAME. */
const STORED_EFFICACY =
  `<p>The primary endpoint was met ` +
  `<a data-cite="${CSR}" data-cite-locator="p. 142, Table 14.2.1">A Phase 3 Study of CTP-201</a>` +
  `, under the pre-specified analysis ` +
  `<a data-cite="${PROTOCOL}">CTP-201-301 Clinical Study Protocol</a>.</p>`;

const STORED_SAFETY =
  `<p>No new safety signal was identified ` +
  `<a data-cite="${CSR}">A Phase 3 Study of CTP-201</a>, consistent with the class ` +
  `<a data-cite="${PUBLICATION}">Long-term safety of anti-IL-5 therapy</a>.</p>`;

/** A section inserted ABOVE the two above, citing a source neither of them
 *  cites first. Nothing about their stored strings changes when it appears. */
const STORED_INTRODUCTION =
  `<p>The programme is described in the protocol ` +
  `<a data-cite="${PROTOCOL}">CTP-201-301 Clinical Study Protocol</a>.</p>`;

/** Render a whole document — every section against ONE registry, then the
 *  reference list — exactly as the export route does. */
function renderDocumentHtml(storedSections: string[]): string {
  const citations = makeCitationRegistry(LIBRARY);
  const body = storedSections
    .map((stored) => blocksToHtml(sectionContentToBlocks(stored), undefined, { citations }))
    .join('');
  return body + renderReferenceListHtml(citations);
}

describe('citation parsing', () => {
  it('keeps the source id off the run, never a number', () => {
    const runs = sectionContentToBlocks(STORED_EFFICACY).flatMap(blockRuns);
    const cites = runs.filter((r) => r.citationSourceId);

    expect(cites.map((r) => r.citationSourceId)).toEqual([CSR, PROTOCOL]);
    // The author's pinpoint IS stored — no renderer could recompute "p. 142".
    expect(cites[0].citationLocator).toBe('p. 142, Table 14.2.1');
    expect(cites[1].citationLocator).toBeUndefined();
    // Nothing in the parsed runs carries an ordinal.
    expect(JSON.stringify(cites)).not.toMatch(/\[\d+\]/);
  });

  it('leaves an ordinary anchor alone — a link is not a citation', () => {
    const runs = sectionContentToBlocks(
      '<p>See <a href="https://example.org/guidance">the guidance</a>.</p>',
    ).flatMap(blockRuns);
    expect(runs.some((r) => r.citationSourceId)).toBe(false);
    expect(runs.map((r) => r.text).join('')).toContain('the guidance');
  });

  it('does not merge two citations of DIFFERENT sources into one run', () => {
    /* Adjacent runs merge when their formatting matches. Without the source in
       that comparison the second citation would be silently discarded and a
       filed document would carry one reference where the author cited two. */
    const runs = sectionContentToBlocks(
      `<p><a data-cite="${CSR}">a</a><a data-cite="${PROTOCOL}">b</a></p>`,
    ).flatMap(blockRuns);
    expect(runs.filter((r) => r.citationSourceId).map((r) => r.citationSourceId)).toEqual([
      CSR,
      PROTOCOL,
    ]);
  });

  it('does not merge two citations of the SAME source at different pinpoints', () => {
    // "p. 42" and "p. 96" are not interchangeable; merging them would file one
    // pinpoint where the author gave two.
    const runs = sectionContentToBlocks(
      `<p><a data-cite="${CSR}" data-cite-locator="p. 42">x</a>` +
        `<a data-cite="${CSR}" data-cite-locator="p. 96">y</a></p>`,
    ).flatMap(blockRuns);
    expect(runs.filter((r) => r.citationSourceId).map((r) => r.citationLocator)).toEqual([
      'p. 42',
      'p. 96',
    ]);
  });

  it('keeps a block whose only content is a citation', () => {
    /* The marker is resolved at render time, so the block's own text can
       legitimately be empty. The whitespace filter used to delete such a block,
       which would drop the citation out of the filing in silence. */
    const blocks = sectionContentToBlocks(`<p><a data-cite="${CSR}"></a></p>`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].runs.some((r) => r.citationSourceId === CSR)).toBe(true);
  });

  it('lists the cited source ids so an export knows what to look up', () => {
    const ids = collectCitedSourceIds(sectionContentToBlocks(STORED_EFFICACY + STORED_SAFETY));
    // Reading order, de-duplicated: the CSR is cited twice and named once.
    expect(ids).toEqual([CSR, PROTOCOL, PUBLICATION]);
  });
});

describe('HTML/PDF rendering', () => {
  it('prints a number derived from position and links it to the reference list', () => {
    const html = renderDocumentHtml([STORED_EFFICACY, STORED_SAFETY]);

    expect(html).toContain('>[1, p. 142, Table 14.2.1]</a>');
    expect(html).toContain('>[2]</a>');
    expect(html).toContain(`href="#${citationAnchorId(CSR)}"`);
    expect(html).toContain(`id="${citationAnchorId(CSR)}"`);
  });

  it('assembles the reference list from the citations actually used, in first-appearance order', () => {
    const html = renderDocumentHtml([STORED_EFFICACY, STORED_SAFETY]);
    const list = html.slice(html.indexOf('<section class="references">'));

    const order = [...list.matchAll(/<li id="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      citationAnchorId(CSR),
      citationAnchorId(PROTOCOL),
      citationAnchorId(PUBLICATION),
    ]);
    // The entry is assembled from what the registry holds — nothing invented.
    expect(list).toContain(
      'A Phase 3 Study of CTP-201 in Adults with Moderate Asthma. Concept Therapeutics. Clinical study report. 2024. NCT04991234.',
    );
  });

  it('gives a source cited three times ONE number and ONE entry', () => {
    const thrice =
      `<p>One<a data-cite="${CSR}">s</a> two<a data-cite="${CSR}" data-cite-locator="p. 9">s</a> ` +
      `three<a data-cite="${CSR}">s</a>.</p>`;
    const html = renderDocumentHtml([thrice]);

    expect((html.match(/>\[1[,\]]/g) || []).length).toBe(3);
    expect((html.match(/<li id=/g) || []).length).toBe(1);
  });

  it('leaves an UNCITED source out of the reference list entirely', () => {
    const html = renderDocumentHtml([STORED_INTRODUCTION]);
    const list = html.slice(html.indexOf('<section class="references">'));

    expect(list).toContain('CTP-201-301 Clinical Study Protocol');
    // The library holds three sources; one was cited.
    expect(list).not.toContain('A Phase 3 Study of CTP-201');
    expect(list).not.toContain('Long-term safety');
    expect((list.match(/<li id=/g) || []).length).toBe(1);
  });

  it('emits no reference list at all when nothing is cited', () => {
    expect(renderDocumentHtml(['<p>Plain paragraph.</p>'])).not.toContain('references');
  });

  it('INSERTING A CITATION EARLIER RENUMBERS THE REST, with the stored content untouched', () => {
    /* The assertion the whole feature exists for. The two sections' stored
       strings are byte-identical between the two renders — all that changed is
       that a section citing the protocol now sits above them. */
    const before = renderDocumentHtml([STORED_EFFICACY, STORED_SAFETY]);
    const after = renderDocumentHtml([STORED_INTRODUCTION, STORED_EFFICACY, STORED_SAFETY]);

    // Before: CSR is [1], protocol [2], publication [3].
    const beforeList = before.slice(before.indexOf('<section class="references">'));
    expect(beforeList.indexOf(citationAnchorId(CSR))).toBeLessThan(
      beforeList.indexOf(citationAnchorId(PROTOCOL)),
    );
    expect(before).toContain('>[1, p. 142, Table 14.2.1]</a>');

    // After: the protocol is cited first, so it is [1] and the CSR becomes [2]
    // — and the efficacy section's marker moved WITHOUT its stored string
    // changing by one byte.
    expect(after).toContain('>[2, p. 142, Table 14.2.1]</a>');
    const afterList = after.slice(after.indexOf('<section class="references">'));
    expect(afterList.indexOf(citationAnchorId(PROTOCOL))).toBeLessThan(
      afterList.indexOf(citationAnchorId(CSR)),
    );
  });

});

// A second describe, not a style preference: the block crossed the 100-line
// function ceiling the warning ratchet holds, and these four cases are a
// distinct contract anyway — what the renderer does when a citation cannot
// be resolved, versus how it numbers and lists the ones that can.
describe('HTML/PDF rendering — unresolved and renamed sources', () => {
  it('never prints the editor’s cached name in place of a number', () => {
    /* The stored element's text is the source's name. It is a cache: a renderer
       that fell back to it would file a citation with no number and no way into
       the reference list. */
    const html = renderDocumentHtml([STORED_EFFICACY]);
    const markers = [...html.matchAll(/<a class="cite"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(markers).toEqual(['[1, p. 142, Table 14.2.1]', '[2]']);
  });

  it('states an unknown source rather than printing a number or nothing', () => {
    const dangling = `<p>Claimed<a data-cite="99999">Deleted source</a>.</p>`;
    const html = renderDocumentHtml([dangling]);

    expect(html).toContain('class="cite-missing"');
    expect(html).toContain(CITATION_MISSING_TEXT);
    // Not a number, not the cached name, and not silence.
    expect(html).not.toMatch(/\[\d+/);
    expect(html).not.toContain('Deleted source');
    expect(html.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(0);
  });

  it('an unresolved citation consumes NO number, so the list has no gap', () => {
    /* A marker reading "[2]" above a list whose only entry is [1] is worse than
       the broken citation it describes: it sends a reviewer looking for a
       reference that does not exist. */
    const mixed =
      `<p>A<a data-cite="99999">gone</a> B<a data-cite="${CSR}">csr</a> ` +
      `C<a data-cite="${PUBLICATION}">pub</a>.</p>`;
    const html = renderDocumentHtml([mixed]);

    const markers = [...html.matchAll(/<a class="cite"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(markers).toEqual(['[1]', '[2]']);
    expect((html.match(/<li id=/g) || []).length).toBe(2);
  });

  it('treats a source with nothing printable as unresolved, not as an empty entry', () => {
    // A source row that exists but has neither title nor identifier has no name.
    // Inventing one is the fabrication this refuses.
    const citations = makeCitationRegistry(citationLookupFor([{ id: CSR, title: '   ' }]));
    const html =
      blocksToHtml(sectionContentToBlocks(`<p>X<a data-cite="${CSR}">n</a></p>`), undefined, {
        citations,
      }) + renderReferenceListHtml(citations);

    expect(html).toContain(CITATION_MISSING_TEXT);
    expect(html).not.toContain('references');
  });

  it('resolves a citation written inside a table cell', () => {
    /* Regulatory tables cite constantly — every specification row can carry the
       report it came from. The cell path is a separate recursion. */
    const citations = makeCitationRegistry(LIBRARY);
    const html = blocksToHtml(
      sectionContentToBlocks(
        `<table><tbody><tr><td>Assay<a data-cite="${CSR}" data-cite-locator="Table 8">x</a></td></tr></tbody></table>`,
      ),
      undefined,
      { citations },
    );
    expect(html).toContain('>[1, Table 8]</a>');
  });

  it('does not silently drop a citation when no registry is supplied', () => {
    const html = blocksToHtml(sectionContentToBlocks(STORED_EFFICACY));
    expect(html.split(CITATION_MISSING_TEXT).length - 1).toBe(2);
    expect(html).not.toMatch(/\[\d+/);
  });
});

describe('DOCX rendering', () => {
  const loadDocx = async () => await import('docx');

  /** Pack the rendered elements into a real .docx and return document.xml.
   *  Asserted against the FILE, not the object graph: what a reviewer opens is
   *  word/document.xml, and a hyperlink well-formed in memory and absent from
   *  the package would pass a weaker check. */
  const xmlOf = async (element: unknown): Promise<string> => {
    const D = await loadDocx();
    const doc = new D.Document({ sections: [{ children: element as never }] });
    const buf = await D.Packer.toBuffer(doc);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    return await zip.file('word/document.xml')!.async('string');
  };

  /** The text a reader sees, in order — every `w:t` concatenated. */
  const textOf = async (element: unknown): Promise<string> =>
    [...(await xmlOf(element)).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

  /** A whole document: every section against one registry, then the list. */
  const renderDocument = async (storedSections: string[]) => {
    const D = await loadDocx();
    const citations = makeCitationRegistry(LIBRARY);
    const children = storedSections.flatMap((stored) =>
      blocksToDocx(D, sectionContentToBlocks(stored), undefined, { citations }),
    );
    return [...children, ...referenceListParagraphs(D, citations)];
  };

  it('emits the number as a real Word internal hyperlink into the reference list', async () => {
    const els = await renderDocument([STORED_EFFICACY]);
    const xml = await xmlOf(els);

    expect(await textOf(els)).toContain('[1, p. 142, Table 14.2.1]');
    // A real link a reviewer can follow, and the bookmark it lands on.
    expect(xml).toContain('w:hyperlink');
    expect(xml).toContain(`w:anchor="${citationBookmarkId(CSR)}"`);
    expect(xml).toContain(`w:name="${citationBookmarkId(CSR)}"`);
  });

  it('files a reference list built from the citations actually used', async () => {
    const text = await textOf(await renderDocument([STORED_EFFICACY, STORED_SAFETY]));

    expect(text).toContain('References');
    expect(text).toContain('A Phase 3 Study of CTP-201 in Adults with Moderate Asthma');
    expect(text).toContain('Long-term safety of anti-IL-5 therapy');
    // One entry per cited source, however often it was cited.
    expect(text.split('CTP-201-301 Clinical Study Protocol, Amendment 3').length - 1).toBe(1);
  });

  it('INSERTING A CITATION EARLIER RENUMBERS THE WORD TEXT, stored content untouched', async () => {
    const before = await textOf(await renderDocument([STORED_EFFICACY, STORED_SAFETY]));
    const after = await textOf(
      await renderDocument([STORED_INTRODUCTION, STORED_EFFICACY, STORED_SAFETY]),
    );

    expect(before).toContain('[1, p. 142, Table 14.2.1]');
    expect(after).toContain('[2, p. 142, Table 14.2.1]');
    expect(after).not.toContain('[1, p. 142, Table 14.2.1]');
  });

  it('states an unknown source in the filed document, and emits no link for it', async () => {
    const D = await loadDocx();
    const citations = makeCitationRegistry(LIBRARY);
    const els = blocksToDocx(
      D,
      sectionContentToBlocks(`<p>Claimed<a data-cite="99999">Deleted source</a>.</p>`),
      undefined,
      { citations },
    );
    const xml = await xmlOf(els);

    expect(await textOf(els)).toContain(CITATION_MISSING_TEXT);
    expect(xml).not.toContain('Deleted source');
    /* No hyperlink: a link to a bookmark that was never written is a dead jump
       in a filed document, and no number is printed at all. */
    expect(xml).not.toContain('w:hyperlink');
    // Nothing was numbered, so there is no list to file.
    expect(referenceListParagraphs(D, citations)).toHaveLength(0);
  });

  it('does not silently drop a citation when no registry is supplied', async () => {
    const D = await loadDocx();
    const els = blocksToDocx(D, sectionContentToBlocks(STORED_EFFICACY));
    const text = await textOf(els);

    expect(text.split(CITATION_MISSING_TEXT).length - 1).toBe(2);
    expect(text).not.toMatch(/\[\d+/);
    expect(await xmlOf(els)).not.toContain('w:hyperlink');
  });

  it('carries a citation out of a TABLE CELL', async () => {
    const D = await loadDocx();
    const citations = makeCitationRegistry(LIBRARY);
    const els = blocksToDocx(
      D,
      sectionContentToBlocks(
        `<table><tbody><tr><td>Assay<a data-cite="${CSR}">x</a></td></tr></tbody></table>`,
      ),
      undefined,
      { citations },
    );
    const xml = await xmlOf(els);
    const table = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'));
    expect(table).toContain('w:hyperlink');
  });
});

describe('the two filed formats agree', () => {
  it('numbers the same sources identically in DOCX and in HTML', async () => {
    const D = await import('docx');
    const { default: JSZip } = await import('jszip');
    const sections = [STORED_INTRODUCTION, STORED_EFFICACY, STORED_SAFETY];

    const htmlRegistry = makeCitationRegistry(LIBRARY);
    const html =
      sections
        .map((s) =>
          blocksToHtml(sectionContentToBlocks(s), undefined, { citations: htmlRegistry }),
        )
        .join('') + renderReferenceListHtml(htmlRegistry);

    const docxRegistry = makeCitationRegistry(LIBRARY);
    const children = [
      ...sections.flatMap((s) =>
        blocksToDocx(D, sectionContentToBlocks(s), undefined, { citations: docxRegistry }),
      ),
      ...referenceListParagraphs(D, docxRegistry),
    ];
    const doc = new D.Document({ sections: [{ children: children as never }] });
    const xml = await (await JSZip.loadAsync(await D.Packer.toBuffer(doc)))
      .file('word/document.xml')!
      .async('string');
    const docxText = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const htmlText = html.replace(/<[^>]+>/g, '');

    for (const marker of ['[1]', '[2, p. 142, Table 14.2.1]', '[3]']) {
      expect(htmlText, `HTML lost ${marker}`).toContain(marker);
      expect(docxText, `DOCX lost ${marker}`).toContain(marker);
    }
    // And the two lists are the same list, in the same order.
    expect(htmlRegistry.entries().map((e) => e.source.id)).toEqual(
      docxRegistry.entries().map((e) => e.source.id),
    );
  });
});
