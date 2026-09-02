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
];

const TEMPLATE_510K_DEVICE = 'eSTAR-510k-non-ivd.pdf';

describe('assembleDeviceSubmission (B5)', () => {
  it('produces an official eSTAR when sections complete AND the template is present', () => {
    const r = assembleDeviceSubmission({
      pathway: '510k',
      variant: 'device',
      leaves: complete510kLeaves,
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
