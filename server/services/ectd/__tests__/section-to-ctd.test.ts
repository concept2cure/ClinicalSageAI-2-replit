/**
 * Per-artifact CTD placement for loosely-keyed transmit content.
 *
 * Every case below that asserts a REJECTION is a case an earlier version got
 * wrong (confirmed by adversarial review against the real packager): bare
 * modules and non-existent codes were emitted and nested in container elements;
 * artifacts with different ctd_sections were merged under one code; a longer
 * wrong code beat a shorter right one; keyword ordering filed clinical
 * pharmacology under Module 4. These tests hold the resolver to the honest
 * behaviour and are shown FAILING on those inputs, not only passing.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {
  normalizeCtdCode,
  isPlaceableCtdCode,
  moduleForSectionKey,
  resolveArtifactPlacement,
} from '../section-to-ctd';
import { packageLeafBytes } from '../package-leaf-bytes';

const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

describe('normalizeCtdCode (syntax only)', () => {
  it('accepts code-shaped values, with or without a leading m', () => {
    expect(normalizeCtdCode('3.2.P.1')).toBe('3.2.P.1');
    expect(normalizeCtdCode('m3.2.S.4.2')).toBe('3.2.S.4.2');
    expect(normalizeCtdCode(' 2.5 ')).toBe('2.5');
  });
  it('rejects non-code values', () => {
    for (const v of ['module3_cmc', 'labeling', '', null, undefined, '6.1', 'cer']) {
      expect(normalizeCtdCode(v as string)).toBeNull();
    }
  });
});

describe('isPlaceableCtdCode — only terminal ICH headings are placeable', () => {
  it('accepts real terminal headings and dotted Module 1 headings', () => {
    for (const c of ['3.2.S.1', '3.2.P.1', '2.5', '5.3.5', '1.2', '1.14']) {
      expect(isPlaceableCtdCode(c)).toBe(true);
    }
  });
  it('REJECTS bare modules (they nest under container elements / an undefined <m1>)', () => {
    for (const c of ['1', '2', '3', '4', '5']) expect(isPlaceableCtdCode(c)).toBe(false);
  });
  it('REJECTS code-shaped but non-existent headings', () => {
    for (const c of ['3.14', '3.foo', '3.2.X', '5.99']) expect(isPlaceableCtdCode(c)).toBe(false);
  });
});

describe('moduleForSectionKey ordering (cross-check only)', () => {
  it('an explicit module declaration beats every keyword', () => {
    expect(moduleForSectionKey('m5-labeling')).toBe(5);
    expect(moduleForSectionKey('module3-pi')).toBe(3);
    expect(moduleForSectionKey('module4-form')).toBe(4);
  });
  it('clinical pharmacology / human PK are Module 5; nonclinical stays Module 4', () => {
    expect(moduleForSectionKey('clinical-pharmacology')).toBe(5);
    expect(moduleForSectionKey('human-pk')).toBe(5);
    expect(moduleForSectionKey('adme-clinical')).toBe(5);
    expect(moduleForSectionKey('nonclinical-pharmacology')).toBe(4);
    expect(moduleForSectionKey('toxicology')).toBe(4);
  });
});

describe('resolveArtifactPlacement — per ARTIFACT, honest, placeable-only', () => {
  it("uses the artifact's own declared placement first", () => {
    const p = resolveArtifactPlacement('module3_cmc', '3.2.S.1');
    expect(p).toMatchObject({ code: '3.2.S.1', source: 'artifact' });
    expect(p.moduleDisagreement).toBeUndefined();
  });
  it('two artifacts in one section with different codes resolve INDEPENDENTLY (never merged)', () => {
    expect(resolveArtifactPlacement('module3_cmc', '3.2.S.1').code).toBe('3.2.S.1');
    expect(resolveArtifactPlacement('module3_cmc', '3.2.P.1').code).toBe('3.2.P.1');
  });
  it('flags a DISAGREEMENT when an artifact is filed in a different module than its section names', () => {
    const p = resolveArtifactPlacement('clinical-csr', '3.2.S.4.2');
    expect(p.code).toBe('3.2.S.4.2'); // the artifact's explicit placement is kept…
    expect(p.moduleDisagreement).toEqual({ sectionModule: 5, placedModule: 3 }); // …but surfaced, never silent
  });
  it('a declared but UNPLACEABLE code is rejected and named, falling through to the section', () => {
    const p = resolveArtifactPlacement('3.2.P.1', '3.foo');
    expect(p).toMatchObject({ code: '3.2.P.1', source: 'section-key', unplaceableCode: '3.foo' });
  });
  it('uses a CTD-coded section key when the artifact declares nothing', () => {
    expect(resolveArtifactPlacement('3.2.P.1', null)).toMatchObject({ code: '3.2.P.1', source: 'section-key' });
  });
  it('uses an unambiguous Module 1 heading from the key (never bare "1")', () => {
    expect(resolveArtifactPlacement('cover-letter', null)).toMatchObject({ code: '1.2', source: 'module1-heading' });
    expect(resolveArtifactPlacement('form-1571', null)).toMatchObject({ code: '1.1', source: 'module1-heading' });
  });
  it('a keyword-only section with no declared code is UNPLACED — a bare module is never guessed', () => {
    for (const key of ['module3_cmc', 'module1_admin', 'stability-data', 'nonclinical-tox', 'misc-attachment']) {
      expect(resolveArtifactPlacement(key, null).code).toBeNull();
    }
  });
  it('a bare-module declaration is unplaceable and reported', () => {
    const p = resolveArtifactPlacement('module3_cmc', '3');
    expect(p.code).toBeNull();
    expect(p.unplaceableCode).toBe('3');
  });
});

describe('every code this resolver EMITS is placed at a real terminal heading by the packager', () => {
  it('artifact-declared + section-key + module-1-heading placements never land in a bare container', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sct-out-'));
    try {
      const placements = [
        resolveArtifactPlacement('module3_cmc', '3.2.S.1'),
        resolveArtifactPlacement('3.2.P.1', null),
        resolveArtifactPlacement('cover-letter', null),
      ];
      expect(placements.every((p) => p.code)).toBe(true);
      const bundle = await packageLeafBytes({
        region: 'fda', applicationId: 'IND1', sequence: '0000', submissionType: 'original',
        sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
        leaves: placements.map((p, i) => ({
          ctdSection: p.code!, fileName: `leaf-${i}.pdf`, bytes: pdf(String(i)), title: `Leaf ${i}`,
        })),
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const indexXml = await zip.file('index.xml')!.async('string');
      expect(indexXml).toContain('<m3-2-s-drug-substance>');
      expect(indexXml).toContain('<m3-2-p-drug-product>');
      expect(indexXml).not.toMatch(/<m3-quality>\s*<leaf/); // no leaf directly under a container
      const us = await zip.file('m1/us/us-regional.xml')!.async('string');
      expect(us).not.toMatch(/<m1>\s*<leaf/); // Module 1 went to a published heading, not an undefined <m1>
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
