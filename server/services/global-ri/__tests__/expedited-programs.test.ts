/**
 * Tests for the global expedited / accelerated regulatory programs matcher.
 *
 * Verifies the catalog shape and the deterministic, region-scoped eligibility
 * rules (FDA Expedited Programs guidance 2014; EMA PRIME / Accelerated
 * Assessment / Conditional MA / Exceptional Circumstances; PMDA Sakigake /
 * Conditional Early Approval / Priority Review / Orphan).
 */

import { describe, it, expect } from 'vitest';
import {
  EXPEDITED_PROGRAMS,
  matchExpeditedPrograms,
  programsForRegion,
  type MatchInput,
  type Region,
} from '../expedited-programs';

const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe('EXPEDITED_PROGRAMS catalog', () => {
  it('encodes the FDA, EMA and PMDA programs', () => {
    const byRegion = (r: Region) =>
      EXPEDITED_PROGRAMS.filter((p) => p.region === r).map((p) => p.id);

    expect(byRegion('FDA')).toEqual(
      expect.arrayContaining([
        'fda-fast-track',
        'fda-breakthrough-therapy',
        'fda-accelerated-approval',
        'fda-priority-review',
        'fda-rmat',
      ]),
    );
    expect(byRegion('EMA')).toEqual(
      expect.arrayContaining([
        'ema-prime',
        'ema-accelerated-assessment',
        'ema-conditional-ma',
        'ema-exceptional-circumstances',
      ]),
    );
    expect(byRegion('PMDA')).toEqual(
      expect.arrayContaining([
        'pmda-sakigake',
        'pmda-conditional-early-approval',
        'pmda-priority-review',
        'pmda-orphan-drug',
      ]),
    );
  });

  it('is ordered by id and every program is well-formed', () => {
    const sorted = [...EXPEDITED_PROGRAMS].sort((a, b) => a.id.localeCompare(b.id));
    expect(EXPEDITED_PROGRAMS.map((p) => p.id)).toEqual(sorted.map((p) => p.id));

    for (const p of EXPEDITED_PROGRAMS) {
      expect(p.id).toBeTruthy();
      expect(['FDA', 'EMA', 'PMDA']).toContain(p.region);
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(Array.isArray(p.criteria)).toBe(true);
      expect(p.criteria.length).toBeGreaterThan(0);
      expect(p.benefit).toBeTruthy();
    }
  });

  it('has unique program ids', () => {
    const set = new Set(EXPEDITED_PROGRAMS.map((p) => p.id));
    expect(set.size).toBe(EXPEDITED_PROGRAMS.length);
  });
});

describe('matchExpeditedPrograms — FDA', () => {
  it('serious + unmet need → Fast Track eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'FDA',
      seriousOrLifeThreatening: true,
      unmetMedicalNeed: true,
    });
    expect(ids(res.eligible)).toContain('fda-fast-track');
  });

  it('serious + preliminary evidence + substantial improvement → Breakthrough eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'FDA',
      seriousOrLifeThreatening: true,
      preliminaryClinicalEvidence: true,
      substantialImprovementOverExisting: true,
    });
    expect(ids(res.eligible)).toContain('fda-breakthrough-therapy');
  });

  it('surrogate + serious + unmet need → Accelerated Approval eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'FDA',
      seriousOrLifeThreatening: true,
      unmetMedicalNeed: true,
      surrogateEndpointReasonablyLikely: true,
    });
    expect(ids(res.eligible)).toContain('fda-accelerated-approval');
  });

  it('regenerative + serious + preliminary evidence → RMAT eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'FDA',
      regenerativeMedicine: true,
      seriousOrLifeThreatening: true,
      preliminaryClinicalEvidence: true,
    });
    expect(ids(res.eligible)).toContain('fda-rmat');
  });

  it('substantial improvement alone → Priority Review eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'FDA',
      substantialImprovementOverExisting: true,
    });
    expect(ids(res.eligible)).toContain('fda-priority-review');
  });
});

