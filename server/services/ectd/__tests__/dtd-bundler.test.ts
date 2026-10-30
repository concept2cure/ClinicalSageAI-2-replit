/**
 * Tests for the eCTD DTD bundler + readiness gate (audit gap P0-1).
 * Pure logic + a no-throw directory read against a temp dir.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  ICH_BACKBONE_DTD,
  requiredDtdsForRegion,
  listVendoredDtds,
  assessDtdReadiness,
  dtdRequiredFromEnv,
  ICH_BACKBONE_STYLESHEET,
  requiredStylesheetsForRegion,
  listVendoredStylesheets,
  hasPassedPackageDtdValidation,
  type DtdRegion,
} from '../dtd-bundler';
import { classifyRegionalBackbone } from '../regional-backbone-readiness';
import type { Region } from '../../submission-gateways/types';
import { syntheticDtdStatus } from './_dtd-validation-fixture';

describe('requiredDtdsForRegion', () => {
  it('always includes the ICH backbone plus the regional DTD', () => {
    expect(requiredDtdsForRegion('fda')).toEqual([ICH_BACKBONE_DTD, 'us-regional-v3-3.dtd']);
    expect(requiredDtdsForRegion('ema')).toEqual([ICH_BACKBONE_DTD, 'eu-regional.dtd']);
    expect(requiredDtdsForRegion('pmda')).toEqual([ICH_BACKBONE_DTD, 'jp-regional.dtd']);
    expect(requiredDtdsForRegion('ca')).toEqual([ICH_BACKBONE_DTD, 'ca-regional.dtd']);
  });

  it('requires eu-regional.dtd for every widened region (they build the EMA backbone)', () => {
    // These 8 regions route through buildEmaBackbone, whose DOCTYPE is
    // eu-regional.dtd — so a self-contained package MUST ship it. Under-reporting
    // (returning only the ICH backbone) is the P0-1 gate bypass this guards.
    for (const region of ['uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as const) {
      expect(requiredDtdsForRegion(region)).toEqual([ICH_BACKBONE_DTD, 'eu-regional.dtd']);
    }
  });
});

describe('listVendoredDtds', () => {
  it('returns [] for a missing directory without throwing', async () => {
    const out = await listVendoredDtds(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
    expect(out).toEqual([]);
  });

  describe('with a populated drop-point', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dtd-test-'));
      await fs.writeFile(path.join(dir, 'ich-ectd-3-2.dtd'), '<!-- ich -->');
      await fs.writeFile(path.join(dir, 'us-regional-v3-3.dtd'), '<!-- us -->');
      await fs.writeFile(path.join(dir, 'README.md'), 'not a dtd'); // must be ignored
    });
    afterAll(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('lists only *.dtd files, sorted', async () => {
      const out = await listVendoredDtds(dir);
      expect(out.map((d) => d.fileName)).toEqual(['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd']);
      expect(out[0].bytes.toString()).toContain('ich');
    });
  });
});

describe('assessDtdReadiness', () => {
  it('blocks a production FDA package missing the regional DTD when required', () => {
    const r = assessDtdReadiness({
      region: 'fda',
      present: [ICH_BACKBONE_DTD],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(false);
    expect(r.missing).toEqual(['us-regional-v3-3.dtd']);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toContain('us-regional-v3-3.dtd');
  });

  it('clears when every required DTD is present', () => {
    const r = assessDtdReadiness({
      region: 'ema',
      present: [ICH_BACKBONE_DTD, 'eu-regional.dtd'],
      presentStylesheets: ['ectd-2-0.xsl'],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('does NOT block when DTDs are not required (graceful default), but still reports missing', () => {
    const r = assessDtdReadiness({ region: 'fda', present: [], environment: 'production', requireDtd: false });
    expect(r.cleared).toBe(true);
    expect(r.selfContained).toBe(false);
    expect(r.missing.length).toBe(2);
  });

  it('does NOT block staging even when required', () => {
    const r = assessDtdReadiness({ region: 'pmda', present: [], environment: 'staging', requireDtd: true });
    expect(r.cleared).toBe(true);
  });

  it('blocks a production widened-region (kr) package missing eu-regional.dtd', () => {
    // Regression guard: kr builds the EMA backbone, so a production package that
    // ships only the ICH backbone is NOT self-contained. Before the region map
    // was completed this cleared incorrectly (kr required only the ICH DTD).
    const r = assessDtdReadiness({
      region: 'kr',
      present: [ICH_BACKBONE_DTD],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(false);
    expect(r.missing).toEqual(['eu-regional.dtd']);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toContain('eu-regional.dtd');
  });

  it('does not claim exact package SYSTEM paths resolve to uppercase filenames', () => {
    const r = assessDtdReadiness({
      region: 'fda',
      present: ['ICH-ECTD-3-2.DTD', 'US-REGIONAL-V3-3.DTD'],
      presentStylesheets: ['ECTD-2-0.XSL', 'US-REGIONAL.XSL'],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(false);
    expect(r.missing).toEqual([ICH_BACKBONE_DTD, 'us-regional-v3-3.dtd']);
  });
});

describe('dtdRequiredFromEnv', () => {
  it('is true only for the literal "true"', () => {
    expect(dtdRequiredFromEnv({ ECTD_REQUIRE_DTD: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(dtdRequiredFromEnv({ ECTD_REQUIRE_DTD: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(dtdRequiredFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('stylesheet self-containment — the second hole the DTD gate did not cover', () => {
  // The FDA backbone emits <?xml-stylesheet href="…/util/style/us-regional.xsl"?>
  // and index.xml references util/style/ectd-2-0.xsl, yet nothing bundled *.xsl
  // and the readiness gate only ever looked at *.dtd. A package could clear the
  // gate while referencing a stylesheet it did not contain. Stylesheets are now
  // part of the same self-containment verdict, under the same flag.
  it('requires the ICH stylesheet everywhere and the FDA regional stylesheet only for fda', () => {
    expect(requiredStylesheetsForRegion('fda')).toEqual([ICH_BACKBONE_STYLESHEET, 'us-regional.xsl']);
    expect(requiredStylesheetsForRegion('ema')).toEqual([ICH_BACKBONE_STYLESHEET]);
    expect(requiredStylesheetsForRegion('kr')).toEqual([ICH_BACKBONE_STYLESHEET]);
  });

  it('listVendoredStylesheets lists only *.xsl and returns [] for a missing directory', async () => {
    expect(await listVendoredStylesheets(path.join(os.tmpdir(), 'no-such-' + Date.now()))).toEqual([]);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xsl-test-'));
    try {
      await fs.writeFile(path.join(dir, 'ectd-2-0.xsl'), '<xsl:stylesheet/>');
      await fs.writeFile(path.join(dir, 'ich-ectd-3-2.dtd'), '<!-- dtd -->');
      await fs.writeFile(path.join(dir, 'notes.txt'), 'x');
      const out = await listVendoredStylesheets(dir);
      expect(out.map((f) => f.fileName)).toEqual(['ectd-2-0.xsl']);
      expect(out[0].bytes.toString()).toBe('<xsl:stylesheet/>');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('a production package with every DTD but no stylesheet is NOT self-contained when required', () => {
    const r = assessDtdReadiness({
      region: 'fda',
      present: [ICH_BACKBONE_DTD, 'us-regional-v3-3.dtd'],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.missing).toEqual([]); // the DTD side is complete —
    expect(r.missingStylesheets).toEqual([ICH_BACKBONE_STYLESHEET, 'us-regional.xsl']); // — the stylesheet side is not
    expect(r.selfContained).toBe(false);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toContain('ectd-2-0.xsl');
  });

  it('requires the exact stylesheet case used by package processing instructions', () => {
    const r = assessDtdReadiness({
      region: 'fda',
      present: [ICH_BACKBONE_DTD, 'us-regional-v3-3.dtd'],
      presentStylesheets: ['ECTD-2-0.XSL', 'us-regional.xsl'],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.missingStylesheets).toEqual([ICH_BACKBONE_STYLESHEET]);
    expect(r.selfContained).toBe(false);
    expect(r.cleared).toBe(false);
  });

  it('report-only when not required: names the missing stylesheets but does not block', () => {
    const r = assessDtdReadiness({ region: 'ema', present: [], environment: 'production', requireDtd: false });
    expect(r.cleared).toBe(true);
    expect(r.selfContained).toBe(false);
    expect(r.requiredStylesheets).toEqual([ICH_BACKBONE_STYLESHEET]);
    expect(r.missingStylesheets).toEqual([ICH_BACKBONE_STYLESHEET]);
  });
});

describe('STF stylesheet self-containment — current FDA stylesheet 2.3', () => {
  // The current FDA standards page names this file; keep this oracle separate
  // from the bundler's exported filename so a drift cannot bless itself.
  const currentStfStylesheet = 'ich-stf-stylesheet-2-3.xsl';
  const completeDtds = ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd', 'ich-stf-v2-2.dtd'];
  const backboneStylesheets = ['ectd-2-0.xsl', 'us-regional.xsl'];

  it('requires the current STF stylesheet only when the package generates an STF', () => {
    expect(requiredStylesheetsForRegion('fda', true)).toEqual([
      'ectd-2-0.xsl', 'us-regional.xsl', currentStfStylesheet,
    ]);
    expect(requiredStylesheetsForRegion('ema', true)).toEqual(['ectd-2-0.xsl', currentStfStylesheet]);
    expect(requiredStylesheetsForRegion('fda', false)).toEqual(backboneStylesheets);
    expect(requiredStylesheetsForRegion('fda')).toEqual(backboneStylesheets);
  });

  it('refuses required production when the DTDs and backbone stylesheets exist but the STF stylesheet does not', () => {
    const result = assessDtdReadiness({ region: 'fda', present: completeDtds,
      presentStylesheets: backboneStylesheets, hasStudyTaggingFiles: true,
      environment: 'production', requireDtd: true });
    expect(result.missing).toEqual([]);
    expect(result.missingStylesheets).toEqual([currentStfStylesheet]);
    expect(result.selfContained).toBe(false);
    expect(result.cleared).toBe(false);
    expect(result.blockers.join(' ')).toContain(currentStfStylesheet);
  });

  it('clears the same STF-bearing package when the exact current stylesheet is present', () => {
    const result = assessDtdReadiness({ region: 'fda', present: completeDtds,
      presentStylesheets: [...backboneStylesheets, currentStfStylesheet], hasStudyTaggingFiles: true,
      environment: 'production', requireDtd: true });
    expect(result.requiredStylesheets).toEqual([...backboneStylesheets, currentStfStylesheet]);
    expect(result.missingStylesheets).toEqual([]);
    expect(result.selfContained).toBe(true);
    expect(result.cleared).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it.each(['ich-stf-stylesheet.xsl', 'ICH-STF-STYLESHEET-2-3.XSL'])(
    'does not substitute the older sample filename or different case (%s)', filename => {
      const result = assessDtdReadiness({ region: 'fda', present: completeDtds,
        presentStylesheets: [...backboneStylesheets, filename], hasStudyTaggingFiles: true,
        environment: 'production', requireDtd: true });
      expect(result.missingStylesheets).toEqual([currentStfStylesheet]);
      expect(result.cleared).toBe(false);
    },
  );

  it.each([
    { environment: 'staging' as const, requireDtd: true },
    { environment: 'production' as const, requireDtd: false },
  ])('retains the report-only posture while naming the missing STF stylesheet (%o)', posture => {
    const result = assessDtdReadiness({ region: 'fda', present: completeDtds,
      presentStylesheets: backboneStylesheets, hasStudyTaggingFiles: true, ...posture });
    expect(result.missingStylesheets).toEqual([currentStfStylesheet]);
    expect(result.selfContained).toBe(false);
    expect(result.cleared).toBe(true);
  });

  it('keeps an otherwise complete non-STF package clear without the STF stylesheet', () => {
    const result = assessDtdReadiness({ region: 'fda',
      present: ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd'], presentStylesheets: backboneStylesheets,
      hasStudyTaggingFiles: false, environment: 'production', requireDtd: true });
    expect(result.requiredStylesheets).toEqual(backboneStylesheets);
    expect(result.missingStylesheets).toEqual([]);
    expect(result.selfContained).toBe(true);
    expect(result.cleared).toBe(true);
  });
});

describe('retained STF proof still needs the current mandatory supportive files', () => {
  const stfPath = 'm5/5-3-5-1/study-1/stf-study-1.xml';

  function completeStfProof() {
    const proof = syntheticDtdStatus();
    proof.required.push('ich-stf-v2-2.dtd');
    proof.present.push('ich-stf-v2-2.dtd');
    proof.requiredStylesheets.push('ich-stf-stylesheet-2-3.xsl');
    proof.presentStylesheets.push('ich-stf-stylesheet-2-3.xsl');
    proof.validation.integrity.verified.push('ich-stf-v2-2.dtd', 'ich-stf-stylesheet-2-3.xsl');
    proof.validation.expectedFiles.push(stfPath);
    proof.validation.files.push({ ...proof.validation.files[0], relPath: stfPath });
    return proof;
  }

  it('refuses otherwise complete historical STF proof that omits the current stylesheet from its inventories', () => {
    const proof = completeStfProof();
    proof.requiredStylesheets = proof.requiredStylesheets.filter(name => name !== 'ich-stf-stylesheet-2-3.xsl');
    proof.presentStylesheets = proof.presentStylesheets.filter(name => name !== 'ich-stf-stylesheet-2-3.xsl');
    proof.validation.integrity.verified = proof.validation.integrity.verified.filter(name => name !== 'ich-stf-stylesheet-2-3.xsl');
    expect(proof.validation.passed).toBe(true);
    expect(proof.selfContained).toBe(true);
    expect(hasPassedPackageDtdValidation(proof, 1)).toBe(false);
  });

  it('refuses otherwise complete STF proof that omits the STF DTD from its inventories', () => {
    const proof = completeStfProof();
    proof.required = proof.required.filter(name => name !== 'ich-stf-v2-2.dtd');
    proof.present = proof.present.filter(name => name !== 'ich-stf-v2-2.dtd');
    proof.validation.integrity.verified = proof.validation.integrity.verified.filter(name => name !== 'ich-stf-v2-2.dtd');
    expect(proof.validation.passed).toBe(true);
    expect(proof.selfContained).toBe(true);
    expect(hasPassedPackageDtdValidation(proof, 1)).toBe(false);
  });

  it('accepts the complete STF proof with current DTD, stylesheet and exact file coverage', () => {
    expect(hasPassedPackageDtdValidation(completeStfProof(), 1)).toBe(true);
  });

  it('keeps complete non-STF proof valid without adding unused STF supportive files', () => {
    const proof = syntheticDtdStatus();
    expect(proof.required).not.toContain('ich-stf-v2-2.dtd');
    expect(proof.requiredStylesheets).not.toContain('ich-stf-stylesheet-2-3.xsl');
    expect(hasPassedPackageDtdValidation(proof, 0)).toBe(true);
  });
});

/**
 * SELF-CONTAINMENT IS NOT CONFORMANCE.
 *
 * This assertion lives here, on the DTD gate, because this is where the two get
 * conflated. `dtdStatus.selfContained` is the readiness signal a compile surface
 * reads to decide whether a package is fit to file, and the whole DTD
 * procurement is described as the thing that unblocks eCTD. Both are true and
 * neither means the package will VALIDATE: vendoring the DTDs makes a package
 * carry the grammar it points at, and eleven of the twelve regional Module 1
 * backbones are not written to that grammar (regional-backbone-readiness.ts).
 * Dropping the licensed files in therefore turns "cannot be validated" into
 * "fails validation" for those eleven — an improvement in honesty, not in
 * conformance.
 *
 * Pinned so that a later change cannot quietly let a cleared DTD gate stand in
 * for a conformance claim, and so the region conformance work is not treated as
 * finished by the procurement that does not do it.
 */
