/**
 * Reviewer-persona scope and rule tests.
 *
 * Pure unit tests — no DB. Verifies which personas activate for a given
 * program, what questions they emit for representative inputs, and that
 * every emitted question carries persona attribution + a citation.
 */

import { describe, expect, test } from 'vitest';

import {
  ALL_PERSONA_CODES,
  REVIEWER_PERSONAS,
  type PersonaInputs,
  type PersonaProgramFacts,
} from '../reviewer-personas';

const baseProgram = (overrides: Partial<PersonaProgramFacts> = {}): PersonaProgramFacts => ({
  programType: '510K',
  productType: 'device',
  deviceClass: 'II',
  primaryAgency: 'FDA',
  ...overrides,
});

const baseIntel = {
  contradictionCount: 0,
  orphanClaimCount: 0,
  unsupportedClaimCount: 0,
  defensibilityScore: null,
  missingSections: [],
};

const make = (overrides: Partial<PersonaInputs>): PersonaInputs => ({
  program: baseProgram(),
  packet: null,
  intel: baseIntel,
  ...overrides,
});

describe('appliesTo', () => {
  test('FDA 510(k) reviewer applies to FDA 510K programs only', () => {
    const p = REVIEWER_PERSONAS.fda_510k_reviewer;
    expect(p.appliesTo(baseProgram())).toBe(true);
    expect(p.appliesTo(baseProgram({ programType: 'PMA' }))).toBe(false);
    expect(p.appliesTo(baseProgram({ primaryAgency: 'EMA' }))).toBe(false);
  });

  test('FDA PMA reviewer applies to PMA or Class III FDA programs', () => {
    const p = REVIEWER_PERSONAS.fda_pma_reviewer;
    expect(p.appliesTo(baseProgram({ programType: 'PMA' }))).toBe(true);
    expect(p.appliesTo(baseProgram({ deviceClass: 'III' }))).toBe(true);
    expect(p.appliesTo(baseProgram({ programType: '510K', deviceClass: 'II' }))).toBe(false);
  });

  test('Software reviewer applies only when isSoftware/isAiMl=true', () => {
    const p = REVIEWER_PERSONAS.fda_software_reviewer;
    expect(p.appliesTo(baseProgram())).toBe(false);
    expect(p.appliesTo(baseProgram({ isSoftware: true }))).toBe(true);
    expect(p.appliesTo(baseProgram({ isAiMl: true }))).toBe(true);
  });

  test('Cyber reviewer mirrors software-reviewer scope', () => {
    const p = REVIEWER_PERSONAS.fda_cyber_reviewer;
    expect(p.appliesTo(baseProgram())).toBe(false);
    expect(p.appliesTo(baseProgram({ isSoftware: true }))).toBe(true);
  });

  test('Notified Body clinical applies to EU/CER programs', () => {
    const p = REVIEWER_PERSONAS.eu_notified_body_clinical;
    expect(p.appliesTo(baseProgram({ primaryAgency: 'EMA' }))).toBe(true);
    expect(p.appliesTo(baseProgram({ programType: 'CER' }))).toBe(true);
    expect(p.appliesTo(baseProgram())).toBe(false);
  });

  test('IVDR evaluator applies only to IVD programs', () => {
    const p = REVIEWER_PERSONAS.ivdr_performance_evaluator;
    expect(p.appliesTo(baseProgram({ isIvd: true }))).toBe(true);
    expect(p.appliesTo(baseProgram({ productType: 'ivd' }))).toBe(true);
    expect(p.appliesTo(baseProgram())).toBe(false);
  });

  test('Labeling and QMS reviewers always apply', () => {
    expect(REVIEWER_PERSONAS.labeling_reviewer.appliesTo(baseProgram())).toBe(true);
    expect(REVIEWER_PERSONAS.quality_systems_reviewer.appliesTo(baseProgram())).toBe(true);
  });
});

