/**
 * Evidence contradiction detector — verifies the pure, deterministic structural
 * detection that catches self-contradicting evidence before AnA synthesizes an answer.
 * Pure function, so the suite is hermetic (no mocks, no IO).
 */

import { describe, it, expect } from 'vitest';
import {
  CONTRADICTION_TYPES,
  detectContradictions,
  type EvidenceClaim,
} from '../evidence-contradiction-detector';

describe('detectContradictions — numerical_mismatch', () => {
  it('flags same subject + metric values 0.45 vs 0.20 as numerical_mismatch major', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: 'NCT001', metric: 'ORR', value: 0.2 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.length).toBe(1);
    const c = report.contradictions[0];
    expect(c.type).toBe('numerical_mismatch');
    expect(c.severity).toBe('major');
    expect(c.subject).toBe('NCT001');
    expect(c.claimA.id).toBe('a');
    expect(c.claimB.id).toBe('b');
    expect(report.subjectsWithConflicts).toEqual(['NCT001']);
    expect(report.checkedClaims).toBe(2);
  });

  it('does not flag 0.45 vs 0.46 (within default tolerance)', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: 'NCT001', metric: 'ORR', value: 0.46 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions).toEqual([]);
    expect(report.subjectsWithConflicts).toEqual([]);
  });

  it('classifies a difference beyond tolerance but ≤ 0.25 as minor', () => {
    // 1.00 vs 0.85 → relative diff 0.15 (> 0.1 tolerance, ≤ 0.25)
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'N', value: 1.0 },
      { id: 'b', subject: 'NCT001', metric: 'N', value: 0.85 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.length).toBe(1);
    expect(report.contradictions[0].severity).toBe('minor');
  });

  it('respects a custom relativeTolerance', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: 'NCT001', metric: 'ORR', value: 0.46 },
    ];
    const report = detectContradictions(claims, { relativeTolerance: 0.001 });
    expect(report.contradictions.length).toBe(1);
    expect(report.contradictions[0].type).toBe('numerical_mismatch');
  });

  it('does not pair values across DIFFERENT metrics', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: 'NCT001', metric: 'p_value', value: 0.01 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions).toEqual([]);
  });

  it('treats both-near-zero values as equal (no mismatch)', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'delta', value: 0 },
      { id: 'b', subject: 'NCT001', metric: 'delta', value: 0 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions).toEqual([]);
  });
});

describe('detectContradictions — direct_conflict', () => {
  it('flags opposite polarity (positive vs negative) as direct_conflict critical', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'DrugX', polarity: 'positive' },
      { id: 'b', subject: 'DrugX', polarity: 'negative' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.length).toBe(1);
    const c = report.contradictions[0];
    expect(c.type).toBe('direct_conflict');
    expect(c.severity).toBe('critical');
    expect(c.subject).toBe('DrugX');
    expect(report.subjectsWithConflicts).toEqual(['DrugX']);
  });

  it('does not flag positive vs neutral', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'DrugX', polarity: 'positive' },
      { id: 'b', subject: 'DrugX', polarity: 'neutral' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions).toEqual([]);
  });

  it('matches subjects case-insensitively', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'DrugX', polarity: 'positive' },
      { id: 'b', subject: 'drugx', polarity: 'negative' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.length).toBe(1);
    expect(report.contradictions[0].type).toBe('direct_conflict');
  });
});

describe('detectContradictions — temporal_inconsistency', () => {
  it('reports opposite polarity + differing dates as an unresolved temporal_inconsistency', () => {
    const claims: EvidenceClaim[] = [
      { id: 'old', subject: 'DrugX', polarity: 'positive', date: '2020-01-01' },
      { id: 'new', subject: 'DrugX', polarity: 'negative', date: '2023-06-01' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.length).toBe(1);
    const c = report.contradictions[0];
    expect(c.type).toBe('temporal_inconsistency');
    expect(c.severity).toBe('major');
    expect(c.detail).toContain('Unresolved');
    expect(c.detail).not.toContain('supersedes');
    expect(c.detail).toContain('new: negative @ 2023-06-01');
  });

  it('treats opposite polarity with identical dates as a plain direct_conflict', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'DrugX', polarity: 'positive', date: '2023-01-01' },
      { id: 'b', subject: 'DrugX', polarity: 'negative', date: '2023-01-01' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.length).toBe(1);
    expect(report.contradictions[0].type).toBe('direct_conflict');
    expect(report.contradictions[0].severity).toBe('critical');
  });
});

