/**
 * Tests for the gap classifier — CTD-section-coded severity rules with
 * readiness deltas. Locks down:
 *   - exact-section match wins over prefix match
 *   - longer prefix wins over shorter prefix
 *   - severity → default delta mapping
 *   - filing-blocked flag derives from severity by default
 *   - per-section rule listing returns the right subset
 *   - the rule registry meets the spec floor (≥30 entries)
 */

import { describe, it, expect } from 'vitest';
import {
  GAP_RULES,
  classifyGap,
  getGapRulesForSection,
  sumReadinessDelta,
  anyFilingBlocked,
  listAllGapRules,
} from '../ana/gap-classifier';

describe('gap-classifier · rule registry', () => {
  it('ships at least 30 rules at launch (spec floor)', () => {
    expect(GAP_RULES.length).toBeGreaterThanOrEqual(30);
    expect(listAllGapRules().length).toBe(GAP_RULES.length);
  });

  it('every rule has the required fields', () => {
    for (const rule of GAP_RULES) {
      expect(rule.id).toBeTruthy();
      expect(rule.sectionCode).toBeTruthy();
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(['critical', 'major', 'minor', 'info']).toContain(rule.severity);
      expect(rule.guidance).toBeTruthy();
      expect(rule.message).toBeTruthy();
    }
  });

  it('rule ids are unique', () => {
    const ids = new Set(GAP_RULES.map(r => r.id));
    expect(ids.size).toBe(GAP_RULES.length);
  });
});

describe('gap-classifier · classifyGap', () => {
  it('returns null when section is missing', () => {
    expect(classifyGap(null, 'demographics')).toBeNull();
    expect(classifyGap('', 'demographics')).toBeNull();
  });

  it('returns null when no rule matches the section', () => {
    expect(classifyGap('99.99', 'demographics')).toBeNull();
  });

  it('matches an exact section + pattern', () => {
    const result = classifyGap('9.2', 'baseline characteristics table required');
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
    expect(result?.blockingFiling).toBe(true);
    expect(result?.readinessDelta).toBe(-18);
    expect(result?.rule).toBe('CSR-9.2-demographics');
  });

  it('matches a prefix rule (e.g. 3.2.S.7.1 → 3.2.S.7)', () => {
    const result = classifyGap(
      '3.2.S.7.1',
      'stability data missing for the drug substance'
    );
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('critical');
    expect(result?.rule).toBe('M3.2.S.7-stability');
  });

  it('prefers a more-specific prefix over a less-specific one', () => {
    // We have '3.2.S' (characterisation prefix) and '3.2.S.7' (stability).
    // A claim about 'stability' under '3.2.S.7.2' must hit the stability rule.
    const result = classifyGap('3.2.S.7.2', 'stability conclusions');
    expect(result?.rule).toBe('M3.2.S.7-stability');
  });

  it('exact match beats prefix match at the same depth', () => {
    // Section '9.2' has both an exact rule and a prefix rule (CSR-10).
    // Exact rule wins.
    const result = classifyGap('9.2', 'baseline characteristics');
    expect(result?.rule).toBe('CSR-9.2-demographics');
  });

  it('respects severity → readinessDelta defaults', () => {
    // critical → -18
    expect(classifyGap('11.4', 'primary endpoint forest plot')?.readinessDelta).toBe(
      -18
    );
    // major → -8 (M2.4 nonclinical overview)
    const major = classifyGap('2.4', 'nonclinical overview');
    expect(major?.severity).toBe('major');
    expect(major?.readinessDelta).toBe(-8);
    // minor → -2 (CSR §16 appendices)
    const minor = classifyGap('16.1', 'appendix protocol');
    expect(minor?.severity).toBe('minor');
    expect(minor?.readinessDelta).toBe(-2);
  });

  it('blocks filing when severity is critical', () => {
    const c = classifyGap('11.4', 'primary endpoint analysis');
    expect(c?.blockingFiling).toBe(true);
  });

  it('does not block filing for major / minor severities', () => {
    const major = classifyGap('2.4', 'nonclinical overview');
    expect(major?.blockingFiling).toBe(false);
    const minor = classifyGap('16.1', 'appendix protocol');
    expect(minor?.blockingFiling).toBe(false);
  });

  it('is case-insensitive on the claim text', () => {
    const upper = classifyGap('9.2', 'BASELINE CHARACTERISTICS');
    const lower = classifyGap('9.2', 'baseline characteristics');
    expect(upper?.rule).toBe(lower?.rule);
  });
});

describe('gap-classifier · getGapRulesForSection', () => {
  it('returns the rule subset relevant to a section, most-specific first', () => {
    const rules = getGapRulesForSection('3.2.S.7.1');
    expect(rules.length).toBeGreaterThan(0);
    // Most-specific (longest prefix or exact) first.
    expect(rules[0].sectionCode.length).toBeGreaterThanOrEqual(
      rules[rules.length - 1].sectionCode.length
    );
  });

  it('returns empty for an unknown section', () => {
    expect(getGapRulesForSection('99.99')).toEqual([]);
  });
});

describe('gap-classifier · rollup helpers', () => {
  it('sumReadinessDelta sums negative penalties', () => {
    const total = sumReadinessDelta([
      { readinessDelta: -18 },
      { readinessDelta: -8 },
      { readinessDelta: -2 },
    ]);
    expect(total).toBe(-28);
  });

  it('anyFilingBlocked returns true when at least one gap blocks', () => {
    expect(
      anyFilingBlocked([
        { blockingFiling: false },
        { blockingFiling: true },
        { blockingFiling: false },
      ])
    ).toBe(true);
    expect(
      anyFilingBlocked([
        { blockingFiling: false },
        { blockingFiling: false },
      ])
    ).toBe(false);
  });
});
