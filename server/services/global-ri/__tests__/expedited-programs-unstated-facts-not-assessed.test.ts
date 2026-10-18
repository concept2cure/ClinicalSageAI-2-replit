/**
 * Expedited-program screen: a program is "not suitable" only when a fact it
 * needs is stated false; when a needed fact was not stated it is "not assessed",
 * with the facts it still needs.
 *
 * Until 2026-10-15 every rule read its facts with `!!`, so an unstated fact
 * counted as false: {region:'FDA'} listed all five FDA programs as notSuitable,
 * and the strategy brief summed that to totalExpeditedPrograms 0 ("none") for a
 * product nobody had described. A truthy non-boolean ("no") also read as true.
 */

import { describe, it, expect } from 'vitest';
import { matchExpeditedPrograms, programsForRegion } from '../expedited-programs';

const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe('matchExpeditedPrograms — unstated facts are not assessed', () => {
  it('no facts stated: nothing eligible, nothing called not suitable, every program not assessed', () => {
    const r = matchExpeditedPrograms({ region: 'FDA' });
    expect(r.eligible).toEqual([]);
    expect(r.notSuitable).toEqual([]);
    expect(ids(r.notAssessed)).toEqual(programsForRegion('FDA').map((p) => p.id).sort((a, b) => a.localeCompare(b)));
    const fastTrack = r.notAssessed.find((p) => p.id === 'fda-fast-track')!;
    expect(fastTrack.missing).toEqual(['seriousOrLifeThreatening', 'unmetMedicalNeed']);
  });

  it('a stated-false fact makes the programs that need it not suitable; programs that do not need it stay not assessed', () => {
    const r = matchExpeditedPrograms({ region: 'FDA', seriousOrLifeThreatening: false });
    expect(ids(r.notSuitable)).toEqual(
      expect.arrayContaining(['fda-accelerated-approval', 'fda-breakthrough-therapy', 'fda-fast-track', 'fda-rmat']),
    );
    expect(ids(r.notAssessed)).toEqual(['fda-priority-review']);
  });

  it('partly stated: eligible where every needed fact is true, not assessed where one is missing', () => {
    const r = matchExpeditedPrograms({ region: 'EMA', seriousOrLifeThreatening: true, unmetMedicalNeed: true });
    expect(ids(r.eligible)).toEqual(['ema-conditional-ma']);
    const prime = r.notAssessed.find((p) => p.id === 'ema-prime')!;
    expect(prime.missing).toEqual(['preliminaryClinicalEvidence']);
  });

  it('a non-boolean value is not read as true', () => {
    const r = matchExpeditedPrograms({ region: 'PMDA', orphan: 'no' as unknown as boolean });
    expect(ids(r.eligible)).not.toContain('pmda-orphan-drug');
    expect(ids(r.notAssessed)).toContain('pmda-orphan-drug');
  });

  it('every program of the region appears exactly once across the three lists', () => {
    const r = matchExpeditedPrograms({ region: 'PMDA', seriousOrLifeThreatening: true, orphan: false });
    const all = ids([...r.eligible, ...r.notSuitable, ...r.notAssessed]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(programsForRegion('PMDA').length);
  });
});
