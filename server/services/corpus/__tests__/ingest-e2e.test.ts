/**
 * End-to-end pipeline verification with REAL ClinicalTrials.gov data shaped to
 * the CT.gov v2 API schema (NCT01866319, NCT03820986 — Merck Phase 3 melanoma
 * trials, pulled 2026-06-10). Proves fetch → normalize → write → honest summary
 * through the real orchestrator + normalizer with an in-memory writer (no
 * network, no DB), de-risking the scripts/ingest-corpus.ts runner.
 */

import { describe, it, expect } from 'vitest';
import { ingestCtgov, type CorpusWriter, type CtgovFetcher } from '../ingest-ctgov';
import type { CtgovStudy } from '../ctgov-types';
import type { NormalizedStudy } from '../ctgov-normalizer';

/** Real trials, shaped to the CT.gov v2 protocolSection schema the fetcher returns. */
const REAL_STUDIES: CtgovStudy[] = [
  {
    protocolSection: {
      identificationModule: {
        nctId: 'NCT01866319',
        briefTitle: 'Study of Pembrolizumab vs Ipilimumab in Advanced Melanoma (KEYNOTE-006)',
        organization: { fullName: 'Merck Sharp & Dohme LLC' },
      },
      statusModule: {
        overallStatus: 'COMPLETED',
        startDateStruct: { date: '2013-08-28' },
        primaryCompletionDateStruct: { date: '2015-03-03' },
      },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Merck Sharp & Dohme LLC', class: 'INDUSTRY' } },
      designModule: {
        phases: ['PHASE3'],
        studyType: 'INTERVENTIONAL',
        enrollmentInfo: { count: 834, type: 'ACTUAL' },
        designInfo: { allocation: 'RANDOMIZED', primaryPurpose: 'TREATMENT' },
      },
      conditionsModule: { conditions: ['Melanoma'] },
      outcomesModule: {
        primaryOutcomes: [
          { measure: 'Progression-Free Survival (PFS)', timeFrame: 'Up to ~21 months' },
          { measure: 'Overall Survival (OS)', timeFrame: 'Up to ~21 months' },
        ],
      },
    },
  },
  {
    protocolSection: {
      identificationModule: {
        nctId: 'NCT03820986',
        briefTitle: 'Pembrolizumab + Lenvatinib vs Pembrolizumab in Advanced Melanoma (LEAP-003)',
        organization: { fullName: 'Merck Sharp & Dohme LLC' },
      },
      statusModule: {
        overallStatus: 'COMPLETED',
        startDateStruct: { date: '2019-03-12' },
        primaryCompletionDateStruct: { date: '2023-01-18' },
      },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Merck Sharp & Dohme LLC', class: 'INDUSTRY' } },
      designModule: {
        phases: ['PHASE3'],
        studyType: 'INTERVENTIONAL',
        enrollmentInfo: { count: 674, type: 'ACTUAL' },
        designInfo: { allocation: 'RANDOMIZED', primaryPurpose: 'TREATMENT' },
      },
      conditionsModule: { conditions: ['Malignant Melanoma'] },
      outcomesModule: { primaryOutcomes: [{ measure: 'Progression-Free Survival (PFS)' }] },
    },
  },
];

/** In-memory writer keyed by NCT id — mirrors the real Drizzle writer's contract. */
class InMemoryWriter implements CorpusWriter {
  readonly store = new Map<string, NormalizedStudy>();
  async upsert(study: NormalizedStudy): Promise<'inserted' | 'updated'> {
    const key = study.nctId ?? `t:${study.report.title}`;
    const existed = this.store.has(key);
    this.store.set(key, study);
    return existed ? 'updated' : 'inserted';
  }
}

const fetcherOf = (studies: CtgovStudy[]): CtgovFetcher => ({
  fetchStudies: async () => studies,
});

describe('corpus ingestion end-to-end (real CT.gov data, in-memory writer)', () => {
  it('fetches, normalizes, and writes real trials with an honest summary', async () => {
    const writer = new InMemoryWriter();
    const summary = await ingestCtgov({ indication: 'melanoma', phase: '3' }, {
      fetcher: fetcherOf(REAL_STUDIES),
      writer,
    });

    expect(summary.fetched).toBe(2);
    expect(summary.normalized).toBe(2);
    expect(summary.inserted).toBe(2);
    expect(summary.updated).toBe(0);
    expect(summary.errors).toBe(0);

    const k006 = writer.store.get('NCT01866319')!;
    expect(k006.report.sponsor).toBe('Merck Sharp & Dohme LLC');
    expect(k006.report.phase).toBe('Phase 3');
    expect(k006.successHint).toBe(1); // COMPLETED → coarse success hint
  });

  it('is idempotent — re-ingesting the same studies updates, not duplicates', async () => {
    const writer = new InMemoryWriter();
    const deps = { fetcher: fetcherOf(REAL_STUDIES), writer };
    await ingestCtgov({ indication: 'melanoma' }, deps);
    const second = await ingestCtgov({ indication: 'melanoma' }, deps);

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(2);
    expect(writer.store.size).toBe(2); // no duplication
  });

  it('isolates a bad record — one write failure does not abort the batch', async () => {
    const flaky: CorpusWriter = {
      async upsert(study) {
        if (study.nctId === 'NCT01866319') throw new Error('simulated write failure');
        return 'inserted';
      },
    };
    const summary = await ingestCtgov({ indication: 'melanoma' }, {
      fetcher: fetcherOf(REAL_STUDIES),
      writer: flaky,
    });
    expect(summary.errors).toBe(1);
    expect(summary.inserted).toBe(1);
    expect(summary.failures[0].nctId).toBe('NCT01866319');
  });
});
