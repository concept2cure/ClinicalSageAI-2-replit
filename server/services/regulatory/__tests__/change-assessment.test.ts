/**
 * Change-management decision engine tests.
 *
 * 2026-11-12 (P-122, the device change determination reached from a Quality change record): the engines read an
 * unanswered question as "no". With no answers at all, assessFdaChange returned letter_to_file ("No flowchart trigger
 * is met") and assessEuSignificantChange returned significant: false, and so did POST /api/ivd-lifecycle/change/*
 * with an empty body. An unanswered question is now refused by field, as the other IVD lifecycle engines refuse one
 * (ana/__tests__/ivd-lifecycle-unstated-inputs.test.ts). The questions asked of a person are the engines' inputs,
 * and each engine's rules carry a version that every answer set's outcome is pinned to.
 */

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  assessFdaChange, assessEuSignificantChange, FDA_CHANGE_FACTS, EU_CHANGE_FACTS, FDA_CHANGE_RULES, EU_CHANGE_RULES,
} from '../change-assessment';
import { DEVICE_CHANGE_QUESTIONS } from '../../../../shared/regulatory/change-control-taxonomy';

const noChange = {
  affectsIndicationsForUse: false,
  couldSignificantlyAffectSafetyOrEffectiveness: false,
  changesControlMechanismOrOperatingPrinciple: false,
  changesPatientContactingMaterials: false,
  softwareChangeAffectsRisk: false,
  riskAssessmentShowsNewOrModifiedRisk: false,
  verificationDemonstratesEquivalence: true,
};

describe('assessFdaChange', () => {
  it('letter-to-file when no trigger met', () => {
    const r = assessFdaChange(noChange);
    expect(r.decision).toBe('letter_to_file');
  });

  it('intended-use change escalates beyond 510(k)', () => {
    const r = assessFdaChange({ ...noChange, affectsIndicationsForUse: true });
    expect(r.decision).toBe('pma_supplement_or_de_novo');
  });

  it('new 510(k) when S&E affected without demonstrated equivalence', () => {
    const r = assessFdaChange({
      ...noChange,
      couldSignificantlyAffectSafetyOrEffectiveness: true,
      verificationDemonstratesEquivalence: false,
    });
    expect(r.decision).toBe('new_510k');
  });

  it('letter-to-file when triggers exist but equivalence demonstrated', () => {
    const r = assessFdaChange({
      ...noChange,
      changesPatientContactingMaterials: true,
      verificationDemonstratesEquivalence: true,
    });
    expect(r.decision).toBe('letter_to_file');
    expect(r.triggers.length).toBeGreaterThan(0);
  });
});

describe('assessEuSignificantChange', () => {
  it('significant when intended purpose changes', () => {
    const r = assessEuSignificantChange({
      changesIntendedPurpose: true,
      changesDesignOrPerformanceOutsideSpec: false,
      changesSterilisationOrMaterials: false,
      significantSoftwareChange: false,
      newOperatingPrinciple: false,
    });
    expect(r.significant).toBe(true);
  });

  it('non-significant when no criterion met', () => {
    const r = assessEuSignificantChange({
      changesIntendedPurpose: false,
      changesDesignOrPerformanceOutsideSpec: false,
      changesSterilisationOrMaterials: false,
      significantSoftwareChange: false,
      newOperatingPrinciple: false,
    });
    expect(r.significant).toBe(false);
  });
});

const euNoChange = {
  changesIntendedPurpose: false,
  changesDesignOrPerformanceOutsideSpec: false,
  changesSterilisationOrMaterials: false,
  significantSoftwareChange: false,
  newOperatingPrinciple: false,
};

function refusal(run: () => unknown): { name?: string; code?: string; field?: string; message?: string } {
  try {
    run();
  } catch (e) {
    return e as { name?: string; code?: string; field?: string; message?: string };
  }
  return {};
}

