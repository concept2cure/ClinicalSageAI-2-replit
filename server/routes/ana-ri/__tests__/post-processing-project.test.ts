/**
 * Post-processing acts on the turn's OWN project: one resolution, used by
 * every step that names a project (PF-10 S6a).
 *
 * runStreamPostProcessing coerced the stream's project at each step:
 * Number.parseInt('7abb1c22-…', 10) is 7, a valid, wrong project of the same
 * organization. So for a v2 program whose UUID began with digits:
 *   - the guidance executor auto-created artifacts under project 7;
 *   - the command executor ran AnA's commands (create task, artifact) with
 *     project 7 active;
 * and Number(uuid) gave NaN or null to the working memory, the RIM signal,
 * the provenance trail and the reliability read, so a v2 project never had
 * them. Now the project is resolved once: an integer as itself, a program
 * UUID through its anchor row, anything else as no project.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  guidance: vi.fn(async () => ({ actions: [], cleanedText: '' })),
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
vi.mock('../../../services/ana-guidance-executor.js', () => ({ processResponseActions: h.guidance }));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({ processCommandsInResponse: h.commands }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ saved: false }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {}, db: { tag: 'shared-db' } }));
vi.mock('../../../services/c2c/program-project-anchor.js', () => ({ resolveProgramProjectAnchor: h.anchor }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';

const DIGITS_FIRST = '7abb1c22-1234-4abc-8def-0123456789ab';

function ctx(streamProjectId: StreamPostProcessingContext['streamProjectId']): StreamPostProcessingContext {
  return {
    res: { write: () => true, end: () => undefined, writableEnded: false } as any,
    fullContent: 'PFS at 12 months.',
    persistenceFailed: false,
    streamProjectId,
    orgId: 61,
    userId: 7,
    threadId: 'th_1',
    userName: 'Rita',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [],
    toolEvidenceCorpus: [],
    collectedProvenance: [{ sourceType: 'x' } as any],
    collectedDrafts: [],
    messages: [],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
  } as StreamPostProcessingContext;
}

/** Every project id each step was handed, in one object. */
async function projectsSeen(streamProjectId: StreamPostProcessingContext['streamProjectId']) {
  await runStreamPostProcessing(ctx(streamProjectId));
  // Fire-and-forget steps settle on the next ticks.
  await new Promise((r) => setTimeout(r, 0));
  return {
    guidance: h.guidance.mock.calls.length ? (h.guidance.mock.calls[0] as any)[1].projectId : 'not called',
    commands: (h.commands.mock.calls[0] as any)?.[1]?.activeProjectId,
    memory: (h.memory.mock.calls[0] as any)?.[0]?.projectId,
    rim: (h.rim.mock.calls[0] as any)?.[0]?.projectId ?? 'not called',
    provenance: (h.provenance.mock.calls[0] as any)?.[1]?.projectId,
    reliability: (h.reliability.mock.calls[0] as any)?.[0] ?? 'not called',
  };
}

beforeEach(() => {
  for (const f of [h.guidance, h.commands, h.memory, h.rim, h.provenance, h.reliability]) f.mockClear();
  h.anchor.mockReset();
  h.anchor.mockResolvedValue(42);
});

describe('which project post-processing acts on', () => {
  it("a program UUID beginning with digits: every step gets its anchor row, never the integer its digits spell", async () => {
    expect(await projectsSeen(DIGITS_FIRST)).toEqual({
      guidance: 42, commands: 42, memory: 42, rim: 42, provenance: 42, reliability: 42,
    });
    expect(h.anchor).toHaveBeenCalledWith({ tag: 'shared-db' }, expect.objectContaining({ programId: DIGITS_FIRST, orgId: 61 }));
  });

  it('a program with no anchor row: no step acts on any project', async () => {
    h.anchor.mockResolvedValue(null);
    expect(await projectsSeen(DIGITS_FIRST)).toEqual({
      // The guidance executor still runs, with no project: it is the one place
      // the ```ana-action blocks are stripped, and it then creates nothing
      // (guidance-executor-no-project.test.ts). Skipping it left the raw block
      // in the saved answer (review wf_2358b437-4c8).
      guidance: null, commands: undefined, memory: null, rim: 'not called', provenance: undefined, reliability: 'not called',
    });
  });

  it('a legacy integer project is itself, without the anchor', async () => {
    expect(await projectsSeen('42')).toEqual({
      guidance: 42, commands: 42, memory: 42, rim: 42, provenance: 42, reliability: 42,
    });
    expect(h.anchor).not.toHaveBeenCalled();
  });

  it('a malformed project is no project', async () => {
    expect(await projectsSeen('7abc')).toMatchObject({ guidance: null, commands: undefined, memory: null });
  });
});
