/**
 * CTD-section resolution for loosely-keyed transmit content, plus an EMPIRICAL
 * check that every code this resolver emits is actually placeable by the
 * canonical packager — the convergence depends on that being true, not assumed.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { normalizeCtdCode, resolveCtdSection } from '../section-to-ctd';
import { packageLeafBytes } from '../package-leaf-bytes';

const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

describe('normalizeCtdCode', () => {
  it('accepts CTD codes, with or without a leading m', () => {
    expect(normalizeCtdCode('3.2.P.1')).toBe('3.2.P.1');
    expect(normalizeCtdCode('m3.2.S.4.2')).toBe('3.2.S.4.2');
    expect(normalizeCtdCode(' 2.5 ')).toBe('2.5');
    expect(normalizeCtdCode('1')).toBe('1');
  });
  it('rejects non-CTD values', () => {
    for (const v of ['module3_cmc', 'labeling', '', null, undefined, '6.1', 'cer']) {
      expect(normalizeCtdCode(v as string)).toBeNull();
    }
  });
});

describe('resolveCtdSection', () => {
  it('prefers a section key that is already a CTD code', () => {
    expect(resolveCtdSection('3.2.P.1', ['5.3.5'])).toBe('3.2.P.1');
  });
  it('falls back to the most specific artifact-declared ctd_section', () => {
    expect(resolveCtdSection('module3_cmc', ['3', '3.2.S.1', null])).toBe('3.2.S.1');
  });
  it('falls back to the keyword-inferred module when nothing is declared', () => {
    expect(resolveCtdSection('module3_cmc', [])).toBe('3');
    expect(resolveCtdSection('nonclinical-tox', [])).toBe('4');
    expect(resolveCtdSection('clinical-csr', [])).toBe('5');
  });
  it('places a Module 1 document at the FDA heading its key names, never at the bare module', () => {
    // A bare '1' nests under an <m1> element the us-regional DTD does not define.
    expect(resolveCtdSection('form-1571', [])).toBe('1.1');
    expect(resolveCtdSection('356h', [])).toBe('1.1');
    expect(resolveCtdSection('form_3674', [])).toBe('1.1');
    expect(resolveCtdSection('financial-disclosure-3455', [])).toBe('1.3.4');
    expect(resolveCtdSection('cover-letter', [])).toBe('1.2');
    expect(resolveCtdSection('labeling', [])).toBe('1.14');
    expect(resolveCtdSection('investigators-brochure', [])).toBe('1.14.4.1');
    expect(resolveCtdSection('environmental-assessment', [])).toBe('1.12.14');
    for (const key of ['form-1571', 'cover-letter', 'labeling']) {
      expect(resolveCtdSection(key, [])).not.toBe('1');
    }
  });
  it('returns null when nothing can be honestly inferred (caller must not guess)', () => {
    expect(resolveCtdSection('misc-attachment', [])).toBeNull();
  });
});

describe('every resolved code is placeable by the canonical packager', () => {
  it('packages bare module fallbacks (2/3/4/5) and a module-1 regional leaf', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sct-out-'));
    try {
      const codes = ['1', '2', '3', '4', '5'];
      const bundle = await packageLeafBytes({
        region: 'fda', applicationId: 'IND1', sequence: '0000', submissionType: 'original',
        sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
        leaves: codes.map((c) => ({
          ctdSection: c, fileName: `sec-${c}.pdf`, bytes: pdf(c), title: `Section ${c}`,
        })),
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const indexXml = await zip.file('index.xml')!.async('string');

      // m2-m5 land in the ICH backbone...
      expect(indexXml).toContain('<ectd:ectd');
      for (const el of ['<m2-common-technical-document-summaries>', '<m3-quality>', '<m4-nonclinical-study-reports>', '<m5-clinical-study-reports>']) {
        expect(indexXml).toContain(el);
      }
      // ...and the module-1 leaf goes to the REGIONAL backbone, not index.xml.
      expect(Object.keys(zip.files).some((n) => /m1\/us\/us-regional\.xml$/.test(n))).toBe(true);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
