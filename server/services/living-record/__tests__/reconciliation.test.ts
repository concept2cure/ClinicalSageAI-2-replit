/**
 * Value reconciliation + object model — pure, no database.
 * Covers numeric tolerance, unit mismatch, derived transforms, the no-drift
 * case, the reconcile-on-write verdicts, and the spine graph definition.
 */

import { describe, it, expect } from 'vitest';

import {
  compareValues,
  detectDrift,
  reconcileClaimValue,
  parseLeadingNumber,
  applyTransform,
  numToCanonical,
  type FactValueView,
} from '../value-reconciliation';
import {
  SPINE_CHAIN,
  isValidEdge,
  targetKind,
  claimIdFromTarget,
  claimTarget,
} from '../object-model';

const countFact = (n: number, unit = 'subjects'): FactValueView => ({
  valueNum: n,
  valueText: null,
  unit,
  valueType: 'count',
});

const measureFact = (n: number, unit = 'months'): FactValueView => ({
  valueNum: n,
  valueText: null,
  unit,
  valueType: 'measure',
});

describe('parseLeadingNumber', () => {
  it('pulls the first number out of prose, stripping thousands separators', () => {
    expect(parseLeadingNumber('186 subjects')).toBe(186);
    expect(parseLeadingNumber('1,234 randomized')).toBe(1234);
    expect(parseLeadingNumber('approximately 18.5 months')).toBe(18.5);
    expect(parseLeadingNumber('no number here')).toBeNull();
  });
});

describe('applyTransform', () => {
  it('handles identity, round, and scale; rejects the unknown', () => {
    expect(applyTransform(18.5, null)).toBe(18.5);
    expect(applyTransform(18.5, { fn: 'identity' })).toBe(18.5);
    expect(applyTransform(18.5, { fn: 'round', decimals: 0 })).toBe(19);
    expect(applyTransform(2, { fn: 'scale', factor: 1000 })).toBe(2000);
    expect(applyTransform(2, { fn: 'mystery' })).toBeNull();
  });
});

describe('compareValues', () => {
  it('counts compare exactly', () => {
    expect(compareValues({ fact: countFact(186), observed: '186' }).equal).toBe(true);
    const drift = compareValues({ fact: countFact(186), observed: '184 efficacy-evaluable' });
    expect(drift.equal).toBe(false);
    expect(drift.driftType).toBe('value_mismatch');
  });

  it('measures honor a relative tolerance', () => {
    expect(compareValues({ fact: measureFact(18.5), observed: '18.6 months', tolerance: 0.05 }).equal).toBe(
      true
    );
    expect(compareValues({ fact: measureFact(18.5), observed: '20 months', tolerance: 0.05 }).equal).toBe(
      false
    );
  });

  it('flags a unit mismatch when both units are known and differ', () => {
    const r = compareValues({
      fact: { valueNum: 500, valueText: null, unit: 'mg', valueType: 'measure' },
      observed: '500',
      observedUnit: 'g',
    });
    expect(r.equal).toBe(false);
    expect(r.driftType).toBe('unit_mismatch');
  });

  it('flags a missing target', () => {
    expect(compareValues({ fact: countFact(186), observed: '' }).driftType).toBe('missing_target');
  });

  it('compares text facts case-insensitively', () => {
    const fact: FactValueView = { valueNum: null, valueText: 'Oral tablet', unit: null, valueType: 'text' };
    expect(compareValues({ fact, observed: 'oral tablet' }).equal).toBe(true);
    expect(compareValues({ fact, observed: 'capsule' }).equal).toBe(false);
  });
});

