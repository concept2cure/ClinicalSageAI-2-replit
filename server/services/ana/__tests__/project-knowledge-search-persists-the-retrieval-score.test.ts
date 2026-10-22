/**
 * project_knowledge_search hands its retrieval score to the provenance it
 * persists.
 *
 * Until 2026-10-15 the tool built each passage's provenance with only
 * `confidence: confidenceFromScore(d.finalScore)` — a bucket (0.91 → 'high').
 * ProvenanceRecord carries the raw score under its own name (`retrievalScore`)
 * and persist-provenance writes it to the lineage row's metadata, but the tool
 * never passed it, so every persisted RAG citation recorded
 * `retrievalScore: null`: the one measured figure the retrieval produced was
 * dropped on the way to the audit trail. A passage with no score must still
 * persist null, never a 0.
 *
 * The ragRouter is mocked; the persistence projection is the real one
 * (persistProvenance with an injected recorder).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../ragRouter', () => ({
  ragRouter: {
    retrieve: vi.fn(async () => ({
      documents: [
        {
          id: 'row1',
          documentId: 'doc-42',
          title: 'Protocol v3',
          content: 'The primary endpoint is overall survival at 24 months.',
          finalScore: 0.91,
          locator: 'Section 9.1',
        },
        {
          id: 'row2',
          documentId: 'doc-43',
          title: 'Investigator Brochure',
          content: 'No relevance score was produced for this passage.',
        },
      ],
    })),
  },
}));

import { getToolHandler } from '../AnaToolExecutor';
import { persistProvenance } from '../../evidence/persist-provenance';
import type { LineageEntry } from '../../data-lineage-service';
import type { ProvenanceRecord } from '../../evidence/provenance';

describe('project_knowledge_search — the retrieval score reaches persisted provenance', () => {
  it('records the passage score as metadata.retrievalScore, and null where there is none', async () => {
    const ctx = { projectId: 1, organizationUuid: 'org-uuid' } as never;
    const out = JSON.parse(await getToolHandler('project_knowledge_search')!({ query: 'primary endpoint' }, ctx));
    const records = out.provenance as ProvenanceRecord[];
    expect(records).toHaveLength(2);

    const written: LineageEntry[] = [];
    await persistProvenance(
      records,
      { organizationId: 7, targetObjectType: 'answer', targetObjectId: 'thread-1' },
      async (entries) => {
        written.push(...entries);
        return entries.length;
      },
    );

    expect(written[0].metadata?.retrievalScore, 'the scored passage persisted no retrieval score').toBe(0.91);
    expect(written[0].metadata?.confidenceLevel).toBe('high');
    // Unscored: not measured, so null — never a zero.
    expect(written[1].metadata?.retrievalScore).toBeNull();
    expect(written[1].metadata?.confidenceLevel).toBeNull();
  });
});
