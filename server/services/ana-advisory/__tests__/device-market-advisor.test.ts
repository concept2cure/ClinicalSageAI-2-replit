/**
 * Tests for the AnA device & global-market advisory module.
 *
 * Covers:
 *   - device readiness: submittable vs not-submittable advice; blockers surfaced
 *   - global market strategy: ranking reflects readiness; cannot-transmit honesty;
 *     local-rep + assemble flags; unknown markets
 *   - tool specs are well-formed (name + description + schema present)
 */

import { describe, it, expect } from 'vitest';

import {
  adviseDeviceReadiness,
  adviseGlobalMarketStrategy,
  ANA_ADVISORY_TOOL_SPECS,
} from '../device-market-advisor';
import type { EstarInputLeaf } from '../../pathway-engines/estar/estar-mapper';

// A leaf set covering every required 510(k) section so the eSTAR sections complete.
const COMPLETE_510K_LEAVES: EstarInputLeaf[] = [
  { sectionCode: 'cl', title: 'Cover letter', documentType: 'cover_letter', substantive: true },
  { sectionCode: 'ifu', title: 'Indications for use', documentType: 'indications_for_use', substantive: true },
  { sectionCode: 'dd', title: 'Device description', documentType: 'device_description', substantive: true },
  { sectionCode: 'lbl', title: 'Proposed labeling', documentType: 'labeling', substantive: true },
  { sectionCode: 'bio', title: 'Biocompatibility', documentType: 'biocompatibility', substantive: true },
  { sectionCode: 'perf', title: 'Performance testing', documentType: 'performance_testing', substantive: true },
  { sectionCode: 'se', title: 'Substantial equivalence', documentType: 'substantial_equivalence', substantive: true },
  // Always-required since W1-5: the statutory administrative forms and the
  // risk file are part of every 510(k), so a "complete" set carries them.
  { sectionCode: '3514', title: 'CDRH Premarket Review Submission Cover Sheet', documentType: 'cdrh_cover_sheet', substantive: true },
  { sectionCode: '3601', title: 'MDUFA user fee cover sheet', documentType: 'user_fee', substantive: true },
  { sectionCode: 'tas', title: 'Truthful and Accurate Statement', documentType: 'truthful_accurate', substantive: true },
  { sectionCode: 'rm', title: 'Risk management file', documentType: 'risk_management', substantive: true },
  { sectionCode: 'sum', title: '510(k) Summary', documentType: '510k_summary', substantive: true },
];

const OFFICIAL_510K_DEVICE_TEMPLATE = 'eSTAR-510k-non-ivd.pdf';

/* A device that is none of the seven conditional things. Without an answer a
   conditional section is UNDETERMINED, and an undetermined section blocks a
   claim of a submittable eSTAR — the assembler used to ignore that and this
   test passed on the defect. */
const PLAIN_DEVICE = {
  combinationProduct: false, softwareAiMl: false, cyberDevice: false, sterile: false,
  implantable: false, cliaWaived: false, clinicalData: false,
} as const;

