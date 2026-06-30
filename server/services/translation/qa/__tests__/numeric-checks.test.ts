/**
 * numeric-checks tests — prove the NUMBER + UNIT integrity gate catches the
 * machine-translation failure modes that corrupt dose/strength/eligibility, and
 * that it survives Japanese full-width digit/punctuation rendering.
 *
 * The module under test is pure (no db / env / LLM), so we import directly —
 * no vi.hoisted shim needed (mirrors glossary.test.ts).
 *
 * Coverage:
 *  - dose mismatch (10 mg vs 100 mg) → ERROR (the headline regression).
 *  - clean round-trip → no findings.
 *  - dropped "%" / changed unit (mg→mcg) → ERROR.
 *  - full-width JA digits (１０ mg) treated as ASCII 10 → no false error.
 *  - full-width digit dose mismatch (１０ vs １００) → ERROR.
 *  - ranges, thousands separators, decimals handled.
 *  - length sanity: truncation/runaway advisory, never error.
 */

import { describe, it, expect } from 'vitest';

import {
  extractNumbers,
  extractUnits,
  normalizeWidth,
  numberConsistencyCheck,
  unitConsistencyCheck,
  lengthSanityCheck,
  numericChecks,
} from '../numeric-checks';
import type { QaCheckInput } from '../types';

const mk = (source: string, target: string): QaCheckInput => ({ source, target });

const hasError = (findings: { severity: string }[]) =>
  findings.some((f) => f.severity === 'error');

describe('normalizeWidth', () => {
  it('folds full-width digits and punctuation to ASCII', () => {
    expect(normalizeWidth('１０．５')).toBe('10.5');
    expect(normalizeWidth('５０％')).toBe('50%');
    expect(normalizeWidth('１０〜２０')).toBe('10~20');
  });

  it('leaves non-numeric characters untouched', () => {
    expect(normalizeWidth('投与量 10 mg')).toBe('投与量 10 mg');
  });
});

describe('extractNumbers', () => {
  it('extracts decimals, ranges, and thousands separators canonically', () => {
    expect(extractNumbers('dose 10.5 mg, range 10-20, total 1,000'))
      .toEqual(['10.5', '10', '20', '1000']);
  });

  it('extracts numbers from full-width JA digits', () => {
    expect(extractNumbers('用量 １０ mg')).toEqual(['10']);
  });

  it('keeps 5.0 and 5 distinct (a dropped decimal place is a defect)', () => {
    expect(extractNumbers('5.0')).toEqual(['5.0']);
    expect(extractNumbers('5')).toEqual(['5']);
  });
});

describe('extractUnits', () => {
  it('extracts mass/volume/percent units', () => {
    expect(extractUnits('10 mg in 5 mL at 50%')).toEqual(['mg', 'mL', '%']);
  });

  it('does not match unit substrings inside words', () => {
    // "mg" in "magnesium", "L" in "Levels" must NOT match.
    expect(extractUnits('magnesium Levels normal')).toEqual([]);
  });

  it('extracts full-width percent', () => {
    expect(extractUnits('改善率 ５０％')).toEqual(['%']);
  });
});