describe('matchExpeditedPrograms — EMA', () => {
  it('unmet need + preliminary evidence → PRIME eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'EMA',
      unmetMedicalNeed: true,
      preliminaryClinicalEvidence: true,
    });
    expect(ids(res.eligible)).toContain('ema-prime');
  });

  it('serious + unmet need → Conditional MA eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'EMA',
      seriousOrLifeThreatening: true,
      unmetMedicalNeed: true,
    });
    expect(ids(res.eligible)).toContain('ema-conditional-ma');
  });

  it('comprehensive data unobtainable → Exceptional Circumstances eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'EMA',
      comprehensiveDataUnobtainable: true,
    });
    expect(ids(res.eligible)).toContain('ema-exceptional-circumstances');
  });
});

describe('matchExpeditedPrograms — PMDA', () => {
  it('all four Sakigake criteria → eligible', () => {
    const res = matchExpeditedPrograms({
      region: 'PMDA',
      innovativeNovelMechanism: true,
      seriousOrLifeThreatening: true,
      substantialImprovementOverExisting: true,
      intendedForEarlyJapanDevelopment: true,
    });
    expect(ids(res.eligible)).toContain('pmda-sakigake');
  });

  it('only substantial improvement + early JP development → NOT Sakigake eligible (all four criteria required)', () => {
    const res = matchExpeditedPrograms({
      region: 'PMDA',
      substantialImprovementOverExisting: true,
      intendedForEarlyJapanDevelopment: true,
    });
    expect(ids(res.eligible)).not.toContain('pmda-sakigake');
  });

  it('orphan → Orphan Drug Designation eligible', () => {
    const res = matchExpeditedPrograms({ region: 'PMDA', orphan: true });
    expect(ids(res.eligible)).toContain('pmda-orphan-drug');
  });
});

describe('matchExpeditedPrograms — non-matching and scoping', () => {
  it('empty input → nothing eligible, programs reported as notSuitable', () => {
    const res = matchExpeditedPrograms({ region: 'FDA' });
    expect(res.eligible).toEqual([]);
    expect(ids(res.notSuitable)).toContain('fda-fast-track');
    expect(res.notSuitable.length).toBeGreaterThan(0);
  });

  it('only returns programs for the requested region', () => {
    const res = matchExpeditedPrograms({
      region: 'FDA',
      seriousOrLifeThreatening: true,
      unmetMedicalNeed: true,
      orphan: true,
    });
    const all = [...res.eligible, ...res.notSuitable];
    expect(all.every((m) => m.id.startsWith('fda-'))).toBe(true);
    expect(ids(all)).not.toContain('pmda-orphan-drug');
    // Every FDA program appears exactly once across the two lists.
    expect(all.length).toBe(programsForRegion('FDA').length);
  });

  it('partitions: a program is either eligible or notSuitable, never both', () => {
    const res = matchExpeditedPrograms({
      region: 'EMA',
      unmetMedicalNeed: true,
      preliminaryClinicalEvidence: true,
    });
    const eligibleIds = new Set(ids(res.eligible));
    for (const ns of res.notSuitable) {
      expect(eligibleIds.has(ns.id)).toBe(false);
    }
  });
});

describe('matchExpeditedPrograms — determinism and ordering', () => {
  const input: MatchInput = {
    region: 'FDA',
    seriousOrLifeThreatening: true,
    unmetMedicalNeed: true,
    surrogateEndpointReasonablyLikely: true,
    substantialImprovementOverExisting: true,
    preliminaryClinicalEvidence: true,
  };

  it('identical input yields identical output', () => {
    expect(matchExpeditedPrograms(input)).toEqual(matchExpeditedPrograms(input));
  });

  it('both result lists are ordered by program id', () => {
    const res = matchExpeditedPrograms(input);
    const eligibleIds = ids(res.eligible);
    const notSuitableIds = ids(res.notSuitable);
    expect(eligibleIds).toEqual([...eligibleIds].sort((a, b) => a.localeCompare(b)));
    expect(notSuitableIds).toEqual([...notSuitableIds].sort((a, b) => a.localeCompare(b)));
  });
});
