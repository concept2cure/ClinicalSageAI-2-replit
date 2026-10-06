/** The actual command parser/dispatcher and postprocessor must retain an empty cleaned answer. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

const io = vi.hoisted(() => ({
  save: vi.fn<(...args: unknown[]) => Promise<number>>(),
  memory: vi.fn<(...args: unknown[]) => Promise<void>>(),
  hasRole: vi.fn(async () => true),
  governed: vi.fn(async () => { throw new Error('No governed write expected'); }),
  connect: vi.fn(async () => { throw new Error('No write transaction expected'); }),
}));
vi.mock('../../../services/chat-thread-helpers.js', () => ({ saveChatMessage: io.save }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: io.memory }));
vi.mock('../../../services/roleBasedAccess', () => ({ default: { hasRole: io.hasRole, getUserRoles: async () => [] } }));
vi.mock('../../../services/governed-ana-execution.js', () => ({ executeGovernedAnaOperation: io.governed }));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: async () => undefined }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => undefined }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ created: false }) }));
const pool = vi.hoisted(() => ({
  // Settings reads succeed with no extra restriction; project listing is empty.
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: io.connect,
}));
vi.mock('../../../db', () => ({ db: {}, pool, getPool: () => pool, getDb: () => ({}) }));

import { runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';
import { TurnRecorder } from '../../../services/ana/turn-record';
import { verifyTurnAnswer } from '../../../services/ana/turn-verification';

type Frame = { type: string; cleanedResponse?: string; executedCommands?: Array<Record<string, any>>; check?: unknown };
const block = (command: string, params: Record<string, unknown> = {}) =>
  '```command\n' + JSON.stringify({ command, params }) + '\n```';
const TASK = block('create_task', { title: 'Review risk' });

async function run(fullContent: string) {
  const events: Frame[] = [];
  const recorder = new TurnRecorder();
  recorder.setTurn({ organizationId: 61, threadId: 'command-only', actorUserId: 7 });
  recorder.setRequest('Review risk.');
  recorder.setAnswer({ streamed: fullContent });
  const sealed: Array<ReturnType<TurnRecorder['seal']>> = [];
  const res = {
    write: (chunk: string) => {
      for (const line of chunk.split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
      return true;
    },
    end: vi.fn(),
  } as unknown as Response;
  const ctx: StreamPostProcessingContext = {
    res, fullContent, persistenceFailed: false, streamProjectId: undefined,
    orgId: 61, userId: 7, threadId: 'command-only', userName: 'Rita',
    effectiveRole: 'ra_lead', sectionCode: undefined,
    toolTrace: [], toolEvidenceCorpus: [], collectedProvenance: [], collectedDrafts: [],
    messages: [], model: 'm', provider: 'anthropic', enrichment: { sources: [] },
    turnRecorder: recorder,
    fileTurnRecord: async outcome => {
      sealed.push(recorder.seal(outcome));
      return { status: 'recorded', id: 'rec-1', sha256: 'a'.repeat(64) };
    },
  };
  await runStreamPostProcessing(ctx);
  const done = events.find(event => event.type === 'post_done');
  if (!done) throw new Error('Expected the stream to finish with post_done');
  return { done, events, sealed, res };
}

function expectConsistentAnswer(result: Awaited<ReturnType<typeof run>>, expected: string, raw: string) {
  expect(result.done.cleanedResponse).toBe(expected);
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(io.save.mock.calls[0][2]).toBe(expected);
  expect(result.sealed).toHaveLength(1);
  const record = result.sealed[0];
  expect(record.blobs.get(record.body.answer.stored?.sha256 ?? '')).toBe(expected);
  expect(record.blobs.get(record.body.answer.streamed?.sha256 ?? '')).toBe(raw);
  const verification = verifyTurnAnswer(expected, []);
  expect(result.done.check).toEqual(verification.check);
  expect(record.body.verification).toEqual(verification);
  expect(io.save.mock.calls[0][5]).toMatchObject({ verification });
  expect(io.memory.mock.calls[0][0]).toMatchObject({ messages: [{ role: 'assistant', content: expected }] });
  expect(io.governed).not.toHaveBeenCalled();
  expect(io.connect).not.toHaveBeenCalled();
  expect(result.res.end).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  io.save.mockResolvedValue(41);
  io.memory.mockResolvedValue(undefined);
  io.hasRole.mockResolvedValue(true);
});

describe('command-only answers describe the real dispatch outcome', () => {
  it('explains pending confirmation while retaining the proposal and making no write', async () => {
    const result = await run(TASK);
    expect(result.done.executedCommands).toMatchObject([
      { success: false, error: 'HUMAN_CONFIRMATION_REQUIRED', data: { retry: { command: 'create_task' } } },
    ]);
    expectConsistentAnswer(result,
      'AnA proposed an action. Nothing has changed yet: review it below and confirm it to proceed.', TASK);
  });

  it('explains a refused command with its actual permission reason', async () => {
    io.hasRole.mockResolvedValue(false);
    const result = await run(TASK);
    const refusal = result.done.executedCommands?.[0];
    expect(refusal).toMatchObject({ success: false, action: 'create_task', error: 'RBAC_DENIED' });
    expect(refusal?.message).toContain('You do not have permission');
    expectConsistentAnswer(result, `Nothing was changed. ${refusal?.message}`, TASK);
  });

  it('reports success only when the read command actually succeeded', async () => {
    const raw = block('list_projects');
    const result = await run(raw);
    expect(result.done.executedCommands).toMatchObject([{ success: true, action: 'list_projects' }]);
    expectConsistentAnswer(result, 'Action executed successfully.', raw);
  });
});

describe('command cleanup preserves ordinary answer prose', () => {
  it('keeps the prose around a command and still carries its pending signoff', async () => {
    const prose = 'I can add a task to review the risk summary.';
    const raw = `${prose}\n\n${TASK}`;
    const result = await run(raw);
    expect(result.done.executedCommands?.[0].error).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expectConsistentAnswer(result, prose, raw);
  });

  it('keeps a plain answer with no commands unchanged', async () => {
    const prose = 'The next step is to review the risk summary.';
    const result = await run(prose);
    expect(result.done.executedCommands).toBeUndefined();
    expectConsistentAnswer(result, prose, prose);
  });
});
