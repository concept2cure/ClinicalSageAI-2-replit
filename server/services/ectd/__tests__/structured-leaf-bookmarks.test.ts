/**
 * Bookmarks in a multi-page leaf must land on the section they name.
 *
 * FDA's eCTD guidance asks for navigable bookmarks to a document's major
 * sections, and a reviewer's first interaction with a long CSR leaf is the
 * bookmark pane. A bookmark tree that is complete and correctly nested but
 * whose destinations resolve to the wrong page is worse than none: it reads as
 * working navigation and quietly sends the reader to the wrong section.
 *
 * `buildOutlineTree` is unit-tested next door, and the renderer suite asserts
 * that an /Outlines dictionary exists at all. Neither of those can see a
 * destination that points at the wrong page, because both stop before the
 * bookmark is resolved against the rendered document. Nothing in the repository
 * resolved one until this file: the assertion here is made by extracting the
 * outline with pdfjs, resolving each destination to a page index, and comparing
 * it against the page the heading is actually drawn on.
 *
 * The fixture is a paginated ICH E3 skeleton with three levels of nesting,
 * because on a single page every destination is trivially correct and the test
 * would pass against a renderer that pointed every bookmark at page 1.
 *
 * @compliance ICH eCTD; FDA Providing Regulatory Submissions in Electronic
 *             Format (bookmarks and navigation).
 */

import { describe, it, expect } from 'vitest';
import { renderStructuredLeafPdf, type LeafSection } from '../leaf-pdf-renderer';

/** Enough narrative to push each section onto its own page. */
function narrative(tag: string, sentences = 60): string {
  return (
    '<p>' +
    Array.from(
      { length: sentences },
      (_, i) => `${tag} sentence ${i} describing the evaluation in detail.`,
    ).join(' ') +
    '</p>'
  );
}

const CSR: LeafSection[] = [
  { sectionCode: '9', heading: 'Investigational Plan', body: narrative('PLAN'), children: [
      { sectionCode: '9.3', heading: 'Selection of Study Population', body: narrative('POP'), children: [
          { sectionCode: '9.3.1', heading: 'Inclusion Criteria', body: narrative('INC') },
        ] },
    ] },
  { sectionCode: '10', heading: 'Study Patients', body: narrative('PAT') },
  { sectionCode: '11', heading: 'Efficacy Evaluation', body: narrative('EFF') },
  { sectionCode: '12', heading: 'Safety Evaluation', body: narrative('SAF') },
];

const HEADINGS = [
  'Investigational Plan',
  'Selection of Study Population',
  'Inclusion Criteria',
  'Study Patients',
  'Efficacy Evaluation',
  'Safety Evaluation',
];

describe('renderStructuredLeafPdf — bookmark destinations', () => {
  it('points every bookmark at the page its heading is drawn on', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await renderStructuredLeafPdf(CSR, { title: 'Clinical Study Report' });
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;

    // A single-page document would make every destination trivially correct.
    expect(doc.numPages).toBeGreaterThan(1);

    // Where each heading is actually drawn. Text is normalized because pdfjs
    // splits a wrapped line into separate items mid-phrase.
    const drawnOn = new Map<string, number>();
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const text = content.items
        .map((i: any) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ');
      for (const heading of HEADINGS) {
        if (!drawnOn.has(heading) && text.includes(heading)) drawnOn.set(heading, page);
      }
    }
    expect([...drawnOn.keys()].sort()).toEqual([...HEADINGS].sort());

    const outline = await doc.getOutline();
    expect(outline, 'the leaf carries no bookmarks at all').toBeTruthy();

    const checked: string[] = [];
    async function walk(nodes: any[], depth: number): Promise<void> {
      for (const node of nodes) {
        const dest =
          typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
        expect(dest, `bookmark "${node.title}" has no destination`).toBeTruthy();

        const targetPage = (await doc.getPageIndex(dest[0])) + 1;
        const heading = String(node.title).replace(/^[\d.]+\s+/, '').trim();
        expect(
          targetPage,
          `bookmark "${node.title}" jumps to page ${targetPage}, but its heading is on page ${drawnOn.get(heading)}`,
        ).toBe(drawnOn.get(heading));

        checked.push(heading);
        if (node.items?.length) await walk(node.items, depth + 1);
      }
    }
    await walk(outline as any[], 0);

    // Every section is reachable — a tree that silently omits a section is the
    // other way this navigation fails.
    expect(checked.sort()).toEqual([...HEADINGS].sort());
  }, 30_000);

  it('nests subsections under their parent rather than flattening the tree', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await renderStructuredLeafPdf(CSR, { title: 'Clinical Study Report' });
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;

    const outline = (await doc.getOutline()) as any[];
    expect(outline.map((n) => String(n.title).trim().split(/\s+/)[0])).toEqual([
      '9',
      '10',
      '11',
      '12',
    ]);

    const plan = outline[0];
    expect(plan.items?.map((n: any) => String(n.title).trim().split(/\s+/)[0])).toEqual(['9.3']);
    expect(plan.items[0].items?.map((n: any) => String(n.title).trim().split(/\s+/)[0])).toEqual([
      '9.3.1',
    ]);
  }, 30_000);
});
