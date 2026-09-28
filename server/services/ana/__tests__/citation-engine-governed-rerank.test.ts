/**
 * A citation verdict is drawn only from a rerank an approved model produced.
 *
 * Each sentence's supported / gap status comes from verifyClaim over the
 * retrieval's blended score, half of which is an LLM judge's relevance score.
 * Until 2026-09-23 that judge routed as structured_output — any model, gpt-4o
 * first — and a failed or unreadable judge quietly fell back (0.5, or the
 * embedding order), so a verdict could be drawn from a figure nothing approved
 * had produced. The citation engine now asks for a governed rerank, and a
 * sentence whose retrieval failed is flagged as unchecked, not left looking
 * like a finding about its content.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({
  retrieve: vi.fn(),
}));

vi.mock('../../../db/runtime.js', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (/FROM concept2cure_artifacts\s+WHERE artifact_id/.test(sql)) {
        return {
          rows: [
            {
              id: 11,
              artifact_id: 'art-1',
              project_id: 5,
              organization_id: 9,
              ctd_section: '2.7.3',
              content: 'The primary endpoint was met in the pivotal study. Enrolment reached 412 subjects.',
              content_hash: 'h',
            },
          ],
        };
      }
      return { rows: [] };
    },
  }),
}));
vi.mock('../../advancedRAGPipeline.js', () => ({
  getRAGPipeline: () => ({ retrieve: S.retrieve }),
}));

import { runCitationEngine } from '../citation-engine';

const ORG_UUID = '00000000-0000-4000-8000-000000000009';

beforeEach(() => {
  S.retrieve.mockReset();
});

describe('citation runs ask for a governed rerank', () => {
  it('every retrieval that feeds a verdict is reranked in governed-verdict mode', async () => {
    S.retrieve.mockImplementation(async () => ({ documents: [] }));

    await runCitationEngine('art-1', 9, { persist: false, organizationUuid: ORG_UUID });

    expect(S.retrieve).toHaveBeenCalled();
    for (const [, opts] of S.retrieve.mock.calls) {
      expect(opts).toMatchObject({ useReranking: true, governedVerdict: true });
    }
  });

  it('a sentence whose retrieval failed is a flagged gap, and the run counts it', async () => {
    S.retrieve.mockImplementation(async () => {
      throw new Error('MODEL_NOT_APPROVED_FOR_HIGH_RISK: regulatory_review');
    });

    const run = await runCitationEngine('art-1', 9, { persist: false, organizationUuid: ORG_UUID });

    expect(run.citations.length).toBeGreaterThan(0);
    for (const c of run.citations) {
      expect(c.status).toBe('gap');
      expect(c.flags.map(f => f.rule)).toContain('RETRIEVAL_FAILED');
    }
    expect(run.metadata.retrievalFailures).toBe(run.citations.length);
  });

  it('a sentence whose retrieval succeeded carries no retrieval-failure flag', async () => {
    S.retrieve.mockImplementation(async () => ({ documents: [] }));

    const run = await runCitationEngine('art-1', 9, { persist: false, organizationUuid: ORG_UUID });

    for (const c of run.citations) expect(c.flags.map(f => f.rule)).not.toContain('RETRIEVAL_FAILED');
    expect(run.metadata.retrievalFailures).toBeUndefined();
  });
});
