/**
 * The stream's post-processing files the turn record, after the answer is
 * stored and before `post_done`, and tells the client the outcome.
 *
 * The live run (docs/evidence/D5-ANA-RECORD/2026-09-26/live) shows this on a
 * real server; this pins the wiring so a refactor of post-processing cannot
 * quietly stop recording turns:
 *   - the record gets the stored answer, its message id, the controls, the
 *     drafts and actions, and is filed with outcome answered — or stopped;
 *   - `post_done` carries what filing returned;
 *   - a post-processing failure still files the turn, once.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const saved = vi.hoisted(() => ({ nextId: 41, fail: false }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  saveChatMessage: async () => {
    if (saved.fail) throw new Error('db down');
    return saved.nextId;
  },
}));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: async () => undefined }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: async () => undefined }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => undefined }));
vi.mock('../../../services/ana-guidance-executor.js', () => ({ processResponseActions: async () => ({ actions: [], cleanedContent: '' }) }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ saved: false }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {} }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';
import { TurnRecorder } from '../../../services/ana/turn-record';

function fakeRes() {
  const events: any[] = [];
  return {
    events,
    res: {
      write: (chunk: string) => {
        for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
        return true;
      },
      end: () => undefined,
      writableEnded: false,
    } as any,
  };
}

function ctx(over: Partial<StreamPostProcessingContext> = {}) {
  const { res, events } = fakeRes();
  const recorder = new TurnRecorder();
  recorder.setTurn({ organizationId: 61, threadId: 'th_1', actorUserId: 7 });
  recorder.setRequest('What is the primary endpoint?');
  const filed: string[] = [];
  const fileTurnRecord = vi.fn(async (outcome: 'answered' | 'stopped' | 'failed') => {
    filed.push(outcome);
    return { status: 'recorded' as const, id: 'rec-1', sha256: 'a'.repeat(64) };
  });
  const c: StreamPostProcessingContext = {
    res,
    fullContent: 'PFS at 12 months.',
    persistenceFailed: false,
    streamProjectId: undefined,
    orgId: 61,
    userId: 7,
    threadId: 'th_1',
    userName: 'Rita',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [],
    humanControls: [{ action: 'pause', at: '2026-09-26T00:00:00Z', byUserId: 7, round: 1 } as any],
    toolEvidenceCorpus: [],
    collectedProvenance: [],
    collectedDrafts: [{ title: 'Endpoint summary', content: '<p>PFS</p>', authoringDocId: 'doc-1' }],
    messages: [],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
    turnRecorder: recorder,
    fileTurnRecord,
    ...over,
  };
  return { c, events, recorder, filed, fileTurnRecord };
}

beforeEach(() => {
  saved.nextId = 41;
  saved.fail = false;
});

describe('post-processing files the turn record', () => {
  it('with the stored answer, its message id, the controls and the drafts, as answered', async () => {
    const { c, events, recorder, filed } = ctx();
    await runStreamPostProcessing(c);
    expect(filed).toEqual(['answered']);
    const body = recorder.seal('answered').body;
    expect(body.turn.assistantMessageId).toBe(41);
    expect(body.answer.stored).not.toBeNull();
    expect(body.controls).toEqual([{ action: 'pause', at: '2026-09-26T00:00:00Z', byUserId: 7, round: 1 }]);
    expect(body.outputs.drafts.map((d) => [d.title, d.authoringDocId])).toEqual([['Endpoint summary', 'doc-1']]);
    const done = events.find((e) => e.type === 'post_done');
    expect(done.turnRecord).toEqual({ status: 'recorded', id: 'rec-1', sha256: 'a'.repeat(64) });
  });

  it('as stopped when the person pressed Stop', async () => {
    const { c, filed } = ctx({ stopped: true });
    await runStreamPostProcessing(c);
    expect(filed).toEqual(['stopped']);
  });

  it('says in the record when the conversation could not save the answer', async () => {
    saved.fail = true;
    const { c, recorder } = ctx();
    await runStreamPostProcessing(c);
    const body = recorder.seal('answered').body;
    expect(body.turn.assistantMessageId).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/could not save this turn/);
  });

  it('does not file the turn twice when post-processing fails after filing it', async () => {
    const { c, events, filed } = ctx();
    const realWrite = c.res.write;
    let thrown = false;
    c.res.write = (chunk: string) => {
      if (!thrown && String(chunk).includes('"type":"post_done"')) {
        thrown = true;
        throw new Error('socket hiccup');
      }
      return realWrite(chunk);
    };
    await runStreamPostProcessing(c);
    expect(thrown).toBe(true);
    expect(filed).toEqual(['answered']);
    // The fallback post_done still says the turn was recorded.
    expect(events.filter((e) => e.type === 'post_done').at(-1)?.turnRecord?.status).toBe('recorded');
  });

  it('still files the turn when post-processing fails before filing it', async () => {
    // The working-memory write-back reads `messages`; a broken one throws
    // before the record is filed.
    const { c, events, filed, recorder } = ctx({ messages: null as any });
    await runStreamPostProcessing(c);
    expect(filed).toEqual(['answered']);
    expect(recorder.seal('answered').body.warnings.join(' ')).toMatch(/Post-processing did not finish/);
    expect(events.filter((e) => e.type === 'post_done').at(-1)?.turnRecord?.status).toBe('recorded');
  });
});
