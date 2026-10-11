import { describe, expect, it } from 'vitest';
import protocolJson from '../pq-protocol.json';
import { computeVerdict, type PqProtocol, type PqRagRecord } from '../pq-verdict.js';

const protocol = (): PqProtocol => {
  const p = JSON.parse(JSON.stringify(protocolJson)) as unknown as PqProtocol;
  p.status = 'approved'; p.approvedBy = 'test owner'; p.approvedOn = '2026-10-06';
  p.components.rag.executable = true; p.components.rag.criteria.minScoredItems = 1;
  return p;
};
const generation = Array.from({ length: 10 }, (_, i) => ({ taskId: `g${i}`, docType: 'ind', servedModel: 'generator-pin',
  servedModelVerified: true, sectionCoverage: 1, forbiddenHits: 0 }));
const extraction = [{ taskId: 'e1', docType: 'ind', servedModel: 'generator-pin', servedModelVerified: true, f1: 1, precision: 1, recall: 1 }];
const record = () => ({ ran: true, itemsScored: 1, plannedItemIds: ['q1'],
  scopeVerified: true, scope: { organizationId: 7, organizationUuid: '11111111-1111-4111-8111-111111111111', programId: '22222222-2222-4222-8222-222222222222' },
  goldBankSha256: 'a'.repeat(64), corpusManifestSha256: 'b'.repeat(64),
  attribution: { generator: { modelId: 'generator', pinnedVersion: 'generator-pin', provider: 'anthropic' },
    judge: { modelId: 'judge', pinnedVersion: 'judge-pin', provider: 'openai' } },
  items: [{ itemId: 'q1', negativeControl: false, servedModel: 'generator-pin', servedProvider: 'anthropic',
    generatorCalled: true, generationRequestSha256: 'a'.repeat(64), generationResponseSha256: 'b'.repeat(64),
    judgeRequestSha256: 'c'.repeat(64), judgeResponseSha256: 'd'.repeat(64), servedModelVerified: true, judgeServedModel: 'judge-pin', judgeServedProvider: 'openai', judgeVerified: true,
    hit: 1, faithfulness: 1, negativeControlPassed: null }],
});
const verdict = (r: unknown) => computeVerdict(protocol(), generation, extraction, r as PqRagRecord);

describe('RAG PQ checks actual serving attribution and complete case coverage', () => {
  it('control: a fully attributable, complete record can meet an approved test copy', () => {
    expect(verdict(record()).verdict).toBe('PASS');
  });
  it('missing live scope and corpus provenance cannot qualify an attributed reply', () => {
    const r = record(); r.scopeVerified = false; r.goldBankSha256 = 'not-a-digest';
    expect(verdict(r).verdict).toBe('INCOMPLETE');
  });
  it('legacy records without judge/plan attribution are incomplete, not newly qualified', () => {
    const r = record();
    delete (r as { attribution?: unknown }).attribution;
    delete (r as { plannedItemIds?: unknown }).plannedItemIds;
    expect(verdict(r).verdict).toBe('INCOMPLETE');
  });
  it('does not trust a true judgeVerified flag when the served judge version is wrong', () => {
    const r = record(); r.items[0].judgeServedModel = 'different-judge';
    expect(verdict(r).verdict).toBe('INCOMPLETE');
  });
  it('rejects a judge that actually used the generator even when requested aliases differ', () => {
    const r = record();
    r.attribution.judge.pinnedVersion = 'generator-pin';
    r.items[0].judgeServedModel = 'generator-pin';
    expect(verdict(r).verdict).toBe('INCOMPLETE');
  });
  it('rejects the wrong actual generator provider', () => {
    const r = record(); r.items[0].servedProvider = 'openai';
    expect(verdict(r).verdict).toBe('INCOMPLETE');
  });
  it('does not let a missing planned hard case disappear from the record', () => {
    const r = record(); r.plannedItemIds.push('q2-hard-case');
    expect(verdict(r).verdict).toBe('INCOMPLETE');
  });
  it('an answered negative control that fabricated unsupported information is a failed control', () => {
    const r = record();
    r.plannedItemIds.push('negative');
    r.items.push({ ...r.items[0], itemId: 'negative', negativeControl: true, hit: null as unknown as number,
      faithfulness: null as unknown as number, negativeControlPassed: false as unknown as null });
    expect(verdict(r).verdict).toBe('FAIL');
  });
});
