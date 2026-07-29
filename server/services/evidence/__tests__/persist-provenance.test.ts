/**
 * Persist-provenance bridge — unit tests (recorder injected; no database).
 * Lock in the provenance→lineage projection (source columns from
 * toLineageSource, target columns + linkage from the target) and the batch
 * persistence contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildProvenance } from '../provenance';
import { provenanceToLineageEntry, persistProvenance, type ProvenanceTarget } from '../persist-provenance';

const fixedNow = () => new Date('2026-06-12T00:00:00.000Z');

const target: ProvenanceTarget = {
  organizationId: 7,
  projectId: 3,
  targetObjectType: 'answer',
  targetObjectId: 'msg-100',
  targetTitle: 'AnA response',
  createdById: 11,
  aiModelUsed: 'claude',
};

describe('provenanceToLineageEntry', () => {
  it('projects source columns from the record and target columns from the target', () => {
    const rec = buildProvenance({
      sourceId: 'pubmed',
      citation: { title: 'A study', identifier: 'PMID:123', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' },
      query: 'tau',
      confidence: 'high',
      now: fixedNow,
    });
    const entry = provenanceToLineageEntry(rec, target);
    // SOURCE
    expect(entry.sourceObjectType).toBe('external_evidence');
    expect(entry.sourceObjectId).toBe('PMID:123');
    expect(entry.sourceTitle).toBe('A study');
    expect(entry.confidenceScore).toBe(90); // high → 90
    expect(entry.confidenceBasis).toBe('validation_based');
    // TARGET
    expect(entry.organizationId).toBe(7);
    expect(entry.projectId).toBe(3);
    expect(entry.targetObjectType).toBe('answer');
    expect(entry.targetObjectId).toBe('msg-100');
    expect(entry.linkageType).toBe('cited_by'); // default
    expect(entry.transformationType).toBe('ai_generation');
    expect(entry.aiModelUsed).toBe('claude');
    // METADATA carries the rich envelope
    expect((entry.metadata as any).peerReviewed).toBe(true);
    expect((entry.metadata as any).authority).toBe('primary');
    expect((entry.metadata as any).url).toContain('pubmed');
  });

  it('honors a custom linkage verb', () => {
    const rec = buildProvenance({
      sourceId: 'project_corpus',
      citation: { title: 'Protocol (Section 9.1)', identifier: 'doc-42', url: null },
      now: fixedNow,
    });
    const entry = provenanceToLineageEntry(rec, { ...target, linkageType: 'derived_from' });
    expect(entry.linkageType).toBe('derived_from');
    expect(entry.sourceObjectType).toBe('retrieval_chunk');
    expect(entry.sourceObjectId).toBe('doc-42');
  });
});

describe('persistProvenance', () => {
  it('writes one lineage entry per record via the injected recorder', async () => {
    const recorder = vi.fn(async (entries: any[]) => entries.length);
    const records = [
      buildProvenance({ sourceId: 'pubmed', citation: { title: 'A', identifier: 'PMID:1', url: null }, now: fixedNow }),
      buildProvenance({ sourceId: 'chembl', citation: { title: 'B', identifier: 'CHEMBL2', url: null }, now: fixedNow }),
    ];
    const written = await persistProvenance(records, target, recorder);
    expect(written).toBe(2);
    expect(recorder).toHaveBeenCalledTimes(1);
    const passed = recorder.mock.calls[0][0];
    expect(passed).toHaveLength(2);
    expect(passed[0].sourceObjectId).toBe('PMID:1');
    expect(passed[1].sourceObjectId).toBe('CHEMBL2');
  });

  it('no-ops on an empty record list without calling the recorder', async () => {
    const recorder = vi.fn(async () => 0);
    expect(await persistProvenance([], target, recorder)).toBe(0);
    expect(recorder).not.toHaveBeenCalled();
  });
});
