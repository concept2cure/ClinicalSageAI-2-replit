/**
 * Study archetype registry — coverage, correct classification, and honesty about
 * what is not yet specified.
 *
 * The registry's job is that the Study Design Center offers the right archetypes
 * and that a protocol generated from one starts in the right shape. So the tests
 * check three things: that nothing declared in the specialization presets is
 * missing here (a study type in a dropdown with no content produces an empty
 * protocol), that device and IVD content does not cross over, and that the
 * outline-vs-full distinction is reported rather than smoothed away.
 */

import { describe, it, expect } from 'vitest';
import {
  allArchetypes, getArchetype, archetypesForSpecialization, archetypesForFiling,
  archetypesNeedingDetail, registryCoverage, DECLARED_STUDY_TYPES, REGISTRY_VERSION,
} from '../mdx-study-archetypes';
import { specializationPreset } from '../mdx-specialization';

describe('registry completeness', () => {
  it('has an archetype for every study type the specialization presets declare', () => {
    // Asserted here rather than by the type system: building a
    // Record<DeclaredStudyType, ...> from an array needs an `as` assertion, which
    // defeats the exhaustiveness it appears to give. A study type offered in a
    // dropdown with no registry entry would produce an empty protocol.
    const present = new Set(allArchetypes().map(a => a.id));
    const missing = DECLARED_STUDY_TYPES.filter(t => !present.has(t));
    expect(missing).toEqual([]);
  });

  it('declares no archetype that the presets do not know about', () => {
    // The reverse direction: an entry here with no home in any specialization
    // would be unreachable content, which is a maintenance trap.
    const declared = new Set<string>(DECLARED_STUDY_TYPES);
    const orphans = allArchetypes().map(a => a.id).filter(id => !declared.has(id));
    expect(orphans).toEqual([]);
  });

  it('has no duplicate ids', () => {
    const ids = allArchetypes().map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every archetype a purpose, sections, design questions and a filing home', () => {
    // True at BOTH detail levels: an outline is allowed to lack endpoints and
    // statistics, but an archetype nobody can place in a filing is not useful at
    // any depth.
    for (const a of allArchetypes()) {
      expect(a.purpose.length, a.id).toBeGreaterThan(20);
      expect(a.protocolSections.length, a.id).toBeGreaterThan(0);
      expect(a.designQuestions.length, a.id).toBeGreaterThan(0);
      expect(a.supportsFilings.length, a.id).toBeGreaterThan(0);
    }
  });
});

describe('coverage is declared, not implied', () => {
  it('reports which archetypes are outline-level', () => {
    // Published so a consumer can label them honestly. A registry that looks
    // uniformly authoritative when part of it is scaffolding is worse than one
    // that says which part.
    const needing = archetypesNeedingDetail();
    expect(needing.length).toBeGreaterThan(0);
    for (const a of needing) expect(a.detail).toBe('outline');
  });

  it('coverage numbers add up and carry the version', () => {
    const c = registryCoverage();
    expect(c.full + c.outline).toBe(c.total);
    expect(c.total).toBe(allArchetypes().length);
    expect(c.version).toBe(REGISTRY_VERSION);
  });

  it('every full archetype carries endpoints, acceptance criteria and statistics', () => {
    // This is what `full` claims. If an archetype is marked full without them the
    // label is a lie, and a writer would trust a skeleton that has none.
    for (const a of allArchetypes().filter(x => x.detail === 'full')) {
      expect(a.endpoints.length, `${a.id} endpoints`).toBeGreaterThan(0);
      expect(a.typicalAcceptanceCriteria.length, `${a.id} acceptance`).toBeGreaterThan(0);
      expect(a.statisticalMethods.length, `${a.id} statistics`).toBeGreaterThan(0);
      expect(a.references.length, `${a.id} references`).toBeGreaterThan(0);
    }
  });
});

