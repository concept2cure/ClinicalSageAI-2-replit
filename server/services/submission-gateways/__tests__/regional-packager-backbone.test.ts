/**
 * eCTD backbone conformance evidence.
 *
 * Turns "the XML looks plausible" into tested facts: the ICH index.xml (M8)
 * carries the correct DOCTYPE/namespace and links EVERY authored Module 2–5 leaf
 * into its module block (the concern that M2–5 backbone behavior was not
 * visible), while the regional backbone carries Module 1 under m1/<region>/.
 */

import { describe, it, expect } from 'vitest';
import { buildIndexXml, buildFdaBackbone, type EctdLeaf } from '../regional-packager';
import type { PackagerInput } from '../regional-packager';

const leaf = (ctdSection: string, fileName: string): EctdLeaf => ({
  ctdSection, fileName, operation: 'new', sourcePath: `/stage/${fileName}`, title: fileName,
});

const input = (leaves: EctdLeaf[]): PackagerInput => ({
  region: 'fda',
  applicationId: 'IND123456',
  sequence: '0000',
  submissionType: 'ind',
  sponsorId: 'SP1',
  sponsorName: 'Acme Bio',
  productName: 'ACM-101',
  leaves,
  outputDir: '/tmp/out',
});

describe('ICH index.xml (Modules 2–5) linkage', () => {
  const m2to5 = [
    leaf('2.5', 'clinical-overview.pdf'),
    leaf('2.3', 'qos.pdf'),
    leaf('3.2.S', 'drug-substance.pdf'),
    leaf('3.2.P', 'drug-product.pdf'),
    leaf('4.2.3', 'toxicology.pdf'),
    leaf('5.3.5.1', 'csr.pdf'),
  ];
  const xml = buildIndexXml(input(m2to5), m2to5);

  it('is a conformant ICH eCTD backbone (DOCTYPE + namespace + dtd-version)', () => {
    expect(xml).toContain('<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">');
    expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
    expect(xml).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(xml).toContain('dtd-version="3.2"');
  });

  it('emits a module block for each of m2, m3, m4, m5', () => {
    for (const m of ['m2', 'm3', 'm4', 'm5']) {
      expect(xml).toContain(`<${m}>`);
      expect(xml).toContain(`</${m}>`);
    }
  });

  it('links EVERY Module 2–5 leaf under its correct module path', () => {
    expect(xml).toContain('m2/2-5');       // clinical overview
    expect(xml).toContain('m2/2-3');       // QOS
    expect(xml).toContain('m3/3-2-S');     // drug substance
    expect(xml).toContain('m3/3-2-P');     // drug product
    expect(xml).toContain('m4/4-2-3');     // toxicology
    expect(xml).toContain('m5/5-3-5-1');   // CSR
  });

  it('does NOT place a Module 1 leaf in the ICH index (it belongs in the regional backbone)', () => {
    const withM1 = [...m2to5, leaf('1.1', 'cover.pdf')];
    const xml2 = buildIndexXml(input(withM1), withM1.filter((l) => !l.ctdSection.startsWith('1')));
    expect(xml2).not.toContain('cover.pdf');
  });
});

describe('FDA regional backbone (Module 1)', () => {
  it('places Module 1 leaves under m1/us/ and excludes M2–5', () => {
    const leaves = [leaf('1.1', 'cover-letter.pdf'), leaf('1.2', 'form-1571.pdf'), leaf('3.2.S', 'drug-substance.pdf')];
    const bb = buildFdaBackbone(input(leaves));
    expect(bb).toContain('m1/us/1-1');
    expect(bb).toContain('m1/us/1-2');
    // Module 3 is NOT in the regional backbone (it lives in the ICH index.xml).
    expect(bb).not.toContain('drug-substance.pdf');
  });
});
