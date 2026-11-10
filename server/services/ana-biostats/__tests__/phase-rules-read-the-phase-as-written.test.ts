/**
 * The judgment engine's phase rules fire on the phase as callers write it.
 *
 * Until 2026-10-31 every rule compared `input.phase === 'III'` / `'II'`, and no
 * caller sends that: the bridge's design adapter sends "Phase III", the
 * workbench "Phase 3", AnA "3" or "2/3". So a confirmatory design with no
 * estimand was rated ADEQUATE on estimand clarity — the non-confirmatory branch
 * (score 70) — when ICH E9(R1) makes it the critical gap (score 40,
 * inadequate). These cases pin the one reading (`canonicalPhase`,
 * input-normalizer.ts) and the rules that read it.
 */
import { describe, expect, it } from 'vitest';
import { canonicalPhase } from '../input-normalizer';
import { computationEngine } from '../computation-engine';
import { judgmentEngine } from '../judgment-engine';
import { domainAdapter } from '../domain-adapter';
import { documentGenerator } from '../document-generator';
import type { StatisticalInput } from '../types';

const BASE: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.9,
  effectSize: 0.4,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
  comparatorType: 'placebo',
  missingDataMethod: 'MMRM',
};

const judge = (phase: string | undefined, over: Partial<StatisticalInput> = {}) => {
  const input = { ...BASE, phase, ...over };
  const computation = computationEngine.computeEnhanced(input);
  return { input, computation, judgment: judgmentEngine.judge(input, computation) };
};
const dimension = (phase: string | undefined, name: string, over: Partial<StatisticalInput> = {}) =>
  judge(phase, over).judgment.dimensions.find((d) => d.name === name)!;

describe('canonicalPhase — one reading of a phase as written', () => {
  it.each([
    ['III', 'III'], ['Phase III', 'III'], ['Phase 3', 'III'], ['3', 'III'], ['phase_3', 'III'], ['IIIb', 'III'],
    ['II', 'II'], ['Phase II', 'II'], ['Phase 2', 'II'], ['2', 'II'], ['2b', 'II'], ['Phase IIa', 'II'],
    ['I', 'I'], ['Phase 1', 'I'], ['Phase I (first-in-human)', 'I'],
    ['IV', 'IV'], ['Phase 4', 'IV'],
    // A combined phase is held to the stricter (higher) phase's rules.
    ['2/3', 'III'], ['Phase II/III', 'III'], ['1/2', 'II'],
  ])('%s reads as %s', (written, canonical) => {
    expect(canonicalPhase(written)).toBe(canonical);
  });

  it.each([undefined, null, '', '  ', 'N/A', 'pilot'])('%s reads as no phase, never a guessed one', (written) => {
    expect(canonicalPhase(written)).toBeUndefined();
  });
});

describe('the judgment engine judges "Phase II" and "II" identically', () => {
  it.each([
    ['Phase II', 'II'], ['Phase 2', 'II'], ['2', 'II'],
    ['Phase III', 'III'], ['Phase 3', 'III'], ['3', 'III'],
  ])('%s judges as %s does, dimension by dimension', (written, canonical) => {
    const a = judge(written, { estimandStrategy: undefined }).judgment;
    const b = judge(canonical, { estimandStrategy: undefined }).judgment;
    expect(a.dimensions).toEqual(b.dimensions);
    expect(a.overallVerdict).toBe(b.overallVerdict);
    expect(a.actionRecommendation).toBe(b.actionRecommendation);
  });
});

describe('a missing estimand on a confirmatory design is never ADEQUATE', () => {
  it.each(['Phase III', 'Phase 3', '3', 'III', '2/3'])('phase %s with no estimand is inadequate on estimand clarity', (phase) => {
    const d = dimension(phase, 'Estimand Clarity', { estimandStrategy: undefined });
    expect(d.verdict).toBe('inadequate');
    expect(d.verdict).not.toBe('adequate');
    expect(d.flags.join(' ')).toMatch(/ICH E9\(R1\) requires explicit estimand framework/);
  });

  it('a Phase I design with no estimand is only a recommendation, as before', () => {
    expect(dimension('Phase 1', 'Estimand Clarity', { estimandStrategy: undefined }).verdict).toBe('adequate');
  });
});

describe('the other phase rules fire on the written phase too', () => {
  it('Phase III with power under 80% is inadequate on power, written either way', () => {
    for (const phase of ['Phase III', 'Phase 3']) {
      // Sized for 75% power: marginal by the power bands, inadequate for a confirmatory trial.
      const d = dimension(phase, 'Power Adequacy', { powerTarget: 0.75 });
      expect(d.verdict).toBe('inadequate');
      expect(d.flags.join(' ')).toMatch(/Phase III confirmatory trial with <80% power/);
    }
  });

  it('the domain adapter adds the confirmatory considerations for "Phase 3"', () => {
    const { input, computation, judgment } = judge('Phase 3');
    const domain = domainAdapter.adapt(input, computation, judgment);
    expect(domain.designConsiderations.join(' ')).toMatch(/Confirmatory Phase III/);
    expect(domain.trackSpecificFields.multiplicityHandling).toBe('required');
  });
});

describe('the governed document keeps the phase as written', () => {
  const doc = (phase: string) => {
    const { input, computation, judgment } = judge(phase, { estimandStrategy: 'treatment_policy' });
    const domain = domainAdapter.adapt(input, computation, judgment);
    return documentGenerator.generate('sample_size_rationale', input, computation, judgment, domain, undefined, { projectId: 1, organizationId: 1, userId: 1 }).content;
  };

  it('prints "Phase III" for "3", and never restates a Phase 2/3 study as Phase III', () => {
    expect(doc('3')).toContain('**Phase**: Phase III');
    expect(doc('Phase 2/3')).toContain('**Phase**: Phase 2/3 (judged against Phase III expectations)');
  });

  it('prints vocabulary values as words, not engine keys', () => {
    const text = doc('Phase 3');
    expect(text).toContain('**Study Type**: Superiority');
    expect(text).toContain('**Endpoint Type**: Continuous');
    expect(text).not.toMatch(/user_provided|effect_size|attrition_rate|biotech_pharma/);
  });
});