describe('an unanswered question is refused by field, never read as no', () => {
  it('no answers at all: neither engine returns a verdict', () => {
    expect(refusal(() => assessFdaChange({} as never))).toMatchObject({ name: 'ComputationRefusal', code: 'missing_input' });
    expect(refusal(() => assessEuSignificantChange({} as never))).toMatchObject({ name: 'ComputationRefusal', code: 'missing_input' });
    expect(refusal(() => assessFdaChange(undefined as never)).name).toBe('ComputationRefusal');
  });

  it('one question left out is named, for each question of each engine', () => {
    for (const field of Object.keys(noChange)) {
      const r = refusal(() => assessFdaChange({ ...noChange, [field]: undefined } as never));
      expect(r, field).toMatchObject({ name: 'ComputationRefusal', field });
      expect(r.message, field).toContain(`${field} (true or false)`);
    }
    for (const field of Object.keys(euNoChange)) {
      const r = refusal(() => assessEuSignificantChange({ ...euNoChange, [field]: undefined } as never));
      expect(r, field).toMatchObject({ name: 'ComputationRefusal', field });
    }
  });

  it('text is not an answer: "false" is refused, not read as yes', () => {
    expect(refusal(() => assessFdaChange({ ...noChange, affectsIndicationsForUse: 'false' } as never)))
      .toMatchObject({ name: 'ComputationRefusal', code: 'invalid_input', field: 'affectsIndicationsForUse' });
    expect(refusal(() => assessEuSignificantChange({ ...euNoChange, newOperatingPrinciple: 0 } as never)))
      .toMatchObject({ name: 'ComputationRefusal', code: 'invalid_input', field: 'newOperatingPrinciple' });
  });
});

describe('the questions asked of a person are the engines\' inputs', () => {
  it('each market\'s questions name every input of its engine, once, in plain words', () => {
    expect(DEVICE_CHANGE_QUESTIONS.us.map((q) => q.key).sort()).toEqual(Object.keys(noChange).sort());
    expect(DEVICE_CHANGE_QUESTIONS.eu.map((q) => q.key).sort()).toEqual(Object.keys(euNoChange).sort());
    expect([...FDA_CHANGE_FACTS]).toEqual(DEVICE_CHANGE_QUESTIONS.us.map((q) => q.key));
    expect([...EU_CHANGE_FACTS]).toEqual(DEVICE_CHANGE_QUESTIONS.eu.map((q) => q.key));
    for (const q of [...DEVICE_CHANGE_QUESTIONS.us, ...DEVICE_CHANGE_QUESTIONS.eu]) {
      expect(q.question, q.key).toMatch(/^[A-Z].+\?$/);
    }
  });
});

/** Every answer set of an engine and what it returns for it, as one digest. */
function outcomesDigest(facts: readonly string[], assess: (answers: never) => unknown): string {
  const outcomes: unknown[] = [];
  for (let bits = 0; bits < 2 ** facts.length; bits += 1) {
    const answers = Object.fromEntries(facts.map((fact, i) => [fact, Boolean(bits & (1 << i))]));
    outcomes.push([answers, assess(answers as never)]);
  }
  return createHash('sha256').update(JSON.stringify(outcomes)).digest('hex');
}

describe('the rules carry a version, and every answer set\'s outcome is pinned to it', () => {
  /* A rule that changes, in a decision, a rationale or a trigger, changes its digest. Give the rules a new version
     (FDA_CHANGE_RULES / EU_CHANGE_RULES) and pin the new digest here in the same change: a verdict kept on a record
     names the version it was reached under. */
  it('FDA 510(k) change rules', () => {
    expect(FDA_CHANGE_RULES).toBe('fda-510k-change-2017/1');
    expect(outcomesDigest(Object.keys(noChange), assessFdaChange)).toBe('d7e175a69907ac297c1fc3b493a6d50512aa85082b174e8f37f88db5f1b5f1e1');
  });

  it('EU significant-change rules', () => {
    expect(EU_CHANGE_RULES).toBe('mdcg-2020-3/1');
    expect(outcomesDigest(Object.keys(euNoChange), assessEuSignificantChange)).toBe('c9a468c7491f92791eff830294d84376d34696fd877f00a6b75409f5a0f0694e');
  });

  it('the three FDA outcomes and both EU outcomes are all reachable, so the pin covers each', () => {
    const fda = new Set<string>();
    for (let bits = 0; bits < 2 ** 7; bits += 1) {
      const answers = Object.fromEntries(Object.keys(noChange).map((fact, i) => [fact, Boolean(bits & (1 << i))]));
      fda.add(assessFdaChange(answers as never).decision);
    }
    expect([...fda].sort()).toEqual(['letter_to_file', 'new_510k', 'pma_supplement_or_de_novo']);
    expect(assessEuSignificantChange(euNoChange).significant).toBe(false);
    expect(assessEuSignificantChange({ ...euNoChange, significantSoftwareChange: true }).significant).toBe(true);
  });
});