describe('archetypesForSpecialization', () => {
  it('offers IVD performance archetypes to a diagnostics project and no device studies', () => {
    const ids = archetypesForSpecialization('ivd_diagnostics').map(a => a.id);
    expect(ids).toContain('precision');
    expect(ids).toContain('lob_lod_loq');
    expect(ids).toContain('ppa_npa_opa');
    // A device clinical investigation is the wrong instrument for an assay.
    expect(ids).not.toContain('pivotal_clinical_investigation');
    expect(ids).not.toContain('human_factors_formative');
  });

  it('offers device archetypes to a device project and no analytical panel', () => {
    const ids = archetypesForSpecialization('medical_device').map(a => a.id);
    expect(ids).toContain('pivotal_clinical_investigation');
    expect(ids).toContain('human_factors_validation');
    // There is no reagent and no specimen, so there is no limit of detection.
    expect(ids).not.toContain('lob_lod_loq');
    expect(ids).not.toContain('precision');
  });

  it('offers nothing at all when the specialization is undeclared', () => {
    // The whole design: offering everything would be the guess this avoids.
    expect(archetypesForSpecialization('unspecified')).toEqual([]);
  });

  it('offers both panels when the organization does both', () => {
    const ids = archetypesForSpecialization('medical_device_and_ivd').map(a => a.id);
    expect(ids).toContain('pivotal_clinical_investigation');
    expect(ids).toContain('lob_lod_loq');
  });

  it('gives SaMD clinical validation without the analytical panel', () => {
    const ids = archetypesForSpecialization('software_as_medical_device').map(a => a.id);
    expect(ids).toContain('software_clinical_validation');
    expect(ids).toContain('human_factors_validation');
    expect(ids).not.toContain('precision');
    expect(ids).not.toContain('interference');
  });

  it('gives a companion diagnostic the concordance study', () => {
    const ids = archetypesForSpecialization('companion_diagnostic').map(a => a.id);
    expect(ids).toContain('cdx_concordance');
    expect(ids).toContain('precision');
  });

  it('stays in step with the specialization presets rather than keeping its own list', () => {
    // Drift between these two would let the project-creation dialog and the Study
    // Design Center disagree about what an IVD project is.
    for (const s of ['medical_device', 'ivd_diagnostics', 'companion_diagnostic'] as const) {
      const fromPreset = new Set<string>(specializationPreset(s).studyTypes);
      const fromRegistry = archetypesForSpecialization(s).map(a => a.id);
      expect(fromRegistry.every(id => fromPreset.has(id)), s).toBe(true);
      expect(fromRegistry.length, s).toBe(fromPreset.size);
    }
  });
});

describe('archetypesForFiling', () => {
  it('finds the evidence a dual 510(k)/CLIA waiver needs', () => {
    const ids = archetypesForFiling('dual_510k_clia_waiver').map(a => a.id);
    // A CLIA waiver turns on untrained users and on failing safe under stress.
    expect(ids).toContain('lay_user');
    expect(ids).toContain('clia_waiver_flex');
    expect(ids).toContain('precision');
  });

  it('finds the evidence a companion diagnostic PMA needs', () => {
    const ids = archetypesForFiling('pma_cdx').map(a => a.id);
    expect(ids).toContain('cdx_concordance');
    expect(ids).toContain('clinical_sensitivity_specificity');
  });

  it('does not offer IVD analytical studies for a device IDE', () => {
    const ids = archetypesForFiling('ide').map(a => a.id);
    expect(ids).not.toContain('precision');
    expect(ids).not.toContain('lob_lod_loq');
  });
});

describe('content correctness on the archetypes most likely to be misapplied', () => {
  it('PPA/NPA is framed as agreement, not accuracy', () => {
    // The most common diagnostic-statistics error: reporting sensitivity and
    // specificity against a comparator that is not a reference standard.
    const a = getArchetype('ppa_npa_opa')!;
    expect(a.purpose).toMatch(/agreement/i);
    expect(a.designQuestions.join(' ')).toMatch(/AGREEMENT, not sensitivity/);
  });

  it('the lay-user study puts the labeling under test, not the operator', () => {
    const a = getArchetype('lay_user')!;
    expect(a.designQuestions.join(' ')).toMatch(/training.*protocol deviation|labeling is what is under test/i);
    expect(a.requiredSupportingPlans.join(' ')).toMatch(/labeling/i);
  });

  it('software validation demands an independent validation set', () => {
    const a = getArchetype('software_clinical_validation')!;
    expect(a.designQuestions.join(' ')).toMatch(/independent of any data used in development/i);
  });

  it('ROC/cutoff warns about deriving and validating on the same specimens', () => {
    const a = getArchetype('roc_cutoff')!;
    expect(a.designQuestions.join(' ')).toMatch(/SAME specimens/);
  });

  it('acceptance criteria are framed as claims to justify, not thresholds to adopt', () => {
    // A number presented as authoritative gets adopted unexamined, and an
    // acceptance criterion is a claim about one product's intended use.
    const withCriteria = allArchetypes().filter(a => a.typicalAcceptanceCriteria.length > 0);
    expect(withCriteria.length).toBeGreaterThan(5);
    const text = withCriteria.flatMap(a => a.typicalAcceptanceCriteria).join(' ');
    expect(text).toMatch(/justified|pre-specified|defended|clinical/i);
  });

  it('every full IVD archetype carries the common protocol spine', () => {
    // A reviewer expects the same spine in every IVD protocol; an archetype that
    // omits specimen handling or invalid-result handling reads as incomplete.
    const ivd = ['precision', 'reproducibility', 'lob_lod_loq', 'ppa_npa_opa'];
    for (const id of ivd) {
      const s = getArchetype(id)!.protocolSections;
      expect(s, id).toContain('Invalid and indeterminate results');
      expect(s, id).toContain('Specimen handling and retention');
      expect(s, id).toContain('Acceptance criteria');
    }
  });

  it('every full device archetype covers adverse effects and stopping criteria', () => {
    const a = getArchetype('pivotal_clinical_investigation')!;
    expect(a.protocolSections).toContain('Adverse device effects');
    expect(a.protocolSections).toContain('Suspension and stopping criteria');
    expect(a.references.join(' ')).toMatch(/ISO 14155/);
  });
});
