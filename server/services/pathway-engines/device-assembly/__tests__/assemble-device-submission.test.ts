import { describe, it, expect } from 'vitest';
import { assembleDeviceSubmission } from '../assemble-device-submission';
import type { EstarInputLeaf } from '../../estar/estar-mapper';

// Leaves that satisfy every REQUIRED 510(k) eSTAR section (per estar-mapper).
// All finalized/substantive content.
const complete510kLeaves: EstarInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter', substantive: true },
  { sectionCode: '2', title: 'Indications for use', substantive: true },
  { sectionCode: '3', title: 'Device description', substantive: true },
  { sectionCode: '4', title: 'Proposed labeling and instructions for use', substantive: true },
  { sectionCode: '5', title: 'Biocompatibility evaluation', substantive: true },
  { sectionCode: '6', title: 'Performance testing — bench', substantive: true },
  { sectionCode: '7', title: 'Substantial equivalence comparison to predicate', substantive: true },
  { sectionCode: '1b', title: 'CDRH cover sheet 3514', substantive: true },
  { sectionCode: '1c', title: 'MDUFA user fee cover sheet 3601', substantive: true },
  { sectionCode: '2b', title: 'Truthful and accurate statement', substantive: true },
  { sectionCode: '4b', title: 'Risk management file', substantive: true },
  { sectionCode: '8', title: '510(k) Summary', substantive: true },
];

/* A device that is none of the seven conditional things. Without these the
   conditional sections are undetermined, and an undetermined section blocks a
   claim that the submission is assemblable (W1-5). */
const PLAIN_DEVICE = {
  combinationProduct: false,
  softwareAiMl: false,
  cyberDevice: false,
  sterile: false,
  implantable: false,
  cliaWaived: false,
  clinicalData: false,
} as const;

const TEMPLATE_510K_DEVICE = 'eSTAR-510k-non-ivd.pdf';

describe('assembleDeviceSubmission (B5)', () => {
  it('produces an official eSTAR when sections complete AND the template is present', () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      presentTemplates: [TEMPLATE_510K_DEVICE],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.canProduceOfficialEstar).toBe(true);
    expect(r.artifactKind).toBe('official-estar');
    expect(r.estar.summary.ready).toBe(true);
    expect(r.template.available).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('falls back to a draft content package (not submittable) when the official template is missing', () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.canProduceOfficialEstar).toBe(false);
    expect(r.artifactKind).toBe('content-package-draft');
    // The assembled kind never names itself an eSTAR (ESTAR-06): an eSTAR is
    // an FDA-issued dynamic PDF, and the registry has no template to fill.
    expect(r.artifactKind).not.toMatch(/estar/i);
    expect(r.blockers.join(' ')).toMatch(/Cannot produce a submittable eSTAR/);
  });

  it('reports missing required sections as blockers', () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: [{ sectionCode: '1', title: 'Cover letter', substantive: true }],
      presentTemplates: [TEMPLATE_510K_DEVICE],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.canProduceOfficialEstar).toBe(false);
    expect(r.estar.summary.ready).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/required eSTAR section\(s\) missing/);
    // Content exists, so a draft is still producible.
    expect(r.artifactKind).toBe('content-package-draft');
  });

  it("returns 'none' when there is no content at all", () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: [],
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.artifactKind).toBe('none');
    expect(r.canProduceOfficialEstar).toBe(false);
  });

  it('never blocks on a missing template in staging / when not required (report-only)', () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      presentTemplates: [],
      environment: 'staging',
      requireTemplate: true,
    });
    // staging: template gate is report-only, so no template blocker — but the
    // template still isn't available, so we cannot claim an official eSTAR.
    expect(r.template.available).toBe(false);
    expect(r.canProduceOfficialEstar).toBe(false);
    expect(r.artifactKind).toBe('content-package-draft');
  });

  it('overlays market readiness and surfaces the honest cannot-transmit blocker', () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      presentTemplates: [TEMPLATE_510K_DEVICE],
      market: 'us-fda',
      availableArtifacts: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.market).toBeDefined();
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(r.provenance.modules).toContain('global-markets/market-readiness');
  });

  it('de-duplicates blockers and records provenance', () => {
    const r = assembleDeviceSubmission({
      pathway: 'de_novo',
      variant: 'ivd',
      leaves: [],
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(new Set(r.blockers).size).toBe(r.blockers.length);
    expect(typeof r.provenance.generatedAt).toBe('string');
    expect(r.provenance.modules).toContain('pathway-engines/estar/estar-mapper');
  });
});

// ── PMA (21 CFR 814) through the same assembly contract ──────────────────────
//
// A PMA authored in the governed editor is scaffolded from the pma:fda rule
// pack (fda-pma-21cfr814-20-v1.0). Before this, `pathway` admitted only
// '510k' | 'de_novo': a PMA forced through was scored against the 510(k)
// eSTAR slots ("substantial-equivalence missing" on a Class III application).
// These leaves are shaped exactly like that pack's labels and keys.

/**
 * The template a PMA device filing is produced on. It is the nIVD eSTAR — the
 * SAME physical PDF the 510(k) uses — because FDA ships one nIVD form and one
 * IVD form, each carrying 510(k), De Novo and PMA (assets/estar-templates/README.md).
 * This read 'eSTAR-pma-non-ivd.pdf' until 2026-09-04, a name FDA does not
 * publish, which is what let the PMA descriptor sit unvendored and unproducible
 * while the file it needs had been on disk since Phase 1.
 */
