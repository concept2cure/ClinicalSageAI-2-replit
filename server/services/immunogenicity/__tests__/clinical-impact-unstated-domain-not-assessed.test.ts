/**
 * An unstated clinical-impact domain is not assessed: absent is not false
 * (audit finding 10, 2026-10-15).
 *
 * What the code used to do: each domain was `present = input === true`, so
 * `{}` came back overallSeverity NONE, "No clinical-impact domains currently
 * flagged", and "No endogenous cross-reactivity expected/observed", an
 * expectation nobody stated. `{ pkImpact: true }` read the missing
 * exposureReductionFraction as 0 and graded the PK impact 'low'.
 * Hypersensitivity with igeMediated unstated was graded as non-IgE ('high'),
 * and cross-reactivity with endogenousLifeSustaining unstated as not
 * life-sustaining ('high').
 */
import { describe, expect, it } from 'vitest';
import {
  classifyImmunogenicityClinicalImpact,
  type ClinicalImpactParams,
} from '../immunogenicity-knowledge';

const ALL_ABSENT: ClinicalImpactParams = {
  pkImpact: false,
  neutralizingEfficacyLoss: false,
  hypersensitivity: false,
  endogenousCrossReactivity: false,
};

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string };
  }
  return undefined;
}

describe('classifyImmunogenicityClinicalImpact: absent is not false', () => {
  it('{} leaves every domain not assessed and the overall severity undetermined', () => {
    const r = classifyImmunogenicityClinicalImpact({});

    expect(r.overallSeverity).toBe('undetermined');
    expect(r.domains.map((d) => d.present)).toEqual([null, null, null, null]);
    expect(r.domains.map((d) => d.severity)).toEqual(['undetermined', 'undetermined', 'undetermined', 'undetermined']);
    expect(r.notAssessed.map((n) => n.input)).toEqual([
      'pkImpact',
      'neutralizingEfficacyLoss',
      'hypersensitivity',
      'endogenousCrossReactivity',
    ]);
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/expected\/observed/);
    expect(text).not.toMatch(/No clinical-impact domains currently flagged/);
  });

  it('does not grade a PK impact whose magnitude was not stated', () => {
    const r = classifyImmunogenicityClinicalImpact({ ...ALL_ABSENT, pkImpact: true });

    expect(r.domains[0]).toMatchObject({ present: true, severity: 'undetermined' });
    expect(r.notAssessed.map((n) => n.input)).toEqual(['exposureReductionFraction']);
    expect(r.overallSeverity).toBe('undetermined');

    const graded = classifyImmunogenicityClinicalImpact({ ...ALL_ABSENT, pkImpact: true, exposureReductionFraction: 0.1 });
    expect(graded.domains[0].severity).toBe('low');
    expect(graded.overallSeverity).toBe('low');
  });

  it('does not assume a hypersensitivity is non-IgE, or a counterpart not life-sustaining', () => {
    const hyper = classifyImmunogenicityClinicalImpact({ ...ALL_ABSENT, hypersensitivity: true });
    expect(hyper.domains[2]).toMatchObject({ present: true, severity: 'undetermined' });
    expect(hyper.domains[2].description).not.toMatch(/non-IgE/);
    expect(hyper.notAssessed.map((n) => n.input)).toEqual(['igeMediated']);

    const cross = classifyImmunogenicityClinicalImpact({ ...ALL_ABSENT, endogenousCrossReactivity: true });
    expect(cross.domains[3]).toMatchObject({ present: true, severity: 'undetermined' });
    expect(cross.notAssessed.map((n) => n.input)).toEqual(['endogenousLifeSustaining']);
  });

  it('grades NONE only when every domain is stated absent', () => {
    const r = classifyImmunogenicityClinicalImpact(ALL_ABSENT);

    expect(r.overallSeverity).toBe('none');
    expect(r.notAssessed).toEqual([]);
    expect(r.domains.map((d) => d.present)).toEqual([false, false, false, false]);
  });

  it('a critical domain is critical overall, since nothing unassessed can rank above it', () => {
    const r = classifyImmunogenicityClinicalImpact({ hypersensitivity: true, igeMediated: true });

    expect(r.overallSeverity).toBe('critical');
    expect(r.notAssessed.map((n) => n.input)).toEqual(['pkImpact', 'neutralizingEfficacyLoss', 'endogenousCrossReactivity']);
  });

  it('refuses an exposure reduction outside 0 to 1, naming the field', () => {
    expect(
      thrown(() => classifyImmunogenicityClinicalImpact({ ...ALL_ABSENT, pkImpact: true, exposureReductionFraction: 1.7 })),
    ).toMatchObject({ name: 'ComputationRefusal', code: 'invalid_input', field: 'exposureReductionFraction' });
  });
});
