/**
 * Promotional-claims screener — unit tests. Deterministic lexicon checks.
 */
import { describe, it, expect } from 'vitest';
import { screenPromotionalLanguage } from '../promotional-screening';

describe('screenPromotionalLanguage', () => {
  it('passes neutral, data-grounded prose', () => {
    const r = screenPromotionalLanguage(
      'In this trial, the treatment reduced the event rate by 18% (95% CI 9–26). It was generally well tolerated, with nausea the most common adverse event.'
    );
    // "generally well tolerated" should NOT trip the bare "was well-tolerated" rule.
    expect(r.total).toBe(0);
    expect(r.verdict).toMatch(/No promotional/);
  });

  it('flags superlatives and absolutes as high severity', () => {
    const r = screenPromotionalLanguage(
      'Our breakthrough therapy is the most effective option and works in all patients with a guaranteed response.'
    );
    const cats = new Set(r.flags.map(f => f.category));
    expect(cats.has('superiority')).toBe(true);
    expect(cats.has('absolute')).toBe(true);
    expect(r.highSeverityCount).toBeGreaterThanOrEqual(2);
    expect(r.flags[0].severity).toBe('high'); // sorted high-first
    expect(r.flags[0].suggestion).toBeTruthy();
  });

  it('flags unqualified safety, causal overreach, and comparatives', () => {
    const r = screenPromotionalLanguage(
      'The drug is safe, has no side effects, cures the disease, and is better than the standard of care.'
    );
    const cats = new Set(r.flags.map(f => f.category));
    expect(cats.has('unqualified_safety')).toBe(true);
    expect(cats.has('causal_overreach')).toBe(true);
    expect(cats.has('unsupported_comparative')).toBe(true);
    expect(r.verdict).toMatch(/high-severity/);
  });

  it('does not false-positive on "safety"/"safely" or "novel"', () => {
    const r = screenPromotionalLanguage(
      'The safety population was analyzed; the device was used safely per protocol. We describe a new mechanism.'
    );
    expect(r.byCategory.unqualified_safety ?? 0).toBe(0);
  });

  it('returns context snippets around each flag', () => {
    const r = screenPromotionalLanguage('This is a revolutionary product.');
    expect(r.flags[0].context.toLowerCase()).toContain('revolutionary');
  });
});
