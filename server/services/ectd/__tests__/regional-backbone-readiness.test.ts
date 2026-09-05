/**
 * Honest-state for every region's Module 1 backbone.
 *
 * Only FDA's backbone is built to the agency's Module 1 structure. EMA / PMDA /
 * Health Canada have their own root element but file every Module 1 leaf FLAT
 * under the container; the eight widened regions reuse the EMA builder outright
 * (`uk-regional.xml` carries an `<eu-regional>` root). This proves (1) the
 * classification is honest for all 12 regions, (2) the packager actually stamps
 * it on the bundle, (3) the claims are grounded in the BYTES the packager
 * writes, (4) the pre-transmit gate surfaces every non-conformant backbone and
 * blocks a production transmit only when enforcement is opted in — and (5) the
 * check is shown FAILING on the cases it exists to catch, not only passing.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {
  classifyRegionalBackbone,
  evaluateRegionalBackboneGate,
  regionalBackboneRequiredFromEnv,
} from '../regional-backbone-readiness';
import { packageLeafBytes } from '../package-leaf-bytes';
import type { Region } from '../../submission-gateways/types';

const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

async function packageFor(region: Region) {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `rb-${region}-`));
  const bundle = await packageLeafBytes({
    region, applicationId: 'APP1', sequence: '0000', submissionType: 'original',
    sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
    leaves: [
      { ctdSection: '1.2', fileName: 'cover.pdf', bytes: pdf('cover'), title: 'Cover' },
      { ctdSection: '3.2.P.1', fileName: 'dp.pdf', bytes: pdf('dp'), title: 'DP' },
    ],
  });
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  await fs.rm(outputDir, { recursive: true, force: true });
  return { bundle, zip };
}

describe('classifyRegionalBackbone', () => {
  it('only FDA is region-conformant (built to the published FDA Module 1 heading table)', () => {
    expect(classifyRegionalBackbone('fda', 'm1/us/us-regional.xml')).toEqual({
      region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true,
    });
  });
  it('EMA / PMDA / Health Canada are NOT conformant: own root element, but Module 1 is flat — with the gap stated', () => {
    for (const r of ['ema', 'pmda', 'ca'] as Region[]) {
      const s = classifyRegionalBackbone(r, `m1/x/${r}-regional.xml`);
      expect(s.regionConformant, r).toBe(false);
      expect(s.placeholderOf, r).toBeUndefined();
      expect(s.conformanceGap, r).toMatch(/filed flat under/);
      expect(s.conformanceGap, r).toMatch(/DTD structure/);
    }
  });
  it('the eight widened regions are EMA-structure placeholders, never conformant', () => {
    for (const r of ['uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as Region[]) {
      const s = classifyRegionalBackbone(r, `m1/${r}/${r}-regional.xml`);
      expect(s.regionConformant).toBe(false);
      expect(s.placeholderOf).toBe('ema');
      expect(s.conformanceGap).toBeUndefined();
    }
  });
});

describe('the packager stamps the status on the bundle, and the bytes bear the claim out', () => {
  it('fda: conformant, and the Module 1 leaf sits under a published heading element, not directly under the container', async () => {
    const { bundle, zip } = await packageFor('fda');
    expect(bundle.regionalBackbone).toEqual({ region: 'fda', file: 'm1/us/us-regional.xml', regionConformant: true });
    const us = await zip.file('m1/us/us-regional.xml')!.async('string');
    expect(us).toMatch(/<m1-2-cover-letters>\s*<leaf/);
    expect(us).not.toMatch(/<m1-regional>\s*<leaf/);
  });
  it('ema: NOT conformant — eu-regional.xml really does file the Module 1 leaf flat under <m1-eu>', async () => {
    const { bundle, zip } = await packageFor('ema');
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    expect(bundle.regionalBackbone?.conformanceGap).toMatch(/flat under <m1-eu>/);
    const eu = await zip.file('m1/eu/eu-regional.xml')!.async('string');
    expect(eu).toMatch(/<m1-eu>\s*<leaf/); // the gap, in the bytes
  });
  it('pmda: NOT conformant — jp-regional.xml files the Module 1 leaf flat under <m1-jp>', async () => {
    const { bundle, zip } = await packageFor('pmda');
    expect(bundle.regionalBackbone?.regionConformant).toBe(false);
    const jp = await zip.file('m1/jp/jp-regional.xml')!.async('string');
    expect(jp).toMatch(/<m1-jp>\s*<leaf/);
  });
  it('uk: placeholderOf=ema, and uk-regional.xml carries an <eu-regional> root', async () => {
    const { bundle, zip } = await packageFor('uk');
    expect(bundle.regionalBackbone).toEqual({
      region: 'uk', file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 'ema',
    });
    const ukXml = await zip.file('m1/uk/uk-regional.xml')!.async('string');
    expect(ukXml).toContain('<eu-regional');
  });
});

describe('evaluateRegionalBackboneGate', () => {
  const placeholder = { region: 'uk' as Region, file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 'ema' as Region };
  const flat = classifyRegionalBackbone('ema', 'm1/eu/eu-regional.xml');
  const conformant = { region: 'fda' as Region, file: 'm1/us/us-regional.xml', regionConformant: true };

  it('a placeholder is ALWAYS surfaced (failing check + warning), even when not enforced', () => {
    const g = evaluateRegionalBackboneGate({ status: placeholder, environment: 'production', required: false });
    expect(g.check?.passed).toBe(false);
    expect(g.blockers).toEqual([]);
    expect(g.warnings.some((w) => /NOT an UK-conformant/.test(w) && /placeholder/.test(w))).toBe(true);
  });
  it('a flat-Module-1 backbone is ALWAYS surfaced with its specific gap', () => {
    const g = evaluateRegionalBackboneGate({ status: flat, environment: 'staging', required: false });
    expect(g.check?.passed).toBe(false);
    expect(g.check?.detail).toMatch(/not region-conformant: its Module 1 leaves are filed flat under <m1-eu>/);
    expect(g.warnings).toHaveLength(1);
    expect(g.warnings[0]).toMatch(/NOT an EMA-conformant Module 1 backbone — its Module 1 leaves are filed flat/);
  });
  it('FAILS CLOSED: blocks a production transmit of a placeholder OR a flat backbone when enforcement is on', () => {
    for (const status of [placeholder, flat]) {
      const g = evaluateRegionalBackboneGate({ status, environment: 'production', required: true });
      expect(g.blockers).toHaveLength(1);
      expect(g.blockers[0]).toMatch(/ECTD_REQUIRE_REGIONAL_BACKBONE blocks/);
    }
  });
  it('does not block staging even when enforced (report-only there)', () => {
    const g = evaluateRegionalBackboneGate({ status: placeholder, environment: 'staging', required: true });
    expect(g.blockers).toEqual([]);
    expect(g.warnings).toHaveLength(1);
  });
  it('a conformant region passes cleanly', () => {
    const g = evaluateRegionalBackboneGate({ status: conformant, environment: 'production', required: true });
    expect(g.check?.passed).toBe(true);
    expect(g.blockers).toEqual([]);
    expect(g.warnings).toEqual([]);
  });
  it('a required flag with no status is a warning (cannot prove conformance), not a silent pass', () => {
    const g = evaluateRegionalBackboneGate({ status: undefined, environment: 'production', required: true });
    expect(g.warnings).toHaveLength(1);
    expect(g.check).toBeUndefined();
  });
  it('the env flag is true only for the literal "true"', () => {
    expect(regionalBackboneRequiredFromEnv({ ECTD_REQUIRE_REGIONAL_BACKBONE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(regionalBackboneRequiredFromEnv({ ECTD_REQUIRE_REGIONAL_BACKBONE: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(regionalBackboneRequiredFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
