/**
 * Tests for the region-rules adapter — the pure bridge from the StudyDesign spine to
 * the region design-rule engine (`server/services/region-design-rules.ts`).
 *
 * The adapter's whole job is honesty: it maps what the design object actually carries,
 * reports every `RegionDesignInput` field the design does not carry in `unmapped`, and
 * refuses to let a rule report `met` on the strength of a value the design never
 * supplied. These tests are the contract for that: the `unmapped` list is asserted by
 * name, so a future StudyDesign field that closes a gap fails here and forces the
 * adapter to be updated. No DB, no AI, no RNG, no clock.
 */

import { describe, it, expect } from 'vitest';
import {
  DERIVED_REGION_INPUT_FIELDS,
  REGION_INPUT_FIELDS,
  evaluateDesignRegionRules,
  regionFindingStatus,
  studyDesignToRegionInput,
  type DesignRegionMapping,
} from '../region-rules-adapter';
import { type StudyDesign } from '../study-design-types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A minimal but structurally valid phase 3 design that records no target regions. */
function baseDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    objectives: [
      { level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' },
    ],
    estimands: [],
    endpoints: [
      {
        name: 'HbA1c change',
        role: 'primary',
        type: 'continuous',
        definition: 'change from baseline in HbA1c at week 24',
      },
    ],
    framework: {
      inferentialFrame: 'superiority',
      structuralDesign: 'parallel_group',
      controlType: 'placebo',
    },
    population: {
      targetDescription: 'adults with type 2 diabetes',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized' }],
      eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0–10.0%' }],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 400, plannedAnalyses: [] },
  };
}

function withRegions(regions: string[]): StudyDesign {
  return { ...baseDesign(), targetRegions: regions };
}

/** A design that records an MRCT across the US and Japan with a consistency approach. */
function mrctDesign(): StudyDesign {
  const design = withRegions(['United States', 'Japan']);
  design.framework.mrct = {
    regions: ['United States', 'Japan'],
    consistencyApproach: 'ICH E17 method 1',
  };
  return design;
}

function unmappedFields(mapping: DesignRegionMapping): string[] {
  return mapping.unmapped.map(u => u.field).sort();
}

/** The fields that are unmapped for every design, whatever it carries today. */
const ALWAYS_UNMAPPED = [
  'diversityPlan',
  'ethnicSensitivityAssessed',
  'localRepresentation.fraction',
  'localSponsorRepresentative',
  'oncology',
  'qtInRegionalPopulation',
  'thoroughQt',
  'usesReliancePathway',
];

/** Additionally unmapped while `framework.mrct` is absent from the design. */
const UNMAPPED_WITHOUT_MRCT = ['localRepresentation', 'multiRegional', 'regionalConsistencyPlan'];

// ─── studyDesignToRegionInput ────────────────────────────────────────────────

describe('studyDesignToRegionInput — agency derivation', () => {
  it('derives no agency, and in particular does not default to FDA, when no region is recorded', () => {
    const mapping = studyDesignToRegionInput(baseDesign());
    expect(mapping.input.targetAgencies).toEqual([]);
    expect(mapping.input.targetAgencies).not.toContain('FDA');
    const note = mapping.unmapped.find(u => u.field === 'targetAgencies');
    expect(note?.reason).toMatch(/the design records no target regions/);
  });

  it('derives FDA and EMA from US and EU member-state target regions', () => {
    const mapping = studyDesignToRegionInput(withRegions(['United States', 'Germany', 'France']));
    expect(mapping.input.targetAgencies).toEqual(['FDA', 'EMA']);
    expect(mapping.unmapped.find(u => u.field === 'targetAgencies')).toBeUndefined();
  });

  it('derives every supported agency from its region aliases, deduplicated and in a stable order', () => {
    const mapping = studyDesignToRegionInput(
      withRegions(['Japan', 'china', 'UK', 'Switzerland', 'Brazil', 'USA', 'EU', 'United States']),
    );
    expect(mapping.input.targetAgencies).toEqual([
      'FDA', 'EMA', 'PMDA', 'MHRA', 'NMPA', 'Swissmedic', 'ANVISA',
    ]);
  });

  it('also derives agencies from framework.mrct.regions', () => {
    const design = baseDesign();
    design.framework.mrct = { regions: ['United States', 'Japan'] };
    expect(studyDesignToRegionInput(design).input.targetAgencies).toEqual(['FDA', 'PMDA']);
  });
});