describe('numberConsistencyCheck', () => {
  it('DOSE MISMATCH: 10 mg vs 100 mg → error', () => {
    const findings = numberConsistencyCheck(
      mk('Administer 10 mg once daily.', '100 mg を1日1回投与する。'),
    );
    expect(hasError(findings)).toBe(true);
    // "10" dropped from target.
    expect(findings.some((f) => f.severity === 'error' && f.sourceExcerpt === '10'))
      .toBe(true);
    // "100" appears only in target → flagged as a warning insertion.
    expect(findings.some((f) => f.severity === 'warning' && f.targetExcerpt === '100'))
      .toBe(true);
  });

  it('clean round-trip preserving the number → no findings', () => {
    const findings = numberConsistencyCheck(
      mk('Administer 10 mg once daily.', '10 mg を1日1回投与する。'),
    );
    expect(findings).toEqual([]);
  });

  it('FULL-WIDTH dose mismatch: 10 vs full-width 100 → error', () => {
    const findings = numberConsistencyCheck(
      mk('Administer 10 mg.', '１００ mg を投与する。'),
    );
    expect(hasError(findings)).toBe(true);
  });

  it('FULL-WIDTH match: source 10 vs full-width 10 → no error', () => {
    const findings = numberConsistencyCheck(
      mk('Administer 10 mg.', '１０ mg を投与する。'),
    );
    expect(hasError(findings)).toBe(false);
  });

  it('dropped number from a range → error', () => {
    const findings = numberConsistencyCheck(
      mk('Inclusion: 18-65 years.', '組み入れ：18歳以上。'),
    );
    // "65" missing.
    expect(findings.some((f) => f.severity === 'error' && f.sourceExcerpt === '65'))
      .toBe(true);
  });

  it('thousands-separator equivalence: 1,000 vs 1000 → no error', () => {
    const findings = numberConsistencyCheck(mk('1,000 mg total', '1000 mg 合計'));
    expect(hasError(findings)).toBe(false);
  });

  it('preserves count: two "10"s in source, one in target → error', () => {
    const findings = numberConsistencyCheck(mk('10 mg + 10 mg', '10 mg'));
    expect(hasError(findings)).toBe(true);
  });
});

describe('unitConsistencyCheck', () => {
  it('dropped "%" → error', () => {
    const findings = unitConsistencyCheck(mk('Improvement of 50%.', '50 の改善。'));
    expect(hasError(findings)).toBe(true);
    expect(findings.some((f) => f.sourceExcerpt === '%')).toBe(true);
  });

  it('changed unit mg → mcg → error (both drop and add)', () => {
    const findings = unitConsistencyCheck(mk('10 mg dose', '10 mcg 用量'));
    expect(hasError(findings)).toBe(true);
    expect(findings.some((f) => f.sourceExcerpt === 'mg')).toBe(true);
    expect(findings.some((f) => f.targetExcerpt === 'mcg')).toBe(true);
  });

  it('preserved units → no findings', () => {
    const findings = unitConsistencyCheck(mk('10 mg in 5 mL', '5 mL 中 10 mg'));
    expect(findings).toEqual([]);
  });

  it('full-width percent preserved → no error', () => {
    const findings = unitConsistencyCheck(mk('50% response', '応答率 ５０％'));
    expect(hasError(findings)).toBe(false);
  });
});

describe('lengthSanityCheck', () => {
  it('never emits an error severity (advisory only)', () => {
    const findings = lengthSanityCheck(mk('hello world this is a sentence', ''));
    expect(hasError(findings)).toBe(false);
  });

  it('empty target on non-empty source → warning (truncation)', () => {
    const findings = lengthSanityCheck(mk('A non-empty source sentence.', ''));
    expect(findings.some((f) => f.severity === 'warning')).toBe(true);
  });

  it('extreme truncation → warning', () => {
    const findings = lengthSanityCheck(
      mk('A reasonably long English source sentence about dosing.', '短'),
    );
    expect(findings.some((f) => f.severity === 'warning')).toBe(true);
  });

  it('runaway expansion → warning', () => {
    const findings = lengthSanityCheck(mk('短い', 'x'.repeat(50)));
    expect(findings.some((f) => f.severity === 'warning')).toBe(true);
  });

  it('reasonable JA-compact ratio → no findings', () => {
    const findings = lengthSanityCheck(
      mk('Administer 10 mg once daily.', '10 mg を1日1回投与する。'),
    );
    expect(findings).toEqual([]);
  });

  it('empty source → silent (no ratio to judge)', () => {
    expect(lengthSanityCheck(mk('', 'something'))).toEqual([]);
  });
});

describe('numericChecks bundle', () => {
  it('exports all three checks in registration order', () => {
    expect(numericChecks).toHaveLength(3);
    expect(numericChecks).toContain(numberConsistencyCheck);
    expect(numericChecks).toContain(unitConsistencyCheck);
    expect(numericChecks).toContain(lengthSanityCheck);
  });

  it('a 10 mg → 100 mg dose mismatch produces a blocking error across the bundle', () => {
    const input = mk('Administer 10 mg once daily.', '100 mg を1日1回投与する。');
    const all = numericChecks.flatMap((check) => check(input));
    expect(hasError(all)).toBe(true);
  });
});