describe('adviseDeviceReadiness', () => {
  it('returns submittable advice when sections are complete and the official template is present', () => {
    const advice = adviseDeviceReadiness({
      pathway: '510k',
      variant: 'device',
      leaves: COMPLETE_510K_LEAVES,
      deviceFlags: PLAIN_DEVICE,
      presentTemplates: [OFFICIAL_510K_DEVICE_TEMPLATE],
      environment: 'production',
      requireTemplate: true,
    });

    expect(advice.canProduceOfficialEstar).toBe(true);
    expect(advice.artifactKind).toBe('official-estar');
    expect(advice.estarSectionScore).toBe(100);
    expect(advice.missingRequiredSections).toHaveLength(0);
    expect(advice.headline.toLowerCase()).toContain('ready');
    // Honest: never claims it transmits — it advises the user to submit.
    expect(advice.headline.toLowerCase()).toContain('you submit');
    expect(advice.provenance.modules).toContain('ana-advisory/device-market-advisor');
  });

  it('returns not-submittable advice and surfaces blockers when the official template is missing', () => {
    const advice = adviseDeviceReadiness({
      pathway: '510k',
      variant: 'device',
      leaves: COMPLETE_510K_LEAVES,
      presentTemplates: [], // sections complete, but no official template
      environment: 'production',
      requireTemplate: true,
    });

    expect(advice.canProduceOfficialEstar).toBe(false);
    expect(advice.artifactKind).toBe('content-package-draft');
    expect(advice.estarSectionScore).toBe(100);
    expect(advice.blockers.length).toBeGreaterThan(0);
    expect(advice.blockers.join(' ')).toMatch(/eSTAR template/i);
    // A critical action to drop in the official template.
    const actionTexts = advice.recommendedActions.map((a) => a.text).join(' ');
    expect(actionTexts).toMatch(/official FDA eSTAR template/i);
    expect(advice.recommendedActions.some((a) => a.priority === 'critical')).toBe(true);
  });

  it('surfaces missing required sections as blockers and critical actions', () => {
    const advice = adviseDeviceReadiness({
      pathway: '510k',
      variant: 'device',
      leaves: [
        { sectionCode: 'cl', title: 'Cover letter', documentType: 'cover_letter', substantive: true },
      ],
      presentTemplates: [OFFICIAL_510K_DEVICE_TEMPLATE],
      environment: 'production',
      requireTemplate: true,
    });

    expect(advice.canProduceOfficialEstar).toBe(false);
    expect(advice.missingRequiredSections.length).toBeGreaterThan(0);
    expect(advice.estarSectionScore).toBeLessThan(100);
    // Every missing required section yields a critical "provide-section" action.
    const sectionActions = advice.recommendedActions.filter((a) => a.id.startsWith('provide-section:'));
    expect(sectionActions.length).toBe(advice.missingRequiredSections.length);
    expect(sectionActions.every((a) => a.priority === 'critical')).toBe(true);
    // Blockers list mentions the missing sections.
    expect(advice.blockers.join(' ')).toMatch(/required eSTAR section/i);
  });

  it('returns artifactKind "none" with honest headline when no content is supplied', () => {
    const advice = adviseDeviceReadiness({
      pathway: 'de_novo',
      variant: 'ivd',
      leaves: [],
      presentTemplates: [],
    });

    expect(advice.artifactKind).toBe('none');
    expect(advice.canProduceOfficialEstar).toBe(false);
    expect(advice.headline.toLowerCase()).toContain('nothing to assemble');
  });

  it('includes a target-market overlay finding when a market is supplied', () => {
    const advice = adviseDeviceReadiness({
      pathway: '510k',
      variant: 'device',
      leaves: COMPLETE_510K_LEAVES,
      presentTemplates: [OFFICIAL_510K_DEVICE_TEMPLATE],
      market: 'us-fda',
      availableArtifacts: ['device_classification'],
      environment: 'production',
      requireTemplate: true,
    });

    const overlay = advice.findings.find((f) => f.key === 'market-overlay');
    expect(overlay).toBeDefined();
    expect(overlay?.label).toContain('FDA');
  });
});

