/**
 * Tests for the device classification engine — the EU MDR / IVDR Annex VIII
 * rule tables (highest applicable class, with a rule trace and a basis per row)
 * and the FDA pathway heuristic.
 *
 * The expected classes are the regulation's, from recall of Regulation (EU)
 * 2017/745 Annex VIII Chapter III (https://eur-lex.europa.eu/eli/reg/2017/745/oj)
 * and Regulation (EU) 2017/746 Annex VIII (https://eur-lex.europa.eu/eli/reg/2017/746/oj),
 * corroborated by secondary search extracts on 2026-10-05. The basis of each is in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-eu-mdr-ivdr-rule-table-facts.md.
 * Until 2026-10-05 three cases here pinned the engine's wrong answers
 * (short-term surgically invasive IIb, active implantable IIb, self-test B).
 *
 * Fail closed: a fact the engine cannot read (an unknown key, a wrong type, an
 * unreadable marker or sub-point) is refused with `DeviceClassificationFactError`,
 * and a call that never states the fact a class depends on gets `class: null`
 * with `missingFacts` — never the default rule's class.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyMdr,
  classifyIvdr,
  recommendFdaPathway,
  EU_MDR_RULES,
  EU_IVDR_RULES,
  DeviceClassificationFactError,
  MDR_MISSING_INVASIVE,
  IVDR_RULE6_MISSING,
  IVDR_MISSING_RULE2_MARKER,
  MAX_FACT_TEXT_LENGTH,
} from '../device-classification';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';

/** The error a call throws, or undefined. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('MDR classification (Annex VIII Rules 1–22)', () => {
  it('a non-invasive device is Class I', () => {
    const r = classifyMdr({ invasive: false });
    expect(r.class).toBe('I');
    expect(r.ruleApplied).toMatch(/Rule 1/);
  });

  it('a transient surgically invasive device is IIa; a short-term one is also IIa (Rule 7 default)', () => {
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'transient' }).class).toBe('IIa');
    const short = classifyMdr({ surgicallyInvasive: true, duration: 'short_term' });
    expect(short.class).toBe('IIa');
    expect(short.ruleApplied).toBe('Rule 7');
  });

  it('a transient surgically invasive device that is absorbed is IIb under Rule 6 (not III, not "Rule 8/17")', () => {
    const r = classifyMdr({ surgicallyInvasive: true, duration: 'transient', biologicalEffectOrAbsorbed: true });
    expect(r.class).toBe('IIb');
    expect(r.ruleApplied).toBe('Rule 6');
  });

  it('a short-term absorbed device is III under Rule 7; an implantable absorbed one is III under Rule 8', () => {
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'short_term', biologicalEffectOrAbsorbed: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 7' });
    expect(classifyMdr({ implantable: true, biologicalEffectOrAbsorbed: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 8' });
  });

  it('an implantable device is IIb, or IIa when placed in the teeth', () => {
    expect(classifyMdr({ implantable: true }).class).toBe('IIb');
    expect(classifyMdr({ implantable: true, placedInTeeth: true }).class).toBe('IIa');
  });

  it('an implantable device contacting the CNS/central circulation is III', () => {
    const r = classifyMdr({ implantable: true, contactsCnsOrCentralCirculation: true });
    expect(r.class).toBe('III');
    expect(r.ruleApplied).toMatch(/Rule 8/);
  });

  it('a pacemaker (active implantable) is III under Rule 8', () => {
    const viaFacts = classifyMdr({ implantable: true, active: true, activeTherapeutic: true });
    expect(viaFacts.class).toBe('III');
    expect(viaFacts.ruleApplied).toBe('Rule 8');
    expect(classifyMdr({ activeImplantable: true }).class).toBe('III');
  });

  it('breast implants, surgical meshes, joint replacements and spinal implants are III under Rule 8', () => {
    for (const facts of [{ breastImplantOrMesh: true }, { jointReplacement: true }, { spinalImplant: true }]) {
      expect(classifyMdr({ implantable: true, ...facts })).toMatchObject({ class: 'III', ruleApplied: 'Rule 8' });
    }
  });

  it('a device incorporating a medicinal substance is III (Rule 14)', () => {
    expect(classifyMdr({ invasive: false, incorporatesMedicinalSubstance: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 14' });
  });

  it('software in an implant makes it an active implantable (Article 2(4)), the fail-closed reading', () => {
    expect(classifyMdr({ implantable: true, software: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 8' });
  });

  it('takes the HIGHEST applicable class and traces every rule that fired', () => {
    const r = classifyMdr({ activeTherapeutic: true, implantable: true });
    expect(r.class).toBe('III');
    const fired = r.ruleTrace.map((t) => `${t.rule}:${t.class}`);
    expect(fired).toContain('Rule 9:IIa');
    expect(fired).toContain('Rule 8:IIb');
    expect(fired).toContain('Rule 8:III');
  });

  it('Rule 11 has IIa, IIb and III tiers', () => {
    expect(classifyMdr({ invasive: false, softwareDecisionSupport: true }).class).toBe('IIa');
    expect(classifyMdr({ invasive: false, softwareDecisionSupport: true, softwareSeriousDeterioration: true }).class).toBe('IIb');
    expect(classifyMdr({ softwareDecisionSupport: true, softwareSeriousDecisions: true }).class).toBe('III');
    expect(classifyMdr({ invasive: false, softwareVitalParameterMonitoring: true }).class).toBe('IIb');
  });

  it('Rule 10: an active diagnostic device for a patient in immediate danger is IIb; the trace says why', () => {
    expect(classifyMdr({ invasive: false, activeDiagnostic: true }).class).toBe('IIa');
    const r = classifyMdr({ invasive: false, activeDiagnostic: true, diagnosisPatientInImmediateDanger: true });
    expect(r).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 10' });
    expect(r.ruleTrace.map((t) => t.id)).toContain('mdr-10-diagnosis-immediate-danger');
    // Visible-spectrum illumination is the Rule 10 Class I carve-out, stated in the row text.
    expect(EU_MDR_RULES.find((x) => x.id === 'mdr-10-active-diagnostic')?.ruleText).toMatch(/visible spectrum.*Class I/);
  });

  it('Rule 12: an active device administering a medicine is IIa, IIb only when potentially hazardous', () => {
    expect(classifyMdr({ invasive: false, active: true, administersMedicine: true })).toMatchObject({ class: 'IIa', ruleApplied: 'Rule 12' });
    expect(classifyMdr({ invasive: false, active: true, administersMedicine: true, administrationPotentiallyHazardous: true }).class).toBe('IIb');
  });

  it('Rule 17 is X-ray image recording (IIa); Rule 22 closed-loop diagnostic function is III', () => {
    expect(classifyMdr({ invasive: false, xrayImageRecording: true })).toMatchObject({ class: 'IIa', ruleApplied: 'Rule 17' });
    expect(classifyMdr({ activeTherapeutic: true, closedLoopDiagnosticFunction: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 22' });
  });

});

describe('MDR classification — fail closed on facts missing or unreadable', () => {
  it('refuses to state a class when the facts that decide it are missing', () => {
    const r = classifyMdr({ surgicallyInvasive: true });
    expect(r.class).toBeNull();
    expect(r.ruleApplied).toBe('not determined');
    expect(r.missingFacts).toContain('duration');
    const bare = classifyMdr({ invasive: true });
    expect(bare.class).toBeNull();
    expect(bare.missingFacts.length).toBeGreaterThan(0);
    // ... unless a rule already gives the highest class.
    expect(classifyMdr({ surgicallyInvasive: true, incorporatesMedicinalSubstance: true }).class).toBe('III');
  });

  it('states no class for an empty fact set: Rule 1 is not a verdict on facts never given', () => {
    for (const facts of [{}, null as never, undefined as never, { invasive: null } as never]) {
      const r = classifyMdr(facts);
      expect(r.class, JSON.stringify(facts)).toBeNull();
      expect(r.missingFacts).toEqual([MDR_MISSING_INVASIVE]);
    }
    // Saying the device is non-invasive is the fact Rule 1 needs.
    expect(classifyMdr({ invasive: false })).toMatchObject({ class: 'I', ruleApplied: 'Rule 1', missingFacts: [] });
    // Stating the device's invasiveness is what lets a rule's class stand.
    expect(classifyMdr({ invasive: false, xrayImageRecording: true }).missingFacts).toEqual([]);
  });

  it('states no class below III for any device whose invasiveness was never given: an implant would be Rule 8', () => {
    // Each of these is a lower class than the same device implanted (Rule 8: IIb, or III when active or contraceptive).
    for (const facts of [{ activeTherapeutic: true }, { active: true, administersMedicine: true }, { software: true },
      { softwareDecisionSupport: true }, { xrayImageRecording: true }, { contraceptionOrStdPrevention: true }]) {
      const r = classifyMdr(facts);
      expect(r.class, JSON.stringify(facts)).toBeNull();
      expect(r.ruleApplied).toBe('not determined');
      expect(r.missingFacts, JSON.stringify(facts)).toEqual([MDR_MISSING_INVASIVE]);
    }
    expect(classifyMdr({ invasive: false, activeTherapeutic: true })).toMatchObject({ class: 'IIa', ruleApplied: 'Rule 9', missingFacts: [] });
    expect(classifyMdr({ invasive: false, software: true })).toMatchObject({ class: 'I', ruleApplied: 'Rule 11' });
    expect(classifyMdr({ implantable: true, contraceptionOrStdPrevention: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 15' });
    // A rule that already gives III needs nothing more.
    expect(classifyMdr({ softwareSeriousDecisions: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 11' });
  });

  it('never drops a qualifier given without the fact it qualifies: names that fact instead of stating a lower class', () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      // An X-ray / CT generator: Rule 10's last indent gives IIb, not Rule 13's I.
      [{ invasive: false, active: true, ionisingRadiation: true }, /activeTherapeutic \| activeDiagnostic/],
      [{ invasive: false, active: true, energyExchangePotentiallyHazardous: true }, /^activeTherapeutic \(/],
      [{ invasive: false, active: true, administrationPotentiallyHazardous: true }, /^administersMedicine \(/],
      [{ surgicallyInvasive: true, duration: 'transient', administrationPotentiallyHazardous: true }, /^administersMedicine \(/],
      [{ bodyOrificeInvasive: true, duration: 'transient', inhalationEssentialImpactOrLifeThreatening: true }, /^inhalationMedicinalProduct \(/],
    ];
    for (const [facts, missing] of cases) {
      const r = classifyMdr(facts as never);
      expect(r.class, JSON.stringify(facts)).toBeNull();
      expect(r.ruleApplied).toBe('not determined');
      expect(r.missingFacts.some((m) => missing.test(m)), `${JSON.stringify(facts)} → ${JSON.stringify(r.missingFacts)}`).toBe(true);
    }
    // With the fact it qualifies, each reaches its rule's IIb.
    expect(classifyMdr({ invasive: false, activeDiagnostic: true, ionisingRadiation: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 10' });
    expect(classifyMdr({ invasive: false, activeTherapeutic: true, ionisingRadiation: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 9' });
    expect(classifyMdr({ invasive: false, activeTherapeutic: true, energyExchangePotentiallyHazardous: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 9' });
    expect(classifyMdr({ invasive: false, active: true, administersMedicine: true, administrationPotentiallyHazardous: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 12' });
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'transient', administersMedicine: true, administrationPotentiallyHazardous: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 6' });
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'transient', ionisingRadiation: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 6' });
    expect(classifyMdr({ bodyOrificeInvasive: true, duration: 'transient', inhalationMedicinalProduct: true, inhalationEssentialImpactOrLifeThreatening: true }))
      .toMatchObject({ class: 'IIb', ruleApplied: 'Rule 20' });
    // A qualifier whose rule is read inside Rule 8 needs nothing more (Rule 8 does not read ionising radiation).
    expect(classifyMdr({ implantable: true, ionisingRadiation: true })).toMatchObject({ class: 'IIb', ruleApplied: 'Rule 8' });
  });

  it('refuses a qualifier whose own fact is stated false, rather than picking one reading', () => {
    for (const facts of [{ invasive: false, activeTherapeutic: false, energyExchangePotentiallyHazardous: true },
      { invasive: false, active: true, administersMedicine: false, administrationPotentiallyHazardous: true },
      { bodyOrificeInvasive: true, duration: 'transient', inhalationMedicinalProduct: false, inhalationEssentialImpactOrLifeThreatening: true }]) {
      expect(() => classifyMdr(facts as never), JSON.stringify(facts)).toThrow(DeviceClassificationFactError);
    }
  });

  it('states no class for an active device whose invasiveness was never given: Rule 13 is a default, too', () => {
    const r = classifyMdr({ active: true });
    expect(r.class).toBeNull();
    expect(r.missingFacts).toEqual([MDR_MISSING_INVASIVE]);
    expect(r.rationale).toMatch(/Rule 13/);
    expect(classifyMdr({ active: true, invasive: false })).toMatchObject({ class: 'I', ruleApplied: 'Rule 13', missingFacts: [] });
  });


  it('refuses a fact it does not know, rather than ignoring it and stating the class of a device without it', () => {
    const err = thrown(() => classifyMdr({ pacemaker: true } as never));
    expect(err).toBeInstanceOf(DeviceClassificationFactError);
    expect((err as DeviceClassificationFactError).code).toBe('VALIDATION');
    expect((err as Error).message).toMatch(/^MDR facts: "pacemaker" is not a fact the engine reads\./);
    expect((err as Error).message).toMatch(/activeImplantable/); // names the facts it does read
  });

  it('refuses a fact of the wrong type or outside its values ("true" is not true; "long" is not a duration)', () => {
    for (const facts of [{ implantable: 'true' }, { implantable: 1 }, { duration: 'long' }, { surgicallyInvasive: true, duration: 30 },
      { nanomaterialInternalExposure: 'very high' }, { injuredSkinOrMucosaContact: true }, 'implantable', ['implantable'], 7]) {
      expect(() => classifyMdr(facts as never), JSON.stringify(facts)).toThrow(DeviceClassificationFactError);
    }
  });

  it('refuses contradictory invasiveness rather than picking one reading', () => {
    for (const kind of ['implantable', 'surgicallyInvasive', 'bodyOrificeInvasive', 'jointReplacement']) {
      expect(() => classifyMdr({ invasive: false, [kind]: true }), kind).toThrow(DeviceClassificationFactError);
    }
  });
});

describe('MDR classification — a fact names the device it describes', () => {
  it('a device that is active by a Rule 9/10 fact is an active implantable when implanted (Rule 8 → III, not IIb)', () => {
    // An implantable loop recorder given as { implantable, monitorsVitalParametersImmediateDanger } was IIb (Rule 8; Rule 10).
    for (const fact of ['monitorsVitalParametersImmediateDanger', 'diagnosisPatientInImmediateDanger', 'controlsActiveTherapeuticIIb', 'controlsActiveImplantable']) {
      const r = classifyMdr({ implantable: true, [fact]: true } as never);
      expect(r.class, fact).toBe('III');
      expect(r.ruleApplied, fact).toMatch(/^Rule 8\b/);
      expect(r.ruleTrace.map((t) => t.id), fact).toContain('mdr-8-active-implantable');
      expect(r.missingFacts, fact).toEqual([]);
    }
  });

  it('never drops administrationPotentiallyHazardous on a device no rule reads it for (only Rules 6 and 12 do)', () => {
    for (const facts of [{ invasive: false, administersMedicine: true, administrationPotentiallyHazardous: true },
      { bodyOrificeInvasive: true, duration: 'short_term', administersMedicine: true, administrationPotentiallyHazardous: true }]) {
      const r = classifyMdr(facts as never);
      expect(r.class, JSON.stringify(facts)).toBeNull();
      expect(r.missingFacts.some((m) => /Rule 12/.test(m) && /Rule 6/.test(m)), JSON.stringify(r.missingFacts)).toBe(true);
    }
    // Where a rule already places the device at or above IIb for administering medicine, nothing more is needed.
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'short_term', administersMedicine: true, administrationPotentiallyHazardous: true }))
      .toMatchObject({ class: 'IIb', ruleApplied: 'Rule 7' });
    expect(classifyMdr({ implantable: true, administersMedicine: true, administrationPotentiallyHazardous: true })).toMatchObject({ class: 'III', ruleApplied: 'Rule 8' });
  });
});

describe('IVDR classification (Annex VIII Rules 1–7)', () => {
  it('blood-donation screening is Class D (Rule 1, first indent)', () => {
    expect(classifyIvdr({ bloodDonationScreening: true })).toMatchObject({ class: 'D', ruleApplied: 'Rule 1, first indent' });
  });

  it('Rule 1 is cited by indent, never by a letter it does not have (the citation form MDCG 2020-16 uses)', () => {
    expect(classifyIvdr({ lifeThreateningHighPropagation: true }).ruleApplied).toBe('Rule 1, second indent');
    expect(classifyIvdr({ infectiousLoadLifeThreatening: true }).ruleApplied).toBe('Rule 1, third indent');
    const rule1 = EU_IVDR_RULES.filter((r) => /^Rule 1\b/.test(r.rule));
    expect(rule1.map((r) => r.id)).toEqual(['ivdr-1-first-indent', 'ivdr-1-second-indent', 'ivdr-1-third-indent']);
    for (const r of rule1) expect(r.basis.ref, r.id).toMatch(/Rule 1, (first|second|third) indent$/);
    // Lettered citations only where the Annex letters the points: Rules 3, 4 and 5 (Rule 5's (a)–(c) are one row here).
    for (const r of EU_IVDR_RULES) {
      if (/\(/.test(r.rule)) expect(r.rule, r.id).toMatch(/^Rule (3\([a-m]\)|4\([ab]\))$/);
    }
    expect(EU_IVDR_RULES.find((r) => r.rule === 'Rule 5')?.ruleText).toMatch(/\(a\).*\(b\).*\(c\)/);
  });

});

describe('IVDR Rule 2 — blood-grouping markers read through closed tables', () => {
  it('blood grouping with no marker named states no class: the most common devices (ABO/RhD) are D', () => {
    const r = classifyIvdr({ bloodGrouping: true });
    expect(r).toMatchObject({ class: null, ruleApplied: 'not determined', missingFacts: [IVDR_MISSING_RULE2_MARKER] });
    expect(r.rationale).toMatch(/at least Class C/);
    // Saying the device determines no listed marker is the fact Rule 2's Class C needs.
    expect(classifyIvdr({ bloodGrouping: true, bloodGroupingHighRisk: false })).toMatchObject({ class: 'C', ruleApplied: 'Rule 2', missingFacts: [] });
    expect(classifyIvdr({ bloodGrouping: true, bloodGroupingHighRisk: true })).toMatchObject({ class: 'D', ruleApplied: 'Rule 2' });
    // A rule that already gives D needs nothing more.
    expect(classifyIvdr({ bloodGrouping: true, bloodDonationScreening: true }).class).toBe('D');
  });

  it('refuses contradictory Rule 2 facts rather than picking one reading', () => {
    for (const facts of [{ bloodGrouping: false, bloodGroupingMarker: 'ABO' }, { bloodGroupingHighRisk: false, bloodGroupingMarker: 'ABO' },
      { bloodGroupingHighRisk: true, bloodGroupingMarker: 'Lewis' }, { bloodGrouping: false, bloodGroupingHighRisk: true }]) {
      expect(() => classifyIvdr(facts), JSON.stringify(facts)).toThrow(DeviceClassificationFactError);
    }
  });

  it('blood grouping is C, and D only for a listed Rule 2 marker', () => {
    expect(classifyIvdr({ bloodGrouping: true, bloodGroupingMarker: 'Lewis (LE1)' }).class).toBe('C');
    expect(classifyIvdr({ bloodGrouping: true, bloodGroupingMarker: 'RH1' })).toMatchObject({ class: 'D', ruleApplied: 'Rule 2' });
    expect(classifyIvdr({ bloodGroupingMarker: ['Jka', 'Fyb'] }).class).toBe('D');
    // Kell beyond KEL1 is not listed.
    expect(classifyIvdr({ bloodGroupingMarker: 'KEL2' }).class).toBe('C');
  });

  it('reads the Annex\'s own system names, the ISBT codes and the usual aliases of a listed Rule 2 marker as Class D', () => {
    const asD = ['ABO', 'ABO system', 'RhD', 'Rh(D)', 'Rh D', 'anti-D', 'Rh', 'Rhesus', 'Kell', 'Kidd', 'Duffy', 'ABO/RhD',
      'ABO and RhD', 'anti-A, anti-B', 'weak D', 'Kidd (Jka)', 'Fy(a)', 'Duffy (Fy(b))', 'RH8', 'RHW1', 'Cw', 'K', 'KEL1',
      'JK2', 'FY1', 'ABO3', 'rh1', 'Rh0', 'RH0', 'Rho', 'Rh0(D)', 'Rho(D)', 'Rh factor', 'D antigen', 'c', 'e', 'E', 'C', 'RhCE', 'JKA',
      'FYA', 'Kell (K1)', 'Rh(D) weak', 'D (RH1)', 'anti-Kell',
      // A listed marker next to a non-listed one is still D: words run together never hide it.
      'HLA and RhD', 'Lewis and D', 'ABO grouping reagent'];
    for (const bloodGroupingMarker of asD) {
      expect(classifyIvdr({ bloodGrouping: true, bloodGroupingMarker }), bloodGroupingMarker).toMatchObject({ class: 'D', ruleApplied: 'Rule 2' });
      expect(classifyIvdr({ bloodGroupingMarker }).class, `${bloodGroupingMarker} without bloodGrouping`).toBe('D');
    }
    // One listed marker anywhere in a list makes it D.
    expect(classifyIvdr({ bloodGroupingMarker: ['Lewis (LE1)', 'Kell'] }).class).toBe('D');
  });

  it('a recognised marker outside the Rule 2 list stays Class C', () => {
    for (const bloodGroupingMarker of ['Lewis (LE1)', 'Lewis', 'KEL2', 'k', 'M', 'MNS', 'Lutheran', 'Diego (DI1)', 'HLA-A', 'HLA class II typing',
      'HPA-1a', 'HLA-A*02:01', 'RH6', 'LE1', 'HLA', 'HLA-B27', 'HLA-Bw4', 'HLA-DR4', 'HLA-DRB1*15:01', 'HLA-DQB1*06:02', 'HNA-1a', 'HPA-5b',
      'HLA-A*02:01:01:01', 'HLA-B*27:05', 'HLA typing']) {
      expect(classifyIvdr({ bloodGrouping: true, bloodGroupingMarker }), bloodGroupingMarker).toMatchObject({ class: 'C', ruleApplied: 'Rule 2' });
    }
  });

  it('refuses a blood-grouping marker it cannot read rather than stating Class C', () => {
    for (const bloodGroupingMarker of ['cancer', 'xyz', '', '  ', 'Bombay phenotype', ['ABO', 'foo'], 7, { abo: true }, [],
      // ISBT antigen numbers have no 0 and no leading zero: a zero-padded code is not read as a non-listed antigen.
      'RH01', 'KEL01', 'ABO01', 'JK01', 'FY01', 'RH001', 'KEL0', 'KEL:1', 'HLA!', 'HLA-A$', 'Rh-positive', 'Rh ag', 'anti-anti-D', 'antigen',
      // HLA / HPA / HNA typing is a closed grammar (locus table, allele digits): a listed name joined on is never typing.
      'HLA-ABO', 'HLA-ABO typing', 'HLA-A:RhD', 'HPA-RHD', 'HLA-KELL', 'HLA-RhD', 'HNA-ABO', 'HLA-A*RhD', 'HLA-DUFFY', 'HLAABO', 'HPA-1x',
      'HLA-A-B', 'HLA-A**02']) {
      const err = thrown(() => classifyIvdr({ bloodGrouping: true, bloodGroupingMarker: bloodGroupingMarker as never }));
      expect(err, JSON.stringify(bloodGroupingMarker)).toBeInstanceOf(DeviceClassificationFactError);
    }
    const err = thrown(() => classifyIvdr({ bloodGrouping: true, bloodGroupingMarker: ['RhD', 'foo'] }));
    expect((err as DeviceClassificationFactError).code).toBe('VALIDATION');
    expect((err as Error).message).toMatch(/^bloodGroupingMarker: "foo" is not a blood-group or tissue-typing marker/);
  });

  it('reads a hostile marker in linear time and refuses an over-long one (no catastrophic backtracking)', () => {
    for (const n of [30, 2000]) {
      for (const bloodGroupingMarker of ['HLA' + '1:'.repeat(n) + '!', 'HLA' + 'A'.repeat(n) + '!', 'HLA-A*' + '01:'.repeat(n) + '!', '('.repeat(n) + 'x', 'anti-'.repeat(n) + 'x',
        ' '.repeat(n) + '!', 'Rule 3 '.repeat(n)]) {
        const t0 = performance.now();
        thrown(() => classifyIvdr({ bloodGrouping: true, bloodGroupingMarker }));
        thrown(() => classifyIvdr({ rule3Points: bloodGroupingMarker }));
        // Generous bound: the reader is linear; the reverted regex took 2.6 s at n=12, and seconds-to-minutes beyond.
        expect(performance.now() - t0, `${bloodGroupingMarker.slice(0, 20)}… (n=${n})`).toBeLessThan(250);
      }
    }
    const long = 'HLA-' + 'A'.repeat(MAX_FACT_TEXT_LENGTH);
    expect((thrown(() => classifyIvdr({ bloodGroupingMarker: long })) as Error).message).toMatch(/longer than/);
  });

});

describe('IVDR Rules 3–7', () => {
  it('a companion diagnostic is Class C under Rule 3(f)', () => {
    const r = classifyIvdr({ companionDiagnostic: true });
    expect(r.class).toBe('C');
    expect(r.ruleApplied).toBe('Rule 3(f)');
  });

  it('Rule 3 sub-points are cited by letter', () => {
    expect(classifyIvdr({ rule3Points: ['h'] }).ruleApplied).toBe('Rule 3(h)');
    expect(classifyIvdr({ rule3Points: ['i'] }).ruleApplied).toBe('Rule 3(i)');
  });

  it('reads a Rule 3 sub-point however it is written: one string or a list, any letter case, with or without "Rule 3"', () => {
    for (const rule3Points of ['h', 'H', '(h)', '3(h)', '3h', 'Rule 3(h)', 'rule 3 (h)', 'Rule 3 h', ['h'], ['3(H)']]) {
      expect(classifyIvdr({ rule3Points }), JSON.stringify(rule3Points)).toMatchObject({ class: 'C', ruleApplied: 'Rule 3(h)' });
    }
  });

  it('refuses a Rule 3 sub-point it cannot read rather than falling through to Rule 6 (Class B)', () => {
    for (const rule3Points of ['n', 'cancer', '', ['h', 'z'], 7, { h: true }, ['Rule 4(a)'], 'Rule (h)', '3((h))', []] as never[]) {
      expect(() => classifyIvdr({ rule3Points }), JSON.stringify(rule3Points)).toThrow(DeviceClassificationFactError);
    }
    const err = thrown(() => classifyIvdr({ rule3Points: ['h', 'z'] }));
    expect((err as DeviceClassificationFactError).code).toBe('VALIDATION');
    // Names the value it could not read — only that one.
    expect((err as Error).message).toMatch(/^rule3Points: "z" is not an IVDR Annex VIII Rule 3 sub-point\./);
  });

  it('self-testing is Class C under Rule 4(a)', () => {
    expect(classifyIvdr({ selfTesting: true })).toMatchObject({ class: 'C', ruleApplied: 'Rule 4(a)' });
  });

  it('a self-test for an enumerated Rule 4(a) analyte is Class B, however the analyte is written', () => {
    expect(classifyIvdr({ selfTesting: true, selfTestAnalyte: 'urine_glucose' })).toMatchObject({ class: 'B', ruleApplied: 'Rule 4(a)' });
    for (const selfTestAnalyte of ['pregnancy', 'Fertility', 'cholesterol', 'urine glucose', 'Urine-Glucose', 'glucose in urine',
      'urine erythrocytes', 'urine leukocytes', 'urine leucocytes', 'urine bacteria']) {
      expect(classifyIvdr({ selfTesting: true, selfTestAnalyte }).class, selfTestAnalyte).toBe('B');
    }
    // Any analyte not on the Rule 4(a) list is named "other" and keeps the rule's Class C.
    expect(classifyIvdr({ selfTesting: true, selfTestAnalyte: 'other' })).toMatchObject({ class: 'C', ruleApplied: 'Rule 4(a)' });
  });

  it('refuses a self-test analyte it cannot read rather than guessing B or C', () => {
    for (const facts of [{ selfTesting: true, selfTestAnalyte: 'blood glucose' }, { selfTesting: true, selfTestAnalyte: 'urine glucoses' },
      { selfTesting: true, selfTestAnalyte: 7 }, { selfTestAnalyte: 'pregnancy' }, { selfTesting: false, selfTestAnalyte: 'pregnancy' }]) {
      expect(() => classifyIvdr(facts as never), JSON.stringify(facts)).toThrow(DeviceClassificationFactError);
    }
  });

  it('a control without an assigned value is Class B under Rule 7', () => {
    expect(classifyIvdr({ controlWithoutAssignedValue: true })).toMatchObject({ class: 'B', ruleApplied: 'Rule 7' });
  });

  it('a general lab reagent/instrument is Class A', () => {
    expect(classifyIvdr({ generalLabOrInstrumentOrReceptacle: true }).class).toBe('A');
  });

  const NO_HIGHER_RULE = {
    bloodDonationScreening: false, lifeThreateningHighPropagation: false, infectiousLoadLifeThreatening: false,
    bloodGrouping: false, infectiousOrCancerOrGenetic: false, selfTesting: false,
  };

  it('gives Class B (Rule 6) only when the facts given say each higher-class rule does not apply', () => {
    expect(classifyIvdr(NO_HIGHER_RULE)).toMatchObject({ class: 'B', ruleApplied: 'Rule 6', missingFacts: [] });
  });

  it('states no class when no IVDR fact was given at all: Rule 6 is not a verdict on facts never given', () => {
    for (const facts of [{}, null as never, undefined as never, { selfTesting: null } as never]) {
      const r = classifyIvdr(facts);
      expect(r.class, JSON.stringify(facts)).toBeNull();
      expect(r.ruleApplied).toBe('not determined');
      expect(r.missingFacts).toEqual([...IVDR_RULE6_MISSING]);
    }
    expect(classifyIvdr({ companionDiagnostic: true }).missingFacts).toEqual([]);
  });

  it('one false fact is not a statement that no other rule applies: Rule 6 names the facts still unstated', () => {
    for (const facts of [{ companionDiagnostic: false }, { bloodGroupingHighRisk: false }, { selfTesting: false, companionDiagnostic: false }]) {
      const r = classifyIvdr(facts);
      expect(r.class, JSON.stringify(facts)).toBeNull();
      expect(r.missingFacts.length, JSON.stringify(facts)).toBeGreaterThan(0);
      expect(r.rationale).toMatch(/Rule 6/);
    }
    expect(classifyIvdr({ ...NO_HIGHER_RULE, selfTesting: undefined }).missingFacts).toEqual(['selfTesting (true or false)']);
  });

  it('refuses contradictory Rule 3 facts rather than picking one reading', () => {
    for (const facts of [{ companionDiagnostic: false, rule3Points: 'f' }, { infectiousOrCancerOrGenetic: false, rule3Points: ['h'] },
      { infectiousOrCancerOrGenetic: false, companionDiagnostic: true }]) {
      expect(() => classifyIvdr(facts), JSON.stringify(facts)).toThrow(DeviceClassificationFactError);
    }
  });

  it('refuses an IVDR fact it does not know, or of the wrong type', () => {
    const err = thrown(() => classifyIvdr({ cancerScreening: true } as never));
    expect(err).toBeInstanceOf(DeviceClassificationFactError);
    expect((err as Error).message).toMatch(/^IVDR facts: "cancerScreening" is not a fact the engine reads\./);
    expect((err as Error).message).toMatch(/rule3Points/);
    for (const facts of [{ selfTesting: 'yes' }, { companionDiagnostic: 1 }, 'selfTesting', [true]]) {
      expect(() => classifyIvdr(facts as never), JSON.stringify(facts)).toThrow(DeviceClassificationFactError);
    }
  });

  it('takes the highest class (infectious + self-test → C)', () => {
    expect(classifyIvdr({ infectiousOrCancerOrGenetic: true, selfTesting: true }).class).toBe('C');
  });
});

describe('the EU rule tables are the one record, each row with a basis', () => {
  it('MDR table covers Rules 1–22 and IVDR table Rules 1–7', () => {
    const mdrRules = new Set(EU_MDR_RULES.map((r) => Number(/^Rule (\d+)/.exec(r.rule)?.[1])));
    for (let n = 1; n <= 22; n++) expect(mdrRules.has(n), `MDR Rule ${n}`).toBe(true);
    const ivdrRules = new Set(EU_IVDR_RULES.map((r) => Number(/^Rule (\d+)/.exec(r.rule)?.[1])));
    for (let n = 1; n <= 7; n++) expect(ivdrRules.has(n), `IVDR Rule ${n}`).toBe(true);
  });

  it('every row carries a well-formed basis, labelled recall with the EUR-Lex URL until checked', () => {
    for (const row of [...EU_MDR_RULES, ...EU_IVDR_RULES]) {
      expect(basisProblems(row.basis), row.id).toEqual([]);
      if (row.basis.confidence !== 'regulator-text') {
        expect(row.basis.confidence, row.id).toBe('recall');
        expect(row.basis.url, row.id).toMatch(/^https:\/\/eur-lex\.europa\.eu\/eli\/reg\/2017\/74[56]\/oj$/);
      }
      expect(row.ruleText.length, row.id).toBeGreaterThan(20);
    }
    expect(new Set([...EU_MDR_RULES, ...EU_IVDR_RULES].map((r) => r.id)).size).toBe(EU_MDR_RULES.length + EU_IVDR_RULES.length);
  });

  it('the trace says the wording is recall, never checked regulator text', () => {
    const r = classifyIvdr({ companionDiagnostic: true });
    expect(r.ruleTrace[0].basisLabel).toMatch(/recall/);
  });
});

describe('FDA pathway recommendation (heuristic)', () => {
  it('exempt device → exempt', () => {
    expect(recommendFdaPathway({ exempt: true }).pathway).toBe('exempt');
  });
  it('Class III → PMA', () => {
    expect(recommendFdaPathway({ fdaClass: 'III' }).pathway).toBe('pma');
  });
  it('predicate available → 510(k)', () => {
    expect(recommendFdaPathway({ fdaClass: 'II', predicateAvailable: true }).pathway).toBe('510k');
  });
  it('novel low-to-moderate risk, no predicate → De Novo', () => {
    expect(recommendFdaPathway({ novelLowModerateRisk: true }).pathway).toBe('de_novo');
  });
  it('no predicate and risk unestablished → PMA (conservative default)', () => {
    expect(recommendFdaPathway({}).pathway).toBe('pma');
  });
  it('every recommendation carries a confirm caveat', () => {
    expect(recommendFdaPathway({ exempt: true }).caveat).toMatch(/classification/i);
  });
});
