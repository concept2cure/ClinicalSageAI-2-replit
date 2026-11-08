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
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const saved = vi.hoisted(() => ({ nextId: 41, fail: false }));
const pipeline = vi.hoisted(() => ({ save: vi.fn(), owner: vi.fn(), provenance: vi.fn(), memory: vi.fn(),
  rim: vi.fn(), settle: vi.fn(), artifact: vi.fn(), commands: vi.fn() }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  saveChatMessage: pipeline.save,
  assertOwnerPrivateThreadCurrent: pipeline.owner,
}));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: pipeline.provenance }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: pipeline.memory }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: pipeline.rim }));
vi.mock('../../../services/ana-guidance-executor.js', () => ({ settleActionBlocks: pipeline.settle, blocksOnlyAnswer: () => '' }));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({ processCommandsInResponse: pipeline.commands }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: pipeline.artifact }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {} }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';
import { TurnRecorder } from '../../../services/ana/turn-record';
import type { TurnRecordStatus } from '../../../services/ana/turn-record';

function fakeRes() {
  const events: any[] = [];
  return {
    events,
    res: {
      write: (chunk: string) => {
        for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
        return true;
      },
      end: vi.fn(),
      locals: {},
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
  vi.clearAllMocks();
  saved.nextId = 41;
  saved.fail = false;
  pipeline.save.mockReset().mockImplementation(async () => { if (saved.fail) throw new Error('db down'); return saved.nextId; });
  pipeline.owner.mockReset().mockResolvedValue(undefined);
  pipeline.settle.mockReset().mockImplementation(async (answer: string) => ({ answer, proposals: [] }));
  pipeline.commands.mockReset().mockImplementation(async (cleanedText: string) => ({ cleanedText, executedCommands: [] }));
  pipeline.artifact.mockReset().mockResolvedValue({ saved: false });
});
afterEach(() => { vi.restoreAllMocks(); });

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

const PRIVATE_CANARY = 'OWNER_PRIVATE_CANARY: invented personal source that must remain inside owner capture.';
function privateCtx(over: Partial<StreamPostProcessingContext> = {}) {
  const release = vi.fn();
  const fixture = ctx({ runId: 'test-private-run', fullContent: PRIVATE_CANARY, releasePrivateOutput: release, ...over });
  fixture.c.res.locals.ownerPrivateCapture = true;
  return { ...fixture, release };
}
function deferred<T>() {
  const control: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>(resolve => { control.resolve = resolve; });
  return { promise, resolve(value: T) { if (!control.resolve) throw new Error('Fixture gate unavailable'); control.resolve(value); } };
}
function expectNoPublicSideChannels() {
  for (const spy of [pipeline.provenance, pipeline.memory, pipeline.rim, pipeline.settle, pipeline.artifact, pipeline.commands]) {
    expect(spy).not.toHaveBeenCalled();
  }
}
async function expectPrivateRefusal(fixture: ReturnType<typeof privateCtx>) {
  const logs = [vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')];
  await runStreamPostProcessing(fixture.c);
  expect(fixture.release).not.toHaveBeenCalled();
  expect(fixture.events).toEqual([{ type: 'error', code: 'OWNER_PRIVATE_CAPTURE_UNAVAILABLE',
    message: 'The private answer could not be securely recorded. No answer was released.' }]);
  expect(JSON.stringify(fixture.events)).not.toContain(PRIVATE_CANARY);
  expect(JSON.stringify(logs.flatMap(spy => spy.mock.calls))).not.toContain(PRIVATE_CANARY);
  expect(fixture.c.res.end).toHaveBeenCalledOnce(); expectNoPublicSideChannels();
}

describe('owner-private stream release wiring (deterministic service harness, no provider execution)', () => {
  it('awaits the encrypted capture seam, recorded turn, and fresh owner before releasing any buffered output', async () => {
    const message = deferred<number>(), record = deferred<TurnRecordStatus>(), authority = deferred<void>();
    pipeline.save.mockReturnValueOnce(message.promise); pipeline.owner.mockReturnValueOnce(authority.promise);
    const file = vi.fn(() => record.promise);
    const fixture = privateCtx({ fileTurnRecord: file });
    const pending = runStreamPostProcessing(fixture.c);
    await vi.waitFor(() => expect(pipeline.save).toHaveBeenCalledOnce());
    expect(pipeline.save.mock.calls[0]).toEqual(['th_1', 'assistant', PRIVATE_CANARY, undefined, undefined,
      expect.any(Object), { requireOwnerPrivate: true, runId: 'test-private-run', intentId: 'assistant-final' }]);
    expect(file).not.toHaveBeenCalled(); expect(fixture.release).not.toHaveBeenCalled();
    message.resolve(41); await vi.waitFor(() => expect(file).toHaveBeenCalledWith('answered'));
    expect(pipeline.owner).not.toHaveBeenCalled(); expect(fixture.release).not.toHaveBeenCalled();
    record.resolve({ status: 'recorded', id: 'private-rec', sha256: 'a'.repeat(64) });
    await vi.waitFor(() => expect(pipeline.owner).toHaveBeenCalledWith('th_1'));
    expect(fixture.release).not.toHaveBeenCalled(); expect(fixture.events).toEqual([]);
    authority.resolve(); await pending;
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(fixture.events).toEqual([expect.objectContaining({ type: 'post_done', cleanedResponse: PRIVATE_CANARY,
      turnRecord: { status: 'recorded', id: 'private-rec', sha256: 'a'.repeat(64) } })]);
    expect(fixture.recorder.seal('answered').body.turn.assistantMessageId).toBe(41);
    expectNoPublicSideChannels();
  });

  it.each(['persistence', 'thread', 'run', 'recorder', 'recordWriter', 'release'] as const)('refuses missing %s custody without a legacy fallback', async missing => {
    const absent = { persistence: { persistenceFailed: true }, thread: { threadId: undefined }, recorder: { turnRecorder: null },
      run: { runId: undefined }, recordWriter: { fileTurnRecord: undefined }, release: { releasePrivateOutput: undefined } }[missing];
    const fixture = privateCtx(absent);
    await expectPrivateRefusal(fixture); expect(pipeline.save).not.toHaveBeenCalled();
  });

  it.each(['save_error', 'missing_id', 'record_error', 'not_recorded', 'owner_revoked'] as const)('contains %s and releases neither answer nor error canary', async failure => {
    const file = vi.fn(async (): Promise<TurnRecordStatus> => ({ status: 'recorded', id: 'private-rec', sha256: 'b'.repeat(64) }));
    if (failure === 'save_error') pipeline.save.mockRejectedValueOnce(new Error(PRIVATE_CANARY));
    if (failure === 'missing_id') pipeline.save.mockResolvedValueOnce(0);
    if (failure === 'record_error') file.mockRejectedValueOnce(new Error(PRIVATE_CANARY));
    if (failure === 'not_recorded') file.mockResolvedValueOnce({ status: 'not_recorded', reason: PRIVATE_CANARY });
    if (failure === 'owner_revoked') pipeline.owner.mockRejectedValueOnce(new Error(PRIVATE_CANARY));
    const fixture = privateCtx({ fileTurnRecord: file });
    await expectPrivateRefusal(fixture);
    expect(pipeline.save).toHaveBeenCalledOnce();
    if (['save_error', 'missing_id'].includes(failure)) expect(file).not.toHaveBeenCalled();
    else expect(file).toHaveBeenCalledOnce();
    expect(pipeline.owner).toHaveBeenCalledTimes(failure === 'owner_revoked' ? 1 : 0);
  });

  it('records a genuinely stopped private turn before its authorized release', async () => {
    const fixture = privateCtx({ stopped: true }); await runStreamPostProcessing(fixture.c);
    expect(fixture.filed).toEqual(['stopped']); expect(fixture.release).toHaveBeenCalledOnce();
    expect(pipeline.owner).toHaveBeenCalledOnce(); expectNoPublicSideChannels();
  });
});
