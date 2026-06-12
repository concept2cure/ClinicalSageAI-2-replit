/**
 * Corpus ingestion sweep — query-plan builder.
 *
 * The flywheel's plan is the cartesian product of indications × phases. These
 * tests lock that pure logic (the scheduling/IO is exercised separately).
 */

import { describe, it, expect } from 'vitest';
import { buildCorpusIngestionPlan } from '../corpusIngestionSweep';

describe('buildCorpusIngestionPlan', () => {
  it('expands indications across phases (cartesian product, order-stable)', () => {
    const plan = buildCorpusIngestionPlan({
      indications: ['nsclc', 'myeloma'],
      phases: ['PHASE2', 'PHASE3'],
      limit: 50,
    });
    expect(plan).toEqual([
      { indication: 'nsclc', phase: 'PHASE2', limit: 50 },
      { indication: 'nsclc', phase: 'PHASE3', limit: 50 },
      { indication: 'myeloma', phase: 'PHASE2', limit: 50 },
      { indication: 'myeloma', phase: 'PHASE3', limit: 50 },
    ]);
  });

  it('emits one unfiltered-phase query per indication when no phases given', () => {
    const plan = buildCorpusIngestionPlan({ indications: ['nsclc'], phases: [], limit: 25 });
    expect(plan).toEqual([{ indication: 'nsclc', limit: 25 }]);
  });

  it('returns an empty plan when no indications are configured', () => {
    expect(buildCorpusIngestionPlan({ indications: [], phases: ['PHASE3'] })).toEqual([]);
  });

  it('trims and drops blank indications/phases', () => {
    const plan = buildCorpusIngestionPlan({
      indications: ['  nsclc  ', '', '   '],
      phases: ['PHASE3', ' '],
      limit: 10,
    });
    expect(plan).toEqual([{ indication: 'nsclc', phase: 'PHASE3', limit: 10 }]);
  });

  it('falls back to the default limit for non-positive/missing limits', () => {
    const plan = buildCorpusIngestionPlan({ indications: ['nsclc'], phases: ['PHASE3'], limit: 0 });
    expect(plan).toEqual([{ indication: 'nsclc', phase: 'PHASE3', limit: 100 }]);
  });
});
