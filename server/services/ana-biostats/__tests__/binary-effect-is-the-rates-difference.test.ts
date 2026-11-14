/**
 * A binary design that gives both rates is documented on the difference it was
 * sized on.
 *
 * S12 biotech sweep, finding 60 (2026-11-09): the C2C-101-201
 * design's input (effect 0.47, control 0.08, treatment 0.55) with the treatment
 * rate changed to 0.30 was SIZED on 0.30 − 0.08 = 0.22 — the engine's binary
 * test reads the two rates (computation-engine.ts, binaryRates) — but the
 * normalizer kept the stated 0.47 (`raw.effectSize ?? derive`). Every figure a
 * reader sees reads `input.effectSize`: the Sample Size Rationale printed
 * "| Effect size | 0.47 |", "Effect size = 0.4700" in the scenarios and
 * "Effect size: current 0.47, breakpoint 0.4465", beside a sample size computed
 * for 0.22. RULE 2: a document that states a number the engine did not size on
 * is a defect, not wording.
 */
import { describe, expect, it } from 'vitest';
import { inputNormalizer } from '../input-normalizer';
import { anaBiostatsOrchestrator } from '../orchestrator';
import { documentGenerator } from '../document-generator';
import type { StatisticalInput } from '../types';

const STALE: Partial<StatisticalInput> = {
  clientTrack: 'biotech_pharma',
  regulatoryBody: 'FDA',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'binary',
  controlRate: 0.08,
  treatmentRate: 0.3,
  effectSize: 0.47,
  alpha: 0.05,
  powerTarget: 0.8,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
  phase: 'Phase II',
};

function rationale(input: Partial<StatisticalInput>): string {
  const run = anaBiostatsOrchestrator.quickCompute(input);
  expect(run.validation.valid).toBe(true);
  return documentGenerator.generate(
    'sample_size_rationale',
    run.validation.normalizedInput!,
    run.computation!,
    run.judgment!,
    run.domain!,
    run.regulatory,
    { projectId: 0, organizationId: 1, userId: 1 },
  ).content;
}

describe('the normalized effect size of a binary design with both rates', () => {
  it('is the difference between the rates, not a stated figure that disagrees with them', () => {
    expect(inputNormalizer.normalize(STALE).normalizedInput!.effectSize).toBe(0.22);
  });

  it('says so, naming both figures, when the stated effect size disagrees', () => {
    const warning = inputNormalizer.normalize(STALE).warnings.find((w) => w.field === 'effectSize');
    expect(warning?.message).toMatch(/0\.47/);
    expect(warning?.message).toMatch(/0\.3 − 0\.08 = 0\.22/);
  });

  it('carries no float noise: 0.30 − 0.08 is 0.22, not 0.21999999999999997', () => {
    const { effectSize } = inputNormalizer.normalize({ ...STALE, effectSize: undefined }).normalizedInput!;
    expect(effectSize).toBe(0.22);
    expect(String(effectSize)).toBe('0.22');
  });

  it('raises no warning when the stated effect size is the difference', () => {
    const fields = inputNormalizer.normalize({ ...STALE, effectSize: 0.22 }).warnings.map((w) => w.field);
    expect(fields).not.toContain('effectSize');
  });

  it('refuses a superiority design whose rates are equal: there is no difference to size on', () => {
    const result = inputNormalizer.normalize({ ...STALE, treatmentRate: 0.08, effectSize: 0.47 });
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.field)).toContain('effectSize');
  });

  it('leaves a non-binary design’s stated effect size alone', () => {
    const continuous = { ...STALE, endpointType: 'continuous' as const, effectSize: 0.5, variance: 1 };
    expect(inputNormalizer.normalize(continuous).normalizedInput!.effectSize).toBe(0.5);
  });
});

describe('the Sample Size Rationale states the difference the study was sized on', () => {
  it('prints 0.22 in the assumptions, the scenarios and the sensitivity line — and 0.47 nowhere', () => {
    const content = rationale(STALE);
    expect(content).toMatch(/\| Effect size \| 0\.22 \|/);
    expect(content).toMatch(/Effect size = 0\.2200/);
    expect(content).not.toMatch(/0\.47/);
  });

  it('sizes the same study whether the stale figure is stated or not', () => {
    const stated = anaBiostatsOrchestrator.quickCompute(STALE).computation!;
    const derived = anaBiostatsOrchestrator.quickCompute({ ...STALE, effectSize: undefined }).computation!;
    expect(stated.sampleSize.total).toBe(derived.sampleSize.total);
  });
});
