/**
 * When ClinicalTrials.gov does not return totalCount, the total is not known.
 *
 * What searchTrials used to do (until 2026-10-15): `totalCount` fell back to the
 * number of studies on the page, so a query matching thousands of trials whose
 * response omitted the count reported a total of one page (e.g. 2), and trial
 * feasibility passed that on as totalMatched. The client requests countTotal; a
 * response without it now reports null.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchTrials } from '../clinicaltrials-client';
import { assessTrialFeasibility } from '../../study-design/trial-feasibility-service';

const STUDY = { protocolSection: { identificationModule: { nctId: 'NCT00000001', briefTitle: 'T' } } };

describe('ClinicalTrials.gov totalCount', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

  it('is null, not the page length, when the response omits it', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ studies: [STUDY, STUDY] }) }) as unknown as typeof fetch;
    const r = await searchTrials({ condition: 'NSCLC-total-unreported', pageSize: 2 });
    expect(r.totalCount).toBeNull();
  });

  it('feasibility reports totalMatched null for it', async () => {
    const r = await assessTrialFeasibility({ condition: 'NSCLC' }, async () => ({ source: 'ClinicalTrials.gov', totalCount: null, trials: [] }));
    expect(r.totalMatched).toBeNull();
  });
});
