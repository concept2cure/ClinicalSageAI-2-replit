/**
 * assess_trial_feasibility AnA tool — registration, input guard, and the
 * success path with ClinicalTrials.gov mocked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../integrations/clinicaltrials-client.js', () => ({
  searchTrials: vi.fn(async () => ({
    source: 'ClinicalTrials.gov',
    totalCount: 50,
    trials: [
      ...Array.from({ length: 7 }, () => ({
        nctId: 'NCT1', title: 't', status: 'COMPLETED', phase: 'PHASE3', studyType: 'INTERVENTIONAL',
        conditions: ['c'], interventions: ['i'], sponsor: 'S', enrollment: 300,
        startDate: '2019-01-01', completionDate: '2021-06-01', url: 'u',
      })),
      {
        nctId: 'NCT2', title: 't', status: 'TERMINATED', phase: 'PHASE3', studyType: 'INTERVENTIONAL',
        conditions: ['c'], interventions: ['i'], sponsor: 'S2', enrollment: null,
        startDate: null, completionDate: null, url: 'u',
      },
    ],
  })),
}));

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('assess_trial_feasibility tool', () => {
  afterEach(() => vi.clearAllMocks());

  it('is registered and defined', () => {
    expect(typeof getToolHandler('assess_trial_feasibility')).toBe('function');
    expect(ALL_ANA_TOOLS.some(t => t.name === 'assess_trial_feasibility')).toBe(true);
  });

  it('requires a condition', async () => {
    const out = JSON.parse(await getToolHandler('assess_trial_feasibility')!({ condition: '  ' }, {} as any));
    expect(out.error).toMatch(/condition/i);
  });

  it('returns empirical base rates with provenance on the success path', async () => {
    const out = JSON.parse(
      await getToolHandler('assess_trial_feasibility')!({ condition: 'NSCLC', phase: 'PHASE3' }, {} as any)
    );
    expect(out.source).toBe('ClinicalTrials.gov');
    expect(out.totalMatched).toBe(50);
    expect(out.resolved).toBe(8); // 7 completed + 1 terminated
    expect(out.completionRate.of).toEqual({ count: 7, total: 8 });
    expect(out.provenance[0].sourceId).toBe('clinicaltrials');
    expect(out.citation_hint).toMatch(/empirical/i);
  });
});