describe('detectContradictions — claim selection & counting', () => {
  it('ignores claims missing a subject; checkedClaims counts only considered claims', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: '   ', metric: 'ORR', value: 0.2 }, // blank subject → ignored
      { subject: undefined as unknown as string, value: 1 }, // missing subject → ignored
    ];
    const report = detectContradictions(claims);
    expect(report.checkedClaims).toBe(1);
    expect(report.contradictions).toEqual([]);
  });

  it('uses the array index as the ref id when id is absent', () => {
    const claims: EvidenceClaim[] = [
      { subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { subject: 'NCT001', metric: 'ORR', value: 0.2 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions[0].claimA.id).toBe('#0');
    expect(report.contradictions[0].claimB.id).toBe('#1');
  });
});

describe('detectContradictions — clean & empty', () => {
  it('returns an empty contradictions array and empty subjects when consistent', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: 'NCT002', metric: 'ORR', value: 0.2 },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions).toEqual([]);
    expect(report.subjectsWithConflicts).toEqual([]);
    expect(report.checkedClaims).toBe(2);
  });

  it('handles empty input → empty report', () => {
    const report = detectContradictions([]);
    expect(report.contradictions).toEqual([]);
    expect(report.checkedClaims).toBe(0);
    expect(report.subjectsWithConflicts).toEqual([]);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it('always carries the honest structural-only caveat in notes', () => {
    const report = detectContradictions([]);
    expect(report.notes.some((n) => n.toLowerCase().includes('not semantic nlp'))).toBe(true);
  });
});

describe('detectContradictions — determinism & ordering', () => {
  it('is deterministic: same input twice deep-equals', () => {
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.45 },
      { id: 'b', subject: 'NCT001', metric: 'ORR', value: 0.2 },
      { id: 'c', subject: 'DrugX', polarity: 'positive' },
      { id: 'd', subject: 'DrugX', polarity: 'negative' },
    ];
    const first = detectContradictions(claims);
    const second = detectContradictions(claims);
    expect(second).toEqual(first);
  });

  it('orders findings by subject then type precedence (stable)', () => {
    // 'Zeta' numerical + 'Alpha' direct_conflict → Alpha first by subject sort.
    const claims: EvidenceClaim[] = [
      { id: 'z1', subject: 'Zeta', metric: 'ORR', value: 0.9 },
      { id: 'z2', subject: 'Zeta', metric: 'ORR', value: 0.1 },
      { id: 'a1', subject: 'Alpha', polarity: 'positive' },
      { id: 'a2', subject: 'Alpha', polarity: 'negative' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.map((c) => c.subject)).toEqual(['Alpha', 'Zeta']);
    expect(report.subjectsWithConflicts).toEqual(['Alpha', 'Zeta']);
  });

  it('orders multiple finding types within a subject by precedence', () => {
    // Same subject: numerical_mismatch (ORR) AND direct_conflict (polarity).
    const claims: EvidenceClaim[] = [
      { id: 'a', subject: 'NCT001', metric: 'ORR', value: 0.9, polarity: 'positive' },
      { id: 'b', subject: 'NCT001', metric: 'ORR', value: 0.1, polarity: 'negative' },
    ];
    const report = detectContradictions(claims);
    expect(report.contradictions.map((c) => c.type)).toEqual([
      'numerical_mismatch',
      'direct_conflict',
    ]);
  });
});

describe('CONTRADICTION_TYPES', () => {
  it('exposes the three known types in precedence order', () => {
    expect(CONTRADICTION_TYPES).toEqual([
      'numerical_mismatch',
      'direct_conflict',
      'temporal_inconsistency',
    ]);
  });
});