describe('adviseGlobalMarketStrategy', () => {
  it('ranks markets best-ready first based on readiness score', () => {
    // Full US-FDA artifact set vs nothing for the EU.
    const advice = adviseGlobalMarketStrategy({
      profile: {
        isIvd: false,
        availableArtifacts: [
          'device_classification',
          'predicate_or_benefit_risk',
          'safety_effectiveness_evidence',
          'performance_testing',
          'labelling',
          'qms_quality_system',
          'us_agent',
        ],
      },
      candidateMarkets: ['us-fda', 'eu-mdr-ivdr'],
    });

    expect(advice.rankedMarkets).toHaveLength(2);
    // US should be fully ready (100%) and therefore rank first.
    expect(advice.rankedMarkets[0].marketId).toBe('us-fda');
    expect(advice.rankedMarkets[0].score).toBe(100);
    expect(advice.rankedMarkets[0].score).toBeGreaterThanOrEqual(advice.rankedMarkets[1].score);
    expect(advice.headline).toContain('FDA');
  });

  it('reports transmission capability honestly — true for markets with live gateways', () => {
    const advice = adviseGlobalMarketStrategy({
      profile: { isIvd: true, availableArtifacts: [] },
      candidateMarkets: ['us-fda', 'jp-pmda'],
    });

    // Both markets now have real gateways — transmitCapableMarkets is non-empty.
    expect(advice.transmitCapableMarkets).toContain('us-fda');
    expect(advice.transmitCapableMarkets).toContain('jp-pmda');
    // Ranked markets report canTransmit from the registry.
    expect(advice.rankedMarkets.every((m) => m.canTransmit === true)).toBe(true);
    // No cannot-transmit blocker for gateway-capable markets.
    for (const m of advice.rankedMarkets) {
      expect(m.blockers.every((b) => !/cannot transmit/i.test(b))).toBe(true);
    }
  });

  it('reports which markets the platform can assemble and which need a local rep', () => {
    const advice = adviseGlobalMarketStrategy({
      profile: { isIvd: false, availableArtifacts: [] },
      candidateMarkets: ['us-fda', 'jp-pmda', 'ca-health-canada'],
    });

    // us-fda is assemble-capable; jp-pmda and ca are not.
    expect(advice.assembleCapableMarkets).toContain('us-fda');
    expect(advice.assembleCapableMarkets).not.toContain('jp-pmda');
    // us-fda and jp require a local rep; ca-health-canada does not.
    expect(advice.marketsNeedingLocalRep).toContain('us-fda');
    expect(advice.marketsNeedingLocalRep).toContain('jp-pmda');
    expect(advice.marketsNeedingLocalRep).not.toContain('ca-health-canada');
    // A local-rep action is recommended for markets that need one.
    expect(advice.recommendedActions.some((a) => a.id.startsWith('appoint-local-rep:'))).toBe(true);
  });

  it('assesses every registry market when no candidates are supplied', () => {
    const advice = adviseGlobalMarketStrategy({
      profile: { isIvd: false, availableArtifacts: [] },
    });
    expect(advice.rankedMarkets.length).toBeGreaterThanOrEqual(12);
  });

  it('reports unrecognised candidate market ids without throwing', () => {
    const advice = adviseGlobalMarketStrategy({
      profile: { isIvd: false, availableArtifacts: [] },
      candidateMarkets: ['us-fda', 'not-a-market'],
    });
    expect(advice.unknownMarkets).toContain('not-a-market');
    expect(advice.rankedMarkets.map((m) => m.marketId)).toContain('us-fda');
    expect(advice.blockers.some((b) => /Unrecognised/i.test(b))).toBe(true);
  });

  it('always recommends self-submission (critical)', () => {
    const advice = adviseGlobalMarketStrategy({
      profile: { isIvd: false, availableArtifacts: [] },
      candidateMarkets: ['us-fda'],
    });
    const selfSubmit = advice.recommendedActions.find((a) => a.id === 'plan-self-submission');
    expect(selfSubmit).toBeDefined();
    expect(selfSubmit?.priority).toBe('critical');
  });
});

describe('ANA_ADVISORY_TOOL_SPECS', () => {
  it('exports a well-formed spec for each advisory function', () => {
    expect(Array.isArray(ANA_ADVISORY_TOOL_SPECS)).toBe(true);
    expect(ANA_ADVISORY_TOOL_SPECS.length).toBe(2);

    const names = ANA_ADVISORY_TOOL_SPECS.map((s) => s.name);
    expect(names).toContain('advise_device_readiness');
    expect(names).toContain('advise_global_market_strategy');

    for (const spec of ANA_ADVISORY_TOOL_SPECS) {
      expect(typeof spec.name).toBe('string');
      expect(spec.name.length).toBeGreaterThan(0);
      expect(typeof spec.description).toBe('string');
      expect(spec.description.length).toBeGreaterThan(0);
      expect(spec.input_schema).toBeDefined();
      expect(spec.input_schema.type).toBe('object');
      expect(typeof spec.input_schema.properties).toBe('object');
      expect(Array.isArray(spec.input_schema.required)).toBe(true);
      // Every required key is declared in properties.
      for (const req of spec.input_schema.required ?? []) {
        expect(spec.input_schema.properties).toHaveProperty(req);
      }
    }
  });
});
