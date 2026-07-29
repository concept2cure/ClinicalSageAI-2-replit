/**
 * Trial-feasibility service — orchestrator tests with an injected CT.gov searcher
 * (no network). Verifies comparator mapping, the empirical assessment, the
 * provenance citation, and the required-condition guard.
 */
import { describe, it, expect, vi } from 'vitest';
import { assessTrialFeasibility } from '../trial-feasibility-service';

function ctTrial(status: string, enrollment: number | null, sponsor = 'S') {
  return {
    nctId: 'NCT0000', title: 't', status, phase: 'PHASE3', studyType: 'INTERVENTIONAL',
    conditions: ['nsclc'], interventions: ['drug'], sponsor, enrollment,
    startDate: '2020-01-01', completionDate: '2022-01-01', url: 'https://clinicaltrials.gov/study/NCT0000',
  };
}

const searcher = vi.fn(async () => ({
  source: 'ClinicalTrials.gov' as const,
  totalCount: 123,
  trials: [
    ...Array.from({ length: 8 }, (_, i) => ctTrial('COMPLETED', 200 + i, `S${i % 3}`)),
    ctTrial('TERMINATED', null, 'S8'),
    ctTrial('WITHDRAWN', null, 'S8'),
    ctTrial('RECRUITING', null, 'S9'),
  ],
}));

describe('assessTrialFeasibility (service)', () => {
  it('maps CT.gov trials, computes empirical rates, and cites the query', async () => {
    const r = await assessTrialFeasibility({ condition: 'NSCLC', phase: 'PHASE3' }, searcher);
    expect(searcher).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'NSCLC', phase: 'PHASE3', pageSize: 100 })
    );
    expect(r.source).toBe('ClinicalTrials.gov');
    expect(r.totalMatched).toBe(123);
    expect(r.comparatorsAnalyzed).toBe(11);
    expect(r.resolved).toBe(10); // 8 completed + 2 discontinued
    expect(r.completionRate?.rate).toBe(0.8);
    expect(r.verdict).toBe('favorable');
    expect(r.activeCompetitors).toBe(1);
    // Provenance cites ClinicalTrials.gov and carries the model's caveats.
    expect(r.provenance).toHaveLength(1);
    expect(r.provenance[0].sourceId).toBe('clinicaltrials');
    expect(r.provenance[0].caveats.length).toBeGreaterThan(0);
  });

  it('clamps maxComparators into the page size and requires a condition', async () => {
    await assessTrialFeasibility({ condition: 'x', maxComparators: 9999 }, searcher);
    expect(searcher).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 200 }));
    await expect(assessTrialFeasibility({ condition: '  ' }, searcher)).rejects.toThrow(/condition is required/i);
  });
});
