/**
 * PDF outline (bookmark) generator — proves flat dotted section codes nest
 * correctly and that addBookmarks writes a real /Outlines tree into the catalog.
 * No DB or system binary.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import {
  buildOutlineTree,
  addBookmarks,
  type OutlineNode,
} from '../pdf-bookmark-generator';

describe('buildOutlineTree', () => {
  it('nests parent/child correctly from flat dotted codes', () => {
    const tree = buildOutlineTree([
      { sectionCode: '2.5', title: 'Clinical Overview', pageIndex: 0 },
      { sectionCode: '2.5.1', title: 'Product Development Rationale', pageIndex: 1 },
      { sectionCode: '2.5.2', title: 'Overview of Biopharmaceutics', pageIndex: 2 },
      { sectionCode: '2.7', title: 'Clinical Summary', pageIndex: 3 },
    ]);

    // Two roots: 2.5 and its sibling 2.7.
    expect(tree).toHaveLength(2);
    const overview = tree.find((n) => n.sectionCode === '2.5')!;
    const summary = tree.find((n) => n.sectionCode === '2.7')!;
    expect(overview).toBeDefined();
    expect(summary).toBeDefined();

    // 2.5.1 and 2.5.2 are children of 2.5, not of each other.
    const childCodes = (overview.children ?? []).map((c) => c.sectionCode).sort();
    expect(childCodes).toEqual(['2.5.1', '2.5.2']);
    expect(summary.children ?? []).toHaveLength(0);
  });

  it('attaches a grandchild to the nearest present ancestor', () => {
    // 2.5.1 is missing; 2.5.1.3 should attach to 2.5 (nearest present ancestor).
    const tree = buildOutlineTree([
      { sectionCode: '2.5', title: 'Overview', pageIndex: 0 },
      { sectionCode: '2.5.1.3', title: 'Deep subsection', pageIndex: 1 },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].sectionCode).toBe('2.5');
    expect((tree[0].children ?? [])[0]?.sectionCode).toBe('2.5.1.3');
  });
});

describe('addBookmarks', () => {
  it('writes an /Outlines reference into the catalog of a 3-page PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const baseBytes = await doc.save({ useObjectStreams: false });

    const nodes: OutlineNode[] = buildOutlineTree([
      { sectionCode: '2.5', title: 'Clinical Overview', pageIndex: 0 },
      { sectionCode: '2.5.1', title: 'Rationale', pageIndex: 1 },
      { sectionCode: '2.7', title: 'Clinical Summary', pageIndex: 2 },
    ]);

    const out = await addBookmarks(baseBytes, nodes);
    expect(out.subarray(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])); // %PDF-

    // The catalog must now carry an /Outlines entry.
    const reloaded = await PDFDocument.load(out);
    const outlines = reloaded.catalog.get(PDFName.of('Outlines'));
    expect(outlines).toBeDefined();

    // Resolve the outline root and confirm it is an /Outlines dict.
    const outlinesDict = reloaded.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlinesDict).toBeInstanceOf(PDFDict);
    const type = outlinesDict.get(PDFName.of('Type'));
    expect(type?.toString()).toBe('/Outlines');

    // Byte-level marker check as a belt-and-suspenders assertion.
    const text = Buffer.from(out).toString('latin1');
    expect(text).toContain('/Outlines');
    expect(text).toContain('Clinical Overview');
  });
});
