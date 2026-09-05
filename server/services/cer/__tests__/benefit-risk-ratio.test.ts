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

  it('documented benefits with NO documented risks is indeterminate, not favorable', () => {
    // This asserted 'Highly favorable', which contradicted the case directly
    // above it: an empty analysis is indeterminate, and an empty RISK analysis
    // is no less empty than an empty benefit one. Zero documented risks is an
    // unperformed — or not-yet-recorded — assessment, not a zero-risk device,
    // and the data model carries no "risk assessment completed" signal that
    // could tell those apart. Under MDR Annex I §1/§8 and MEDDEV 2.7/1 rev 4 the
    // benefit-risk conclusion must rest on documented evidence, so a favorable
    // verdict drawn from an absent risk analysis is fabricated — and it is
    // fabricated INTO a Clinical Evaluation Report a notified body reads.
    expect(ratio({ benefits: [{}, {}], risks: [] })).toBe('Needs review');
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