const TEMPLATE_PMA_DEVICE = 'eSTAR-510k-non-ivd.pdf';

/** The pack's root sections (one leaf per 814.20 module) plus the G.5 statistics leaf. */
const pmaRootLeaves: EstarInputLeaf[] = [
  { sectionCode: 'A', title: 'A · Administrative information (21 CFR 814.20(b)(1)–(2))', substantive: true },
  { sectionCode: 'B', title: 'B · Summary of safety and effectiveness data (21 CFR 814.20(b)(3))', substantive: true },
  { sectionCode: 'C', title: 'C · Complete device description (21 CFR 814.20(b)(4)(i))', substantive: true },
  { sectionCode: 'D', title: 'D · Manufacturing, processing, packing, storage and installation (814.20(b)(4)(v))', substantive: true },
  { sectionCode: 'F', title: 'F · Nonclinical laboratory studies (21 CFR 814.20(b)(6)(i))', substantive: true },
  { sectionCode: 'G', title: 'G · Clinical investigations (21 CFR 814.20(b)(6)(ii))', substantive: true },
  { sectionCode: 'H', title: 'H · Proposed labeling (21 CFR 814.20(b)(10))', substantive: true },
  { sectionCode: 'G.5', title: 'Statistical analysis plan and results', substantive: true },
];

/** Only CHILD sections authored — the roots are folders a sponsor rarely writes into. */
const pmaChildLeaves: EstarInputLeaf[] = [
  { sectionCode: 'A.3', title: 'Cover letter and application type (original / panel-track / 180-day / real-time)', substantive: true },
  { sectionCode: 'B.1', title: 'Indications for use', substantive: true },
  { sectionCode: 'C.1', title: 'Functional components, properties and principles of operation', substantive: true },
  { sectionCode: 'D.1', title: 'Manufacturing process flow and process controls', substantive: true },
  { sectionCode: 'F.1', title: 'Biocompatibility — ISO 10993 series', substantive: true },
  { sectionCode: 'G.1', title: 'Study protocols and amendments', substantive: true },
  { sectionCode: 'G.5', title: 'Statistical analysis plan and results', substantive: true },
  { sectionCode: 'H.1', title: 'Instructions for use / physician labeling', substantive: true },
];

describe('assembleDeviceSubmission — PMA pathway', () => {
  it('scores a PMA against the PMA modules (pma-mapper), never the 510(k) eSTAR slots', () => {
    const r = assembleDeviceSubmission({
      pathway: 'pma',
      variant: 'device',
      leaves: pmaRootLeaves,
      presentTemplates: [TEMPLATE_PMA_DEVICE],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.pathway).toBe('pma');
    expect(r.estar.summary.ready).toBe(true);
    expect(r.artifactKind).toBe('official-estar');
    expect(r.blockers).toHaveLength(0);
    expect(r.provenance.modules).toContain('pathway-engines/pma/pma-mapper');
    expect(r.provenance.modules).not.toContain('pathway-engines/estar/estar-mapper');
    // The section ids are the PMA modules, not eSTAR's.
    expect(r.estar.sections.map((s) => s.id)).toContain('ssed-summary');
    expect(r.estar.sections.map((s) => s.id)).not.toContain('substantial-equivalence');
  });

  it('a complete PMA with no vendored template is a draft content package with the honest template blocker', () => {
    const r = assembleDeviceSubmission({
      pathway: 'pma',
      variant: 'device',
      leaves: pmaRootLeaves,
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.artifactKind).toBe('content-package-draft');
    expect(r.canProduceOfficialEstar).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/Cannot produce a submittable eSTAR/);
    expect(r.blockers.join(' ')).toContain(TEMPLATE_PMA_DEVICE);
    expect(r.blockers.join(' ')).not.toMatch(/section\(s\) missing/);
  });

  it('a PMA without its statistical analysis is blocked on exactly that module', () => {
    const r = assembleDeviceSubmission({
      pathway: 'pma',
      variant: 'device',
      leaves: pmaRootLeaves.filter((l) => l.sectionCode !== 'G.5'),
      presentTemplates: [TEMPLATE_PMA_DEVICE],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.estar.summary.missingRequired).toEqual(['statistical-analysis']);
    expect(r.blockers.join(' ')).toMatch(/required eSTAR section\(s\) missing: statistical-analysis/);
    expect(r.artifactKind).toBe('content-package-draft');
  });

  it('a 30-day notice owes only administrative + manufacturing content (814.39(f))', () => {
    const r = assembleDeviceSubmission({
      pathway: 'pma',
      pmaSubmissionType: '30_day_notice',
      variant: 'device',
      leaves: pmaRootLeaves.filter((l) => l.sectionCode === 'A' || l.sectionCode === 'D'),
      presentTemplates: [TEMPLATE_PMA_DEVICE],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.estar.summary.ready).toBe(true);
    expect(r.artifactKind).toBe('official-estar');
  });

  it("the pack's CHILD sections, keyed by their 814.20 letters, satisfy the PMA modules (a sponsor authors leaves, not folders)", () => {
    const r = assembleDeviceSubmission({
      pathway: 'pma',
      variant: 'device',
      leaves: pmaChildLeaves,
      presentTemplates: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.estar.summary.missingRequired).toEqual([]);
    expect(r.artifactKind).toBe('content-package-draft');
  });
});