describe('rule outputs', () => {
  test('FDA 510(k) reviewer raises critical questions on IU_MISMATCH and TECH_DIFFERENCE', () => {
    const p = REVIEWER_PERSONAS.fda_510k_reviewer;
    const out = p.rules(
      make({
        packet: {
          defenseReadinessScore: 80,
          topRisks: ['IU_MISMATCH', 'TECH_DIFFERENCE'],
          riskCodesUsed: [],
          predicateKNumber: 'K123',
        },
      })
    );
    const triggers = out.map(q => q.trigger);
    expect(triggers).toContain('IU_MISMATCH risk code present');
    expect(triggers).toContain('TECH_DIFFERENCE risk code present');
    for (const q of out) {
      expect(q.persona).toBe('fda_510k_reviewer');
      expect(q.citation && q.citation.length).toBeGreaterThan(0);
    }
  });

  test('FDA 510(k) reviewer flags low defense readiness as RTA risk', () => {
    const out = REVIEWER_PERSONAS.fda_510k_reviewer.rules(
      make({
        packet: {
          defenseReadinessScore: 35,
          topRisks: [],
          riskCodesUsed: [],
          predicateKNumber: 'K123',
        },
      })
    );
    const rta = out.find(q => q.trigger.includes('defense_readiness_score'));
    expect(rta).toBeDefined();
    expect(rta!.severity).toBe('critical');
    expect(rta!.citation).toMatch(/RTA/);
  });

  test('Software reviewer demands PCCP when ML_ADAPTIVITY is flagged', () => {
    const out = REVIEWER_PERSONAS.fda_software_reviewer.rules(
      make({
        program: baseProgram({ isAiMl: true }),
        packet: {
          defenseReadinessScore: 80,
          topRisks: ['ML_ADAPTIVITY'],
          riskCodesUsed: [],
          predicateKNumber: null,
        },
      })
    );
    const pccp = out.find(q => q.trigger === 'ML_ADAPTIVITY risk code');
    expect(pccp).toBeDefined();
    expect(pccp!.citation).toMatch(/PCCP/i);
  });

  test('Cyber reviewer always asks about SBOM when in scope', () => {
    const out = REVIEWER_PERSONAS.fda_cyber_reviewer.rules(
      make({ program: baseProgram({ isSoftware: true }) })
    );
    const sbom = out.find(q => q.question.toLowerCase().includes('sbom'));
    expect(sbom).toBeDefined();
    expect(sbom!.citation).toMatch(/Cybersecurity/);
  });

  test('Notified Body clinical references MDR Article 61', () => {
    const out = REVIEWER_PERSONAS.eu_notified_body_clinical.rules(
      make({
        program: baseProgram({ primaryAgency: 'EMA' }),
        intel: { ...baseIntel, unsupportedClaimCount: 3 },
      })
    );
    expect(out.some(q => q.citation && q.citation.includes('MDR'))).toBe(true);
  });

  test('IVDR evaluator demands all three performance pillars', () => {
    const out = REVIEWER_PERSONAS.ivdr_performance_evaluator.rules(
      make({ program: baseProgram({ isIvd: true }) })
    );
    expect(out.some(q => q.question.toLowerCase().includes('three performance'))).toBe(true);
  });

  test('Biostat reviewer ties contradictions to ICH E9(R1)', () => {
    const out = REVIEWER_PERSONAS.biostat_reviewer.rules(
      make({
        program: baseProgram({ programType: 'PMA', deviceClass: 'III' }),
        intel: { ...baseIntel, contradictionCount: 2 },
      })
    );
    const ich = out.find(q => q.citation && q.citation.includes('ICH E9'));
    expect(ich).toBeDefined();
  });

  test('every persona emits questions with persona + citation set', () => {
    for (const code of ALL_PERSONA_CODES) {
      const persona = REVIEWER_PERSONAS[code];
      // Construct an input that activates as much as possible to exercise the rules
      const out = persona.rules(
        make({
          program: baseProgram({
            isSoftware: true,
            isAiMl: true,
            isIvd: true,
            primaryAgency: 'FDA',
            programType: 'PMA',
            deviceClass: 'III',
          }),
          packet: {
            defenseReadinessScore: 40,
            topRisks: ['IU_MISMATCH', 'TECH_DIFFERENCE', 'ML_ADAPTIVITY', 'LABELING_IFU_GAP'],
            riskCodesUsed: [],
            predicateKNumber: 'K000',
          },
          intel: {
            contradictionCount: 2,
            orphanClaimCount: 1,
            unsupportedClaimCount: 4,
            defensibilityScore: 50,
            missingSections: [],
          },
        })
      );
      // Personas are allowed to emit zero questions for an irrelevant input,
      // but when they do emit, every question must carry persona + citation.
      for (const q of out) {
        expect(q.persona).toBe(code);
        expect(q.citation && q.citation.length).toBeGreaterThan(0);
        expect(q.question.length).toBeGreaterThan(0);
        expect(['critical', 'warning', 'info']).toContain(q.severity);
      }
    }
  });
});
