/**
 * Provenance retrofit on the core evidence tools — asserts each surfaces the
 * unified provenance envelope with the correct source id, authority, and
 * citation. Integration clients are mocked so the suite is hermetic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../integrations/pubmed-client.js', () => ({
  searchPubmed: vi.fn(async () => ({
    source: 'PubMed',
    totalCount: 1,
    articles: [
      { pmid: '123', title: 'A study', authors: 'Doe J', journal: 'J', pubDate: '2024', doi: '10.1/x', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' },
    ],
  })),
}));
vi.mock('../../integrations/clinicaltrials-client.js', () => ({
  searchTrials: vi.fn(async () => ({
    source: 'ClinicalTrials.gov',
    totalCount: 1,
    trials: [{ nctId: 'NCT00000001', title: 'A trial', url: 'https://clinicaltrials.gov/study/NCT00000001' }],
  })),
}));
vi.mock('../../integrations/icd10-client.js', () => ({
  lookupIcd10: vi.fn(async () => ({
    source: 'NLM ICD-10-CM (Clinical Tables)',
    query: 'diabetes',
    total: 1,
    codes: [{ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' }],
  })),
}));

import { getToolHandler } from '../AnaToolExecutor';

describe('evidence tools — unified provenance envelope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('search_literature stamps PubMed provenance (primary, peer-reviewed)', async () => {
    const out = JSON.parse(await getToolHandler('search_literature')!({ query: 'tau' }, {} as any));
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].sourceId).toBe('pubmed');
    expect(out.provenance[0].peerReviewed).toBe(true);
    expect(out.provenance[0].authority).toBe('primary');
    expect(out.provenance[0].citation.identifier).toBe('10.1/x');
  });

  it('search_clinical_evidence stamps ClinicalTrials provenance keyed by NCT id', async () => {
    const out = JSON.parse(await getToolHandler('search_clinical_evidence')!({ query: 'nsclc' }, {} as any));
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].sourceId).toBe('clinicaltrials');
    expect(out.provenance[0].citation.identifier).toBe('NCT00000001');
    expect(out.provenance[0].citation.url).toContain('NCT00000001');
  });

  it('lookup_icd10_code stamps ICD-10 provenance keyed by code', async () => {
    const out = JSON.parse(await getToolHandler('lookup_icd10_code')!({ term: 'diabetes' }, {} as any));
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].sourceId).toBe('icd10');
    expect(out.provenance[0].citation.identifier).toBe('E11.9');
    expect(out.codes).toHaveLength(1); // original payload preserved
  });
});
