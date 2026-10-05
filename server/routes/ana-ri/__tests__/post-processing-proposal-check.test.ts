/**
 * A proposal made at the end of a turn carries the check of its prose too
 * (GRD-2 / FIG-3, AnA reasoning round 3, 2026-10-05).
 *
 * Besides the held path (stream.ts awaitDecision), a proposal reaches the
 * sign-off dialog at the end of a turn: an ana-action block or a command
 * becomes a HUMAN_CONFIRMATION_REQUIRED envelope in `post_done`'s
 * executedCommands. The draft in it is checked against what AnA consulted, the
 * same way, so the dialog shows the same check whichever way it opened.
 * The post-processing-answer-check.test.ts harness, with the command
 * partition replaced at its seam.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const saved = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  saveChatMessage: async (...args: any[]) => {
    saved.calls.push(args);
    return 41;
  },
}));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: async () => undefined }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: async () => undefined }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => undefined }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ saved: false }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {} }));
// An end-of-turn proposal, as the command partition returns one: a write only
// a person may take, with the prose AnA wrote for it in its params.
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  processCommandsInResponse: async (text: string) => ({
    cleanedText: text,
    executedCommands: [
      {
        success: false,
        action: 'create_artifact',
        error: 'HUMAN_CONFIRMATION_REQUIRED',
        message: 'This action changes the record, so it is taken by a person rather than on your behalf.',
        openModal: 'esign',
        data: {
          tier: 'confirm',
          reasonRequired: false,
          signatureRequired: false,
          proposedByAgent: true,
          retry: {
            command: 'create_artifact',
            params: { title: 'Clinical overview', content: 'In NCT01234567 the ORR was 47% in 212 patients; 31% had grade 3 events.' },
          },
        },
      },
      { success: true, action: 'list_projects' },
      // A failure that could be retried carries the call, but is put to no one.
      {
        success: false,
        action: 'create_artifact',
        error: 'COMMAND_FAILED',
        message: 'The artifact store did not answer.',
        data: { retry: { command: 'create_artifact', params: { content: 'The ORR was 31%.' } } },
      },
    ],
  }),
}));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';
import { TurnRecorder } from '../../../services/ana/turn-record';
import { ANSWER_CHECK_VERSION, toolEvidence } from '../../../services/ana/answer-grounding';

// Long enough for the label check to assess it (over 200 characters).
const ANSWER =
  'In NCT01234567 the ORR was 47% in 212 patients [KNOWN: registry]. The comparator study NCT09999999 ' +
  'reported 31% [INFERRED: indirect]. The design and conduct of both studies are described in their ' +
  'protocols and amendments. The submission is ready to file.';

function run(over: Partial<StreamPostProcessingContext> = {}) {
  const events: any[] = [];
  const res = {
    write: (chunk: string) => {
      for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
      return true;
    },
    end: () => undefined,
    writableEnded: false,
  } as any;
  const recorder = new TurnRecorder();
  recorder.setTurn({ organizationId: 61, threadId: 'th_1', actorUserId: 7 });
  recorder.setRequest('Summarise the pivotal study.');
  const sealedAtFiling: any[] = [];
  const fileTurnRecord = vi.fn(async (outcome: 'answered' | 'stopped' | 'failed') => {
    sealedAtFiling.push(recorder.seal(outcome).body);
    return { status: 'recorded' as const, id: 'rec-1', sha256: 'a'.repeat(64) };
  });
  // As the registry search returns a hit: the request echoed, the record in a list.
  const entry = toolEvidence('search_clinical_evidence', {
    status: 'success',
    input: { query: 'NCT01234567' },
    content: '{"query":"NCT01234567","resultCount":1,"studies":[{"nctId":"NCT01234567","orr":"47%","enrolled":212}]}',
    generated: { calls: 0, texts: [], overflow: false },
  })!;
  const c: StreamPostProcessingContext = {
    res,
    fullContent: ANSWER,
    persistenceFailed: false,
    streamProjectId: undefined,
    orgId: 61,
    userId: 7,
    threadId: 'th_1',
    userName: 'Rita',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [],
    humanControls: [],
    toolEvidenceCorpus: [entry, { source: 'person', content: 'Summarise the pivotal study.' }],
    collectedProvenance: [],
    collectedDrafts: [],
    messages: [],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
    turnRecorder: recorder,
    fileTurnRecord,
    ...over,
  };
  return { c, events, sealedAtFiling };
}

beforeEach(() => {
  saved.calls = [];
});

describe('an end-of-turn proposal carries the check of its prose', () => {
  it('post_done names what the proposed draft states that this turn\'s sources do not hold', async () => {
    const { c, events } = run();
    await runStreamPostProcessing(c);
    const done = events.find((e) => e.type === 'post_done');
    const proposal = done.executedCommands.find((r: any) => r.error === 'HUMAN_CONFIRMATION_REQUIRED');
    expect(proposal.check.engine).toBe(ANSWER_CHECK_VERSION);
    expect(proposal.check.found).toBe(3);
    expect(proposal.check.notFound.map((n: any) => n.text)).toEqual(['31%']);
  });

  it('a result that is not put to a person carries no check', async () => {
    const { c, events } = run();
    await runStreamPostProcessing(c);
    const done = events.find((e) => e.type === 'post_done');
    expect(done.executedCommands.find((r: any) => r.action === 'list_projects').check).toBeUndefined();
    expect(done.executedCommands.find((r: any) => r.error === 'COMMAND_FAILED').check).toBeUndefined();
  });
});