describe('a fully vendored drop-point clears the DTD gate WITHOUT making a region conformant', () => {
  const ALL: DtdRegion[] = ['fda', 'ema', 'pmda', 'ca', 'uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'];

  it.each(ALL)('%s: DTD gate cleared with every required file present', (region) => {
    const r = assessDtdReadiness({
      region,
      present: requiredDtdsForRegion(region),
      presentStylesheets: requiredStylesheetsForRegion(region),
      environment: 'production',
      requireDtd: true, // the strictest posture available
    });
    expect(r.selfContained).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('yet only FDA can be region-conformant — the DTDs do not close the other eleven', () => {
    /* This expected ['fda'] from classifying by region alone, which was the
       defect (sweep F06, 2026-10-01): no region is conformant by region alone
       now, and with a clean build report only FDA is. */
    const byRegionAlone = ALL.filter((r) => classifyRegionalBackbone(r as Region, `m1/x/${r}-regional.xml`).regionConformant);
    expect(byRegionAlone).toEqual([]);
    const withCleanReport = ALL.filter((r) => classifyRegionalBackbone(r as Region,
      r === 'fda' ? 'm1/us/us-regional.xml' : `m1/x/${r}-regional.xml`, [], syntheticDtdStatus().validation).regionConformant);
    expect(withCleanReport).toEqual(['fda']);
  });
});
