/**
 * Honest-state for the widened regions' Module 1 backbone.
 *
 * The packager writes `m1/uk/uk-regional.xml` for the UK but builds it with the
 * EMA backbone builder, so the file is an `<eu-regional>` placeholder — not an
 * MHRA-conformant M1. This proves (1) the classification is honest for all 12
 * regions, (2) the packager actually stamps it on the bundle, (3) the pre-transmit
 * gate surfaces a placeholder always and blocks a production transmit only when
 * enforcement is opted in — and (4) the check is shown FAILING on the case it
 * exists to catch, not only passing.
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

describe('classifyRegionalBackbone', () => {
  it('only fda / ema / pmda / ca are region-conformant', () => {
    for (const r of ['fda', 'ema', 'pmda', 'ca'] as Region[]) {
      expect(classifyRegionalBackbone(r, `m1/x/${r}-regional.xml`).regionConformant).toBe(true);
    }
  });
  it('the eight widened regions are EMA-structure placeholders, never conformant', () => {
    for (const r of ['uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as Region[]) {
      const s = classifyRegionalBackbone(r, `m1/${r}/${r}-regional.xml`);
      expect(s.regionConformant).toBe(false);
      expect(s.placeholderOf).toBe('ema');
    }
  });
});

describe('the packager stamps the status on the bundle (and the file really is an EU placeholder)', () => {
  it('uk: regionConformant=false, placeholderOf=ema, and uk-regional.xml carries an <eu-regional> root', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rb-uk-'));
    try {
      const bundle = await packageLeafBytes({
        region: 'uk', applicationId: 'APP1', sequence: '0000', submissionType: 'original',
        sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
        leaves: [{ ctdSection: '3.2.P.1', fileName: 'dp.pdf', bytes: pdf('dp'), title: 'DP' }],
      });
      expect(bundle.regionalBackbone).toEqual({
        region: 'uk', file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 'ema',
      });
      // The honesty claim is grounded in the bytes: the UK file IS an EU backbone.
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const ukXml = await zip.file('m1/uk/uk-regional.xml')!.async('string');
      expect(ukXml).toContain('<eu-regional');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
  it('fda: regionConformant=true with no placeholder', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rb-fda-'));
    try {
      const bundle = await packageLeafBytes({
        region: 'fda', applicationId: 'IND1', sequence: '0000', submissionType: 'original',
        sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
        leaves: [{ ctdSection: '3.2.P.1', fileName: 'dp.pdf', bytes: pdf('dp'), title: 'DP' }],
      });
      expect(bundle.regionalBackbone?.regionConformant).toBe(true);
      expect(bundle.regionalBackbone?.placeholderOf).toBeUndefined();
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});

describe('evaluateRegionalBackboneGate', () => {
  const placeholder = { region: 'uk' as Region, file: 'm1/uk/uk-regional.xml', regionConformant: false, placeholderOf: 'ema' as Region };
  const conformant = { region: 'fda' as Region, file: 'm1/us/us-regional.xml', regionConformant: true };

  it('a placeholder is ALWAYS surfaced (failing check + warning), even when not enforced', () => {
    const g = evaluateRegionalBackboneGate({ status: placeholder, environment: 'production', required: false });
    expect(g.check?.passed).toBe(false);
    expect(g.blockers).toEqual([]);
    expect(g.warnings.some((w) => /NOT an UK-conformant/.test(w))).toBe(true);
  });
  it('FAILS CLOSED: blocks a production transmit of a placeholder when enforcement is on', () => {
    const g = evaluateRegionalBackboneGate({ status: placeholder, environment: 'production', required: true });
    expect(g.blockers).toHaveLength(1);
    expect(g.blockers[0]).toMatch(/ECTD_REQUIRE_REGIONAL_BACKBONE blocks/);
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
