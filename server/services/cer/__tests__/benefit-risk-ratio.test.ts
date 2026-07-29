/**
 * Regression — CER benefit-risk determination must fail closed when empty.
 *
 * `calculateBenefitRiskRatio` previously short-circuited on `risks === 0` and
 * returned "Highly favorable" BEFORE inspecting documented benefits. Because
 * `buildCerStructure` feeds the raw device profile (which carries no
 * `benefits`/`risks` arrays) into the risk-benefit template, EVERY generated CER
 * received a "Highly favorable" benefit-risk verdict backed by zero clinical
 * data — a fail-open against MDR Annex I §1/§8 / MEDDEV 2.7/1 rev 4, which
 * require the benefit-risk conclusion to be supported by documented benefits.
 *
 * An empty analysis (no benefits AND no risks) must be reported as
 * indeterminate ("Needs review"), never auto-certified favorable.
 */

import { describe, it, expect } from 'vitest';
import cerGen from '../../cerGenerationService';

// The scoring helper is private; exercise it directly via the singleton.
const ratio = (data: unknown): string =>
  (cerGen as unknown as { calculateBenefitRiskRatio: (d: unknown) => string }).calculateBenefitRiskRatio(
    data,
  );

describe('calculateBenefitRiskRatio — fails closed on an empty analysis', () => {
  it('an empty benefit-risk analysis is indeterminate, NOT "Highly favorable"', () => {
    // Raw device profile shape used by buildCerStructure: no benefits/risks.
    expect(ratio({})).toBe('Needs review');
    expect(ratio({ benefits: [], risks: [] })).toBe('Needs review');
  });

  it('documented benefits with no documented risks remain highly favorable', () => {
    expect(ratio({ benefits: [{}, {}], risks: [] })).toBe('Highly favorable');
  });

  it('zero benefits against documented risks is not favorable', () => {
    expect(ratio({ benefits: [], risks: [{}] })).toBe('Needs review');
  });

  it('ratio bands are preserved for populated analyses', () => {
    expect(ratio({ benefits: [{}, {}, {}], risks: [{}] })).toBe('Highly favorable'); // 3
    expect(ratio({ benefits: [{}, {}], risks: [{}] })).toBe('Favorable'); // 2
    expect(ratio({ benefits: [{}], risks: [{}] })).toBe('Balanced'); // 1
    expect(ratio({ benefits: [{}], risks: [{}, {}] })).toBe('Needs review'); // 0.5
  });
});