// IA: structured differences must not silently become unsupported conclusions.
describe('scientific comparability and unresolved chronology', () => {
  it('does not claim that a newer dated finding replaces the older finding', () => {
    const report = detectContradictions([
      { id: 'old', source: 'Study A', subject: 'DrugX', metric: 'safety', polarity: 'positive', date: '2020-01-01' },
      { id: 'new', source: 'Study B', subject: 'DrugX', metric: 'safety', polarity: 'negative', date: '2023-06-01' },
    ]);
    expect(report.contradictions).toHaveLength(1);
    expect(report.contradictions[0].detail).not.toMatch(/supersedes/i);
    expect(report.contradictions[0].detail).toMatch(/unresolved/i);
    expect(report.contradictions[0].detail).toMatch(/dates alone/i);
  });
  it('does not declare 1 mg and 1000 micrograms contradictory without an explicit conversion', () => {
    const report = detectContradictions([
      { id: 'a', subject: 'DrugX', metric: 'dose', value: 1, unit: 'mg' },
      { id: 'b', subject: 'DrugX', metric: 'dose', value: 1000, unit: 'micrograms' },
    ]);
    expect(report.contradictions).toEqual([]);
    expect(report.notes.join(' ')).toMatch(/units.*not compared/i);
    expect(report.notes.join(' ')).toContain('a');
    expect(report.notes.join(' ')).toContain('b');
  });
  it('keeps a same-unit numerical mismatch and its unit provenance', () => {
    const report = detectContradictions([
      { id: 'a', subject: 'DrugX', metric: 'dose', value: 1, unit: ' mg ' },
      { id: 'b', subject: 'DrugX', metric: 'DOSE', value: 10, unit: 'mg' },
    ]);
    expect(report.contradictions).toHaveLength(1);
    expect(report.contradictions[0].claimA).toHaveProperty('unit', ' mg ');
    expect(report.contradictions[0].claimB).toHaveProperty('unit', 'mg');
  });
  it('does not treat efficacy benefit and a safety signal as contradictory endpoints', () => {
    const report = detectContradictions([
      { id: 'efficacy', subject: 'DrugX', metric: 'efficacy', polarity: 'positive' },
      { id: 'safety', subject: 'DrugX', metric: 'safety', polarity: 'negative' },
    ]);
    expect(report.contradictions).toEqual([]);
    expect(report.notes.join(' ')).toMatch(/different metrics.*not compared/i);
  });
  it('unlabelled numerical values cannot establish a mismatch of the same metric', () => {
    const report = detectContradictions([{ subject: 'DrugX', value: 1 }, { subject: 'DrugX', value: 10 }]);
    expect(report.contradictions).toEqual([]);
    expect(report.notes.join(' ')).toMatch(/metric.*missing/i);
  });
  it('a unit missing on one side does not become an assumed equal unit', () => {
    const report = detectContradictions([{ subject: 'DrugX', metric: 'dose', value: 1, unit: 'mg' }, { subject: 'DrugX', metric: 'dose', value: 10 }]);
    expect(report.contradictions).toEqual([]);
    expect(report.notes.join(' ')).toMatch(/unit.*missing/i);
  });
  it('a structural mismatch with both units unspecified carries that limitation', () => {
    const report = detectContradictions([{ subject: 'DrugX', metric: 'dose', value: 1 }, { subject: 'DrugX', metric: 'dose', value: 10 }]);
    expect(report.contradictions).toHaveLength(1);
    expect(report.notes.join(' ')).toMatch(/units.*unspecified/i);
  });
  it('invalid dates cannot establish temporal ordering', () => {
    const report = detectContradictions([
      { subject: 'DrugX', polarity: 'positive', date: '2026-02-30' },
      { subject: 'DrugX', polarity: 'negative', date: 'yesterday' },
    ]);
    expect(report.contradictions[0].type).toBe('direct_conflict');
    expect(report.notes.join(' ')).toMatch(/invalid.*date/i);
  });
  it('empty input is explicitly unassessed, not evidence of consistency', () => {
    expect(detectContradictions([]).notes.join(' ')).toMatch(/assessment not performed/i);
  });
});

 it('preserves case-sensitive unit symbols instead of treating molar and milli symbols as equivalent', () => {
   const report = detectContradictions([{ subject: 'Product', metric: 'concentration', value: 1, unit: 'M' }, { subject: 'Product', metric: 'concentration', value: 1000, unit: 'm' }]);
   expect(report.contradictions).toEqual([]);
   expect(report.notes.join(' ')).toMatch(/different units/i);
 });
