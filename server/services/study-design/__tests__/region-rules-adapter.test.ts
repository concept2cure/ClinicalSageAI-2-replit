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
  STRATEGY_FIELDS,
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

/**
 * The fields unmapped for a design that records NO regulatory strategy. They
 * stopped being unconditional on 2026-09-22, when `RegulatoryStrategy` was
 * added: a design that records one of these closes its gap and the rules that
 * read it become decidable.
 */
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

// ─── Recorded regulatory strategy closes the gaps ────────────────────────────

/*
 * Before `StudyDesign.regulatoryStrategy` existed, this adapter measured that
 * ELEVEN OF ELEVEN region rules were not-assessed for a design with no MRCT
 * block: the spine could not decide a single one. These tests hold the fix,
 * and — more importantly — hold the line that a RECORDED false is a statement
 * while an ABSENT field is not.
 */
describe('regulatory strategy — recorded fields close their gaps', () => {
  function withStrategy(strategy: StudyDesign['regulatoryStrategy']): StudyDesign {
    return { ...mrctDesign(), regulatoryStrategy: strategy };
  }

  /*
   * This assertion is exact in BOTH directions on purpose. The first version
   * walked STRATEGY_FIELDS and checked each appeared in the ledger, which gets
   * weaker as the list shrinks — deleting a field from the list made the test
   * pass. It was proved vacuous by deleting 'oncology' and watching all 30
   * tests still pass. STRATEGY_FIELD_SET is now a Record<keyof
   * RegulatoryStrategy, true>, so the same deletion no longer compiles, and
   * this set-equality catches a ledger that drifts from it.
   */
  it('the ledger names exactly the strategy fields the adapter reads', () => {
    const ledger = unmappedFields(studyDesignToRegionInput(mrctDesign()));
    const strategyEntries = ledger.filter((f) => (STRATEGY_FIELDS as string[]).includes(f));

    expect(strategyEntries.sort()).toEqual([...STRATEGY_FIELDS].sort());
    expect(STRATEGY_FIELDS).toHaveLength(7);
  });

  it('drops a field from the unmapped ledger once the design records it', () => {
    const before = unmappedFields(studyDesignToRegionInput(mrctDesign()));
    const after = unmappedFields(studyDesignToRegionInput(withStrategy({ ethnicSensitivityAssessed: true })));

    expect(before).toContain('ethnicSensitivityAssessed');
    expect(after).not.toContain('ethnicSensitivityAssessed');
  });

  it('drops it for a recorded FALSE too, because that is a statement', () => {
    const after = unmappedFields(studyDesignToRegionInput(withStrategy({ ethnicSensitivityAssessed: false })));
    expect(after).not.toContain('ethnicSensitivityAssessed');
  });

  it('keeps the gap when the strategy node exists but omits the field', () => {
    // The node being present says nothing about a field it does not carry.
    const after = unmappedFields(studyDesignToRegionInput(withStrategy({ oncology: true })));
    expect(after).toContain('ethnicSensitivityAssessed');
    expect(after).not.toContain('oncology');
  });

  it('carries a recorded value through to the engine input', () => {
    const { input } = studyDesignToRegionInput(withStrategy({ thoroughQt: true, qtInRegionalPopulation: true }));
    expect(input.thoroughQt).toBe(true);
    expect(input.qtInRegionalPopulation).toBe(true);
  });

  it('records a local representative per agency, and only for agencies the design targets', () => {
    // mrctDesign() targets the United States and Japan, so FDA and PMDA. A
    // representative recorded for ANVISA is not carried into the input,
    // because the adapter does not invent a Brazilian filing this design does
    // not have. This is the behaviour the first version of this test got
    // wrong, and the adapter was right.
    const { input } = studyDesignToRegionInput(
      withStrategy({ localSponsorRepresentative: { FDA: true, ANVISA: true } }),
    );

    expect(input.localSponsorRepresentative?.FDA).toBe(true);
    expect(input.localSponsorRepresentative?.ANVISA).toBeUndefined();
    // PMDA is targeted but not recorded as appointed, so it is a recorded false.
    expect(input.localSponsorRepresentative?.PMDA).toBe(false);
  });

  it('decides rules that were not-assessed, once the fields they read are recorded', () => {
    const before = evaluateDesignRegionRules(mrctDesign());
    const after = evaluateDesignRegionRules(
      withStrategy({
        ethnicSensitivityAssessed: true,
        thoroughQt: true,
        qtInRegionalPopulation: true,
        diversityPlan: true,
        usesReliancePathway: true,
        oncology: true,
        localSponsorRepresentative: { ANVISA: true },
      }),
    );

    expect(after.notAssessed).toBeLessThan(before.notAssessed);
    expect(after.findings.length).toBe(before.findings.length);
  });

  it('decides every rule when the design records the whole strategy and its MRCT block', () => {
    const a = evaluateDesignRegionRules(
      withStrategy({
        ethnicSensitivityAssessed: true,
        thoroughQt: true,
        qtInRegionalPopulation: true,
        diversityPlan: true,
        usesReliancePathway: true,
        oncology: true,
        localSponsorRepresentative: { ANVISA: true, FDA: true, EMA: true, PMDA: true, MHRA: true, NMPA: true, Swissmedic: true },
      }),
    );

    expect(a.notAssessed).toBe(0);
    expect(a.unmapped.map((u) => u.field)).toEqual(['localRepresentation.fraction']);
  });

  it('still reaches unmet, not met, when the strategy records the absent case', () => {
    const a = evaluateDesignRegionRules(
      withStrategy({
        ethnicSensitivityAssessed: false,
        thoroughQt: false,
        qtInRegionalPopulation: false,
        diversityPlan: false,
        usesReliancePathway: false,
        oncology: false,
        localSponsorRepresentative: { ANVISA: false },
      }),
    );

    expect(a.notAssessed).toBe(0);
    expect(a.findings.some((f) => regionFindingStatus(f) === 'unmet')).toBe(true);
  });
});
