import { describe, it, expect } from 'vitest';
import {
  ingestCtgov,
  type CorpusWriter,
  type CtgovFetcher,
  type NormalizedStudyWriteResult,
} from '../../server/services/corpus/ingest-ctgov';
import type { NormalizedStudy } from '../../server/services/corpus/ctgov-normalizer';
import type { CtgovStudy } from '../../server/services/corpus/ctgov-types';

function study(nctId: string, title = 'Study'): CtgovStudy {
  return {
    protocolSection: {
      identificationModule: { nctId, briefTitle: title },
      conditionsModule: { conditions: ['X'] },
    },
  };
}

/** A fake writer that records seen NCT ids and reports insert vs update. */
class FakeWriter implements CorpusWriter {
  seen = new Set<string>();
  upserts: NormalizedStudy[] = [];
  failOn?: string;

  async upsert(s: NormalizedStudy): Promise<NormalizedStudyWriteResult> {
    if (this.failOn && s.nctId === this.failOn) {
      throw new Error(`write failed for ${s.nctId}`);
    }
    this.upserts.push(s);
    const key = s.nctId ?? '';
    if (this.seen.has(key)) return 'updated';
    this.seen.add(key);
    return 'inserted';
  }
}

class FakeFetcher implements CtgovFetcher {
  constructor(private studies: CtgovStudy[]) {}
  async fetchStudies(): Promise<CtgovStudy[]> {
    return this.studies;
  }
}

describe('ingestCtgov', () => {
  it('counts inserts and normalizes', async () => {
    const writer = new FakeWriter();
    const fetcher = new FakeFetcher([study('NCT1'), study('NCT2')]);
    const summary = await ingestCtgov({ indication: 'X' }, { fetcher, writer });
    expect(summary.fetched).toBe(2);
    expect(summary.normalized).toBe(2);
    expect(summary.inserted).toBe(2);
    expect(summary.updated).toBe(0);
    expect(summary.errors).toBe(0);
  });

  it('is idempotent: re-ingesting the same study updates, not inserts', async () => {
    const writer = new FakeWriter();
    const fetcher = new FakeFetcher([study('NCT1')]);
    await ingestCtgov({}, { fetcher, writer });
    const second = await ingestCtgov({}, { fetcher, writer });
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(1);
  });

  it('skips un-normalizable studies without erroring', async () => {
    const writer = new FakeWriter();
    const fetcher = new FakeFetcher([study('NCT1'), {}, { protocolSection: {} }]);
    const summary = await ingestCtgov({}, { fetcher, writer });
    expect(summary.fetched).toBe(3);
    expect(summary.normalized).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.inserted).toBe(1);
  });

  it('isolates write errors per record and reports failures', async () => {
    const writer = new FakeWriter();
    writer.failOn = 'NCT2';
    const fetcher = new FakeFetcher([study('NCT1'), study('NCT2'), study('NCT3')]);
    const summary = await ingestCtgov({}, { fetcher, writer });
    expect(summary.inserted).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.failures).toEqual([{ nctId: 'NCT2', error: 'write failed for NCT2' }]);
  });
});
