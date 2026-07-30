/**
 * ICH eCTD v3.2.2 backbone heading hierarchy — structural contract.
 *
 * Pins the authoritative heading tree + leaf placement so the backbone
 * generators emit ONE spec convention. (Final DTD-validity is asserted by the
 * qualification harness's xmllint --dtdvalid step when ich-ectd-3-2.dtd is
 * present; these tests pin the structure the DTD will then confirm.)
 */
import { describe, it, expect } from 'vitest';
import {
  headingPathFor,
  buildIchModuleTree,
  allHeadingElements,
  type RenderedLeaf,
} from '../ich-headings';
import type { EctdLeaf } from '../types';

const leaf = (ctdSection: string): EctdLeaf => ({
  ctdSection,
  operation: 'new',
  sourcePath: `/tmp/${ctdSection}.pdf`,
  fileName: `${ctdSection.replace(/\./g, '-')}.pdf`,
  title: ctdSection,
});
const rendered = (ctdSection: string): RenderedLeaf => ({
  leaf: leaf(ctdSection),
  xml: `<leaf ID="leaf-${ctdSection.replace(/\./g, '-')}"><title>${ctdSection}</title></leaf>`,
});

describe('headingPathFor — deepest-match placement', () => {
  it('places a drug-substance leaf under m3 > body-of-data > drug-substance', () => {
    const path = headingPathFor('3.2.S.1')!.map((h) => h.element);
    expect(path).toEqual(['m3-quality', 'm3-2-body-of-data', 'm3-2-s-drug-substance']);
  });
  it('places a drug-product leaf under the P branch (case-insensitive)', () => {
    expect(headingPathFor('3.2.p.1')!.map((h) => h.element)).toEqual([
      'm3-quality',
      'm3-2-body-of-data',
      'm3-2-p-drug-product',
    ]);
  });
  it('places a pivotal efficacy study under m5 > clinical-study-reports > 5.3.5', () => {
    expect(headingPathFor('5.3.5.1')!.map((h) => h.element)).toEqual([
      'm5-clinical-study-reports',
      'm5-3-clinical-study-reports',
      'm5-3-5-reports-of-efficacy-and-safety-studies',
    ]);
  });
  it('places a toxicology report under m4 > study-reports > toxicology', () => {
    expect(headingPathFor('4.2.3.2')!.map((h) => h.element)).toEqual([
      'm4-nonclinical-study-reports',
      'm4-2-study-reports',
      'm4-2-3-toxicology',
    ]);
  });
  it('places a clinical summary leaf under m2 > clinical-summary', () => {
    expect(headingPathFor('2.7.3')!.map((h) => h.element)).toEqual([
      'm2-common-technical-document-summaries',
      'm2-7-clinical-summary',
    ]);
  });
  it('returns null for a Module 1 section (regional, handled elsewhere)', () => {
    expect(headingPathFor('1.2')).toBeNull();
  });
  it('falls back to the module root when no sub-heading matches', () => {
    // 3.9 is not a defined sub-heading; it attaches at m3-quality.
    expect(headingPathFor('3.9')!.map((h) => h.element)).toEqual(['m3-quality']);
  });
});

describe('buildIchModuleTree — nesting + empty-heading omission', () => {
  it('emits only the headings that contain leaves, nested correctly', () => {
    const xml = buildIchModuleTree([rendered('3.2.S.1'), rendered('3.2.P.1'), rendered('5.3.5.1')]);
    // Present modules
    expect(xml).toContain('<m3-quality>');
    expect(xml).toContain('<m3-2-body-of-data>');
    expect(xml).toContain('<m3-2-s-drug-substance>');
    expect(xml).toContain('<m3-2-p-drug-product>');
    expect(xml).toContain('<m5-clinical-study-reports>');
    expect(xml).toContain('<m5-3-5-reports-of-efficacy-and-safety-studies>');
    // Absent modules/headings are omitted (no hollow shells)
    expect(xml).not.toContain('<m2-common-technical-document-summaries>');
    expect(xml).not.toContain('<m4-nonclinical-study-reports>');
    expect(xml).not.toContain('<m3-2-a-appendices>');
    expect(xml).not.toContain('<m5-2-tabular-listing-of-all-clinical-studies>');
  });

  it('nests the leaf XML inside its owning heading (not at the module root)', () => {
    const xml = buildIchModuleTree([rendered('3.2.S.1')]);
    // the leaf sits between the drug-substance open/close tags
    const open = xml.indexOf('<m3-2-s-drug-substance>');
    const leafAt = xml.indexOf('leaf-3-2-S-1');
    const close = xml.indexOf('</m3-2-s-drug-substance>');
    expect(open).toBeGreaterThanOrEqual(0);
    expect(leafAt).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(leafAt);
  });

  it('is well-balanced (every opened heading is closed)', () => {
    const xml = buildIchModuleTree([
      rendered('2.3'), rendered('3.2.S.1'), rendered('4.2.3.1'), rendered('5.3.5.1'),
    ]);
    for (const el of allHeadingElements()) {
      const opens = (xml.match(new RegExp(`<${el}>`, 'g')) ?? []).length;
      const closes = (xml.match(new RegExp(`</${el}>`, 'g')) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it('ignores Module 1 leaves (they belong in the regional backbone)', () => {
    const xml = buildIchModuleTree([rendered('1.2'), rendered('3.2.S.1')]);
    expect(xml).not.toContain('leaf-1-2');
    expect(xml).toContain('leaf-3-2-S-1');
  });

  it('produces nothing when there are no Module 2–5 leaves', () => {
    expect(buildIchModuleTree([rendered('1.1'), rendered('1.2')])).toBe('');
  });
});

describe('allHeadingElements', () => {
  it('includes module roots and the deepest defined headings, all m*-prefixed', () => {
    const els = allHeadingElements();
    expect(els).toContain('m2-common-technical-document-summaries');
    expect(els).toContain('m3-2-s-drug-substance');
    expect(els).toContain('m5-3-7-case-report-forms-and-individual-patient-listings');
    expect(els.every((e) => /^m[2-5](-[a-z0-9-]+)?$/.test(e))).toBe(true);
    // No accidental duplicates.
    expect(new Set(els).size).toBe(els.length);
  });
});
