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
  module1HeadingForSectionKey,
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
  it('canonicalises alpha segments to ICH uppercase so one heading is one code', () => {
    expect(normalizeCtdCode('3.2.s.1')).toBe('3.2.S.1');
    expect(normalizeCtdCode('m3.2.p.1')).toBe('3.2.P.1');
    expect(resolveArtifactPlacement('module3_cmc', '3.2.s.1').code).toBe('3.2.S.1');
  });
  it('rejects non-code values', () => {
    for (const v of ['module3_cmc', 'labeling', '', null, undefined, '6.1', 'cer']) {
      expect(normalizeCtdCode(v as string)).toBeNull();
    }
  });
});

describe('isPlaceableCtdCode — only terminal ICH headings are placeable', () => {
  it('accepts real terminal headings and published Module 1 headings', () => {
    for (const c of ['3.2.S.1', '3.2.P.1', '2.5', '5.3.5', '1.2', '1.14.4.1']) {
      expect(isPlaceableCtdCode(c)).toBe(true);
    }
  });
  it('REJECTS bare modules (they nest under container elements / an undefined <m1>)', () => {
    for (const c of ['1', '2', '3', '4', '5']) expect(isPlaceableCtdCode(c)).toBe(false);
  });
  it('REJECTS code-shaped but non-existent headings', () => {
    for (const c of ['3.14', '3.foo', '3.2.X', '5.99']) expect(isPlaceableCtdCode(c)).toBe(false);
  });
  it('FDA Module 1 is judged by the PUBLISHED heading table, not the module digit', () => {
    // These passed on the digit alone and the builder invented <m1-foo> elements
    // the us-regional DTD does not define (adversarial review).
    for (const c of ['1.foo', '1.99.99', '1.42']) expect(isPlaceableCtdCode(c, 'fda'), c).toBe(false);
    // CONTAINERS are not headings either: 1.14 (labeling) and 1.3.5 (patents)
    // only exist through their children in the FDA table.
    for (const c of ['1.14', '1.3.5', '1.13']) expect(isPlaceableCtdCode(c, 'fda'), c).toBe(false);
    // Published headings, and descendants of one (the forms 1.1.x file under <m1-1-forms>).
    for (const c of ['1.1', '1.2', '1.3.4', '1.14.4.1', '1.1.1']) expect(isPlaceableCtdCode(c, 'fda'), c).toBe(true);
  });
  it('every FDA heading the keyword inference can emit is itself a published leaf heading', () => {
    const expected: Record<string, string> = {
      'cover-letter': '1.2', 'form-1571': '1.1', 'financial-disclosure': '1.3.4', 'debarment': '1.3.3',
      'patent': '1.3.5.1', 'patent-certification': '1.3.5.2', 'exclusivity-claim': '1.3.5.3',
      'letter-of-authorization': '1.4.1', 'environmental': '1.12.14', 'dsur': '1.13.15',
      'investigators-brochure': '1.14.4.1', 'investigational-drug-labeling': '1.14.4.2',
    };
    for (const [key, code] of Object.entries(expected)) {
      expect(module1HeadingForSectionKey(key), key).toBe(code);
      expect(isPlaceableCtdCode(code, 'fda'), `${key} -> ${code}`).toBe(true);
    }
  });
  it('a key that names only a CONTAINER (generic labeling, annual report) is not guessed into a child heading', () => {
    for (const key of ['labeling', 'package-insert', 'annual-report', 'patents-and-exclusivity-cover']) {
      const code = module1HeadingForSectionKey(key);
      if (code !== null) expect(isPlaceableCtdCode(code, 'fda'), `${key} -> ${code}`).toBe(true);
    }
    expect(module1HeadingForSectionKey('labeling')).toBeNull();
    expect(module1HeadingForSectionKey('annual-report')).toBeNull();
  });
  it('other regions file 1.* flat under their Module 1 container, so a dotted code is structurally placeable there', () => {
    expect(isPlaceableCtdCode('1.0', 'ema')).toBe(true);
    expect(isPlaceableCtdCode('1', 'ema')).toBe(false);
  });
});

describe('placement is region-aware', () => {
  it('FDA-numbered keyword headings are NOT offered for an EMA / PMDA package (EU 1.0 is the cover letter, not 1.2)', () => {
    expect(resolveArtifactPlacement('cover-letter', null, 'fda').code).toBe('1.2');
    expect(resolveArtifactPlacement('cover-letter', null, 'ema').code).toBeNull();
    expect(resolveArtifactPlacement('cover-letter', null, 'pmda').code).toBeNull();
  });
  it("an artifact's explicit Module 1 code is honoured per region", () => {
    expect(resolveArtifactPlacement('cover-letter', '1.0', 'ema')).toMatchObject({ code: '1.0', source: 'artifact' });
    expect(resolveArtifactPlacement('cover-letter', '1.foo', 'fda')).toMatchObject({ code: '1.2', source: 'module1-heading', unplaceableCode: '1.foo' });
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
  it('a key that names ANOTHER module is never filed under a Module 1 heading by its words (m5-labeling ≠ 1.14)', () => {
    // Each of these used to resolve to a Module 1 heading from a keyword while
    // the key explicitly (prefix) or by its subject named Module 3/4/5.
    for (const key of ['m5-labeling', 'module3-labeling', 'm4-tox-form', 'ib-study-reports', 'clinical-study-reports-pi', 'environmental-stability']) {
      const p = resolveArtifactPlacement(key, null);
      expect(p.code, key).toBeNull();
    }
    // …while genuine Module 1 keys still resolve.
    expect(resolveArtifactPlacement('investigators-brochure', null).code).toBe('1.14.4.1');
    expect(resolveArtifactPlacement('fda-form-1571', null).code).toBe('1.1');
    expect(resolveArtifactPlacement('forms', null).code).toBe('1.1');
  });
  it("'form' inside a CMC key is not an FDA form (dosage-form-description is Module 3 content)", () => {
    expect(resolveArtifactPlacement('dosage-form-description', null).code).toBeNull();
    expect(moduleForSectionKey('dosage-form-description')).not.toBe(1);
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