describe('detectDrift', () => {
  it('returns no drift when a mirror binding agrees', () => {
    const f = detectDrift({ bindingKind: 'mirror', observedValue: '186' }, countFact(186));
    expect(f.drift).toBe(false);
  });

  it('detects a value mismatch and reports expected vs observed', () => {
    const f = detectDrift({ bindingKind: 'mirror', observedValue: '184' }, countFact(186));
    expect(f.drift).toBe(true);
    expect(f.driftType).toBe('value_mismatch');
    expect(f.expected).toBe('186');
    expect(f.observed).toBe('184');
  });

  it('never drifts a manual override', () => {
    const f = detectDrift({ bindingKind: 'manual_override', observedValue: '999' }, countFact(186));
    expect(f.drift).toBe(false);
  });

  it('applies a derived transform before comparing', () => {
    const fact = measureFact(18.5);
    const ok = detectDrift(
      { bindingKind: 'derived', observedValue: '19', transform: { fn: 'round', decimals: 0 } },
      fact
    );
    expect(ok.drift).toBe(false);
    expect(ok.expected).toBe('19');

    const bad = detectDrift(
      { bindingKind: 'derived', observedValue: '18.5', transform: { fn: 'round', decimals: 0 } },
      fact
    );
    expect(bad.drift).toBe(true);
  });

  it('does not assert drift on a transform it cannot evaluate', () => {
    const f = detectDrift(
      { bindingKind: 'derived', observedValue: '5', transform: { fn: 'mystery' } },
      measureFact(18.5)
    );
    expect(f.drift).toBe(false);
  });
});

describe('reconcileClaimValue', () => {
  const claim = (valueNum: number | null, hasValue = true) => ({
    valueNum,
    valueText: null,
    unit: 'subjects',
    valueType: 'count',
    hasValue,
  });

  it('skips a claim with no structured value', () => {
    const r = reconcileClaimValue({ claim: claim(null, false), existingFact: null });
    expect(r.verdict).toBe('skipped');
    expect(r.claimVerification).toBe('unverified');
  });

  it('establishes the fact when none exists', () => {
    const r = reconcileClaimValue({ claim: claim(186), existingFact: null });
    expect(r.verdict).toBe('established');
    expect(r.claimVerification).toBe('verified');
    expect(r.factStatusAfter).toBe('active');
  });

  it('verifies a claim that agrees with the canonical fact', () => {
    const r = reconcileClaimValue({ claim: claim(186), existingFact: countFact(186) });
    expect(r.verdict).toBe('agreed');
    expect(r.claimVerification).toBe('verified');
  });

  it('disputes a claim that diverges from the canonical fact', () => {
    const r = reconcileClaimValue({ claim: claim(184), existingFact: countFact(186) });
    expect(r.verdict).toBe('disputed');
    expect(r.claimVerification).toBe('disputed');
    expect(r.factStatusAfter).toBe('disputed');
  });
});

describe('object model — the explicit spine', () => {
  it('defines the full chain in order', () => {
    expect(SPINE_CHAIN[0]).toBe('program');
    expect(SPINE_CHAIN).toContain('sequence');
    expect(SPINE_CHAIN).toContain('claim');
    expect(SPINE_CHAIN).toContain('evidence_value');
    expect(SPINE_CHAIN[SPINE_CHAIN.length - 1]).toBe('source_artifact');
  });

  it('validates typed edges between node kinds', () => {
    expect(isValidEdge('claim', 'evidence_value', 'asserts')).toBe(true);
    expect(isValidEdge('claim', 'document', 'supports')).toBe(true);
    expect(isValidEdge('claim', 'program', 'asserts')).toBe(false);
    expect(isValidEdge('document', 'evidence_value', 'binds_to')).toBe(true);
  });

  it('parses typed target pointers', () => {
    expect(targetKind('claim:123')).toBe('claim');
    expect(targetKind('section:doc_x:m2.5')).toBe('section');
    expect(targetKind('weird:1')).toBeNull();
    expect(claimIdFromTarget(claimTarget(123))).toBe(123);
    expect(claimIdFromTarget('document:x')).toBeNull();
  });

  it('round-trips numeric canonicalization', () => {
    expect(numToCanonical(186)).toBe('186');
    expect(numToCanonical(18.5)).toBe('18.5');
    expect(numToCanonical(3.0)).toBe('3');
  });
});
