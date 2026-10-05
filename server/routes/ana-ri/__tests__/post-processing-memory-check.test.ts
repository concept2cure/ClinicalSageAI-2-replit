/**
 * The write-back is handed the turn's answer check (FV-missed, AnA reasoning
 * round 8, 2026-10-05).
 *
 * The working-memory write-back settles the summary against what checked
 * answers found (memory-fact-check.ts). The current answer's check is computed
 * here and stored with the message, but the write-back can run before that
 * write lands, so it is handed the check itself. The post-processing-project
 * harness.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  // settleActionBlocks (P0-12 residual): the reply as written, nothing proposed.
  guidance: vi.fn(async (reply: string) => ({ answer: reply, proposals: [] as unknown[] })),
  commands: vi.fn(async () => ({ executed: [], cleanedText: '' })),
  memory: vi.fn(async () => undefined),
  rim: vi.fn(() => undefined),
  provenance: vi.fn(async () => undefined),
  reliability: vi.fn(async () => null),
  anchor: vi.fn(async (): Promise<number | null> => 42),
}));
vi.mock('../../../services/chat-thread-helpers.js', () => ({ saveChatMessage: async () => 41 }));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: h.provenance }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: h.memory }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: h.reliability }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: h.rim }));
vi.mock('../../../services/ana-guidance-executor.js', () => ({ settleActionBlocks: h.guidance }));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({ processCommandsInResponse: h.commands }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ saved: false }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {}, db: { tag: 'shared-db' } }));
vi.mock('../../../services/c2c/program-project-anchor.js', () => ({ resolveProgramProjectAnchor: h.anchor }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';

function ctx(): StreamPostProcessingContext {
  return {
    res: { write: () => true, end: () => undefined, writableEnded: false } as any,
    fullContent: 'In NCT01234567 the ORR was 45% across 212 patients.',
    persistenceFailed: false,
    streamProjectId: '42',
    orgId: 61,
    userId: 7,
    threadId: 'th_1',
    userName: 'Rita',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [],
    toolEvidenceCorpus: [
      { source: 'tool:search_clinical_evidence', content: JSON.stringify({ studies: [{ nctId: 'NCT01234567', orr: '31%', enrolled: 212 }] }) },
    ],
    collectedProvenance: [],
    collectedDrafts: [],
    messages: [{ role: 'user', content: 'What did the pivotal study show?' }],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
  } as StreamPostProcessingContext;
}

beforeEach(() => h.memory.mockClear());

describe("the write-back is handed the turn's answer check", () => {
  it('the same check the message is stored with: what it found and what it did not', async () => {
    await runStreamPostProcessing(ctx());
    await new Promise((r) => setTimeout(r, 0));
    const handed = (h.memory.mock.calls[0] as any)?.[0];
    expect(handed?.answerCheck).toMatchObject({ engine: 'answer-check/2', claims: 3, found: 2, notFound: [{ kind: 'figure', text: '45%' }] });
    expect(handed?.messages.at(-1)).toEqual({ role: 'assistant', content: 'In NCT01234567 the ORR was 45% across 212 patients.' });
  });
});