describe('studyDesignToRegionInput — local representation', () => {
  it('never infers local subject representation from targetRegions', () => {
    const mapping = studyDesignToRegionInput(withRegions(['Japan', 'China']));
    expect(mapping.input.localRepresentation).toEqual({});
    expect(unmappedFields(mapping)).toContain('localRepresentation');
  });

  it('derives local representation from framework.mrct.regions, without a fraction', () => {
    const design = withRegions(['Japan', 'United States']);
    design.framework.mrct = { regions: ['Japan', 'United States'], consistencyApproach: 'ICH E17 method 2' };
    const mapping = studyDesignToRegionInput(design);
    expect(mapping.input.localRepresentation).toEqual({
      FDA: { included: true },
      PMDA: { included: true },
    });
    expect(mapping.input.localRepresentation?.PMDA?.fraction).toBeUndefined();
    expect(unmappedFields(mapping)).toContain('localRepresentation.fraction');
    expect(unmappedFields(mapping)).not.toContain('localRepresentation');
  });
});

describe('studyDesignToRegionInput — the unmapped contract', () => {
  it('accounts for every RegionDesignInput field: derived from the design, or listed in unmapped', () => {
    // `input` always carries all 12 keys (the absent ones hold their pessimistic value), so
    // membership in `input` proves nothing. A field counts as accounted for only when the
    // adapter declares it derivable, or names it in the unmapped ledger.
    const derivable = new Set<string>(DERIVED_REGION_INPUT_FIELDS);

    for (const design of [withRegions(['United States']), mrctDesign()]) {
      const mapping = studyDesignToRegionInput(design);
      const listed = new Set(mapping.unmapped.map(u => u.field.split('.')[0]));
      for (const field of REGION_INPUT_FIELDS) {
        const accounted = derivable.has(field) || listed.has(field);
        expect(accounted, `RegionDesignInput.${field} is neither derived nor listed as unmapped`).toBe(true);
      }
    }
  });

  it('lists a derivable field in unmapped whenever this design does not in fact carry it', () => {
    const listed = new Set(studyDesignToRegionInput(withRegions(['United States'])).unmapped.map(u => u.field));
    // Derivable in principle, but absent from a design with no MRCT block.
    expect(listed.has('multiRegional')).toBe(true);
    expect(listed.has('regionalConsistencyPlan')).toBe(true);
    expect(listed.has('localRepresentation')).toBe(true);
    // Genuinely derived: not listed.
    expect(listed.has('phase')).toBe(false);
    expect(listed.has('targetAgencies')).toBe(false);
  });

  it('names exactly the unmapped fields for a design without an MRCT block', () => {
    const mapping = studyDesignToRegionInput(withRegions(['United States']));
    expect(unmappedFields(mapping)).toEqual([...ALWAYS_UNMAPPED, ...UNMAPPED_WITHOUT_MRCT].sort());
  });

  it('drops the MRCT-dependent gaps once framework.mrct is recorded', () => {
    const design = withRegions(['United States', 'Japan']);
    design.framework.mrct = { regions: ['United States', 'Japan'], consistencyApproach: 'ICH E17 method 1' };
    const mapping = studyDesignToRegionInput(design);
    expect(unmappedFields(mapping)).toEqual([...ALWAYS_UNMAPPED].sort());
    expect(mapping.input.multiRegional).toBe(true);
    expect(mapping.input.regionalConsistencyPlan).toBe(true);
  });

  it('gives every unmapped entry a non-empty reason', () => {
    for (const entry of studyDesignToRegionInput(withRegions(['Japan'])).unmapped) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('maps the phase families onto the engine phase vocabulary', () => {
    const phases: Array<[StudyDesign['phase'], string]> = [
      ['FIH', '1'], ['1', '1'], ['1b', '1'], ['2', '2'], ['2b', '2'], ['3', '3'], ['3b', '3'], ['4', '4'],
    ];
    for (const [phase, expected] of phases) {
      const design = { ...withRegions(['United States']), phase };
      expect(studyDesignToRegionInput(design).input.phase).toBe(expected);
    }
  });
});

// ─── evaluateDesignRegionRules ───────────────────────────────────────────────

describe('evaluateDesignRegionRules', () => {
  it('returns no agency, no finding and the explicit note when the design records no region', () => {
    const result = evaluateDesignRegionRules(baseDesign());
    expect(result.agencies).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.notAssessed).toBe(0);
    expect(result.unmapped.find(u => u.field === 'targetAgencies')?.reason).toMatch(
      /the design records no target regions/,
    );
  });

  it('flags a target region that maps to no supported agency instead of silently dropping it', () => {
    const result = evaluateDesignRegionRules(withRegions(['Canada']));
    expect(result.agencies).toEqual([]);
    const finding = result.findings.find(f => f.detail.includes('Canada'));
    expect(finding).toBeDefined();
    expect(finding?.code).toBe('RGN-001');
  });

  it('maps a US + EU design to FDA and EMA and produces findings from both scopes', () => {
    const design = withRegions(['United States', 'Germany']);
    design.framework.mrct = { regions: ['United States', 'Germany'] };
    const result = evaluateDesignRegionRules(design);

    expect(result.agencies).toEqual(['FDA', 'EMA']);
    const codes = result.findings.map(f => f.code);
    // FDA-scoped: the phase 3 diversity action plan.
    expect(codes).toContain('RGN-FDA-DIVERSITY');
    // Multi-agency scope: ICH E17 consistency applies because two agencies are targeted.
    expect(codes).toContain('RGN-ICH-E17-CONSISTENCY');
    expect(result.findings.every(f => f.section === 'Region-specific design rules')).toBe(true);
  });

  it('reports a rule that is unmet under every assumption as unmet, not as not-assessed', () => {
    // NMPA is targeted and no MRCT region records Chinese subjects: NMPA-LOCAL-DATA is unmet
    // whatever the unrecorded fields turn out to be, so it is a real verdict.
    const design = withRegions(['China']);
    design.framework.mrct = { regions: ['United States'] };
    const result = evaluateDesignRegionRules(design);
    const finding = result.findings.find(f => f.code === 'RGN-NMPA-LOCAL-DATA');
    expect(regionFindingStatus(finding!)).toBe('unmet');
    expect(finding?.severity).toBe('critical');
  });

  it('reports no rule as met when every field that could produce met is unmapped', () => {
    // All seven agencies targeted, so every rule is in scope — but the design carries no
    // MRCT block, so representation, consistency, ethnic sensitivity, reliance pathway,
    // local representative, diversity plan and QT are all absent. Nothing may pass.
    const design = withRegions([
      'United States', 'Germany', 'Japan', 'China', 'United Kingdom', 'Switzerland', 'Brazil',
    ]);
    const result = evaluateDesignRegionRules(design);

    const met = result.findings.filter(f => regionFindingStatus(f) === 'met');
    expect(met.map(f => f.code)).toEqual([]);
    expect(result.notAssessed).toBeGreaterThan(0);
  });

  it('reports met only from fields the design actually carries', () => {
    // Positive control: the met path is reachable, and only through mapped fields. The MRCT
    // block supplies representation and the consistency approach, so the three rules that
    // rest solely on those pass — while PMDA-E5-BRIDGING, which also needs the unmapped
    // ethnic-sensitivity assessment, stays unassessed rather than riding along.
    const design = withRegions(['Japan', 'China', 'United States']);
    design.framework.mrct = { regions: ['Japan', 'China'], consistencyApproach: 'ICH E17 method 1' };
    const result = evaluateDesignRegionRules(design);

    const met = result.findings.filter(f => regionFindingStatus(f) === 'met').map(f => f.code);
    expect(met).toEqual(['RGN-PMDA-E17-MRCT', 'RGN-NMPA-LOCAL-DATA', 'RGN-ICH-E17-CONSISTENCY']);

    const bridging = result.findings.find(f => f.code === 'RGN-PMDA-E5-BRIDGING');
    expect(regionFindingStatus(bridging!)).toBe('not-assessed');
    expect(bridging?.detail).toContain('ethnicSensitivityAssessed');
  });

  it('counts every rule that rests on an unmapped field as not assessed and names the field', () => {
    const design = withRegions(['Brazil', 'United Kingdom']);
    const result = evaluateDesignRegionRules(design);

    const notAssessed = result.findings.filter(f => regionFindingStatus(f) === 'not-assessed');
    expect(notAssessed.length).toBe(result.notAssessed);
    expect(result.notAssessed).toBeGreaterThan(0);

    const anvisa = result.findings.find(f => f.code === 'RGN-ANVISA-LOCAL');
    expect(regionFindingStatus(anvisa!)).toBe('not-assessed');
    expect(anvisa?.detail).toContain('localSponsorRepresentative');

    const mhra = result.findings.find(f => f.code === 'RGN-MHRA-POST-BREXIT');
    expect(mhra?.detail).toContain('usesReliancePathway');
  });

  it('does not assert a QT or Orbis verdict the design cannot support', () => {
    const design = withRegions(['Japan', 'United States', 'United Kingdom']);
    const result = evaluateDesignRegionRules(design);
    const qt = result.findings.find(f => f.code === 'RGN-REGIONAL-QT');
    const orbis = result.findings.find(f => f.code === 'RGN-ORBIS-ELIGIBILITY');
    expect(regionFindingStatus(qt!)).toBe('not-assessed');
    expect(qt?.detail).toContain('thoroughQt');
    expect(regionFindingStatus(orbis!)).toBe('not-assessed');
    expect(orbis?.detail).toContain('oncology');
  });

  it('is deterministic — byte-identical output for the same design', () => {
    const design = withRegions(['United States', 'Japan', 'Brazil']);
    design.framework.mrct = { regions: ['Japan'], consistencyApproach: 'ICH E17 method 2' };
    const first = evaluateDesignRegionRules(design);
    const second = evaluateDesignRegionRules(design);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(studyDesignToRegionInput(design))).toBe(
      JSON.stringify(studyDesignToRegionInput(design)),
    );
  });
});
