/**
 * The stream tells the client, the conversation and the record why a turn
 * stopped.
 *
 * WHAT WENT WRONG
 * `runAgenticToolLoop` returns why it stopped, and stream.ts kept it only for
 * `endRun`: the `done` frame did not carry it, the assistant message's metadata
 * did not store it, and the turn record did not mention it. A turn the round
 * cap cut short therefore reached the person as an ordinary answer, and was
 * handed to the next turn as settled work.
 *
 * WHAT IS PINNED
 *   1. Behavioural — post-processing stores the reason and the rounds on the
 *      assistant message it saves (the conversation's copy, which the next
 *      turn and a reopened thread read).
 *   2. Carriage — stream.ts puts the loop's reason and rounds on the `done`
 *      frame, hands them to post-processing, records a warning on the turn
 *      record, and adds the stopped-turn note beside the trace note. Driving
 *      the whole SSE route (auth, org context, gateway, tool registry) to see
 *      one field would test the mocks; the route harness extraction that makes
 *      that affordable is a later slice's. The regexes are anchored to the one
 *      site each fact must appear at, and each was seen red against the
 *      unchanged file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => ({ metadata: [] as unknown[], rows: [] as Array<{ role: unknown; content: unknown }> }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  // (threadId, role, content, _, _, metadata) — the metadata is the sixth.
  saveChatMessage: async (...args: unknown[]) => {
    saved.metadata.push(args[5]);
    saved.rows.push({ role: args[1], content: args[2] });
    return 41;
  },
}));
vi.mock('../../../services/evidence/persist-provenance.js', () => ({ persistProvenance: async () => undefined }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: async () => undefined }));
vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getCachedSignalReliability: async () => null }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => undefined }));
vi.mock('../../../services/ana-guidance-executor.js', () => ({ processResponseActions: async () => ({ actions: [], cleanedContent: '' }) }));
vi.mock('../../../services/ana/artifactVersionStore.js', () => ({ upsertDocumentArtifactVersion: async () => ({ saved: false }) }));
vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {} }));

import { persistStoppedAnswer, runStreamPostProcessing, type StreamPostProcessingContext } from '../post-processing';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function ctx(over: Partial<StreamPostProcessingContext> = {}): StreamPostProcessingContext {
  return {
    res: { write: () => true, end: () => undefined, writableEnded: false } as any,
    fullContent: 'Partial comparison of the endpoints.',
    persistenceFailed: false,
    streamProjectId: undefined,
    orgId: 61,
    userId: 7,
    threadId: 'th_1',
    userName: 'Rita',
    effectiveRole: 'regulatory_lead' as any,
    sectionCode: undefined,
    toolTrace: [{ tool: 'search_documents', label: 'Searching your documents', status: 'success', resultSummary: '4 results' }],
    toolEvidenceCorpus: [],
    collectedProvenance: [],
    collectedDrafts: [],
    messages: [],
    model: 'm',
    provider: 'anthropic',
    enrichment: { sources: [] },
    ...over,
  };
}

beforeEach(() => {
  saved.metadata = [];
  saved.rows = [];
});

describe('post-processing stores how the turn ended — behavioural', () => {
  // The first call pays post-processing's cold imports (about 5 s alone, past
  // the 10 s default on a loaded machine). Timed out, it went on to save into
  // the NEXT case's capture and turned that one red too (S4 evidence, review
  // objection 35), so it gets room rather than a warm-up that hides the cost.
  it('a round-limit stop and its rounds reach the saved assistant message', async () => {
    await runStreamPostProcessing(ctx({ stoppedReason: 'max_rounds', rounds: 12 }));
    expect(saved.metadata).toHaveLength(1);
    expect(saved.metadata[0]).toMatchObject({ stoppedReason: 'max_rounds', rounds: 12 });
  }, 60_000);

  it('a run-policy turn stores its policy, the steps it did not run and her own holds (S4)', async () => {
    const hold = { round: 2, reason: 'manual' as const, next: ['Searching the literature'], outcome: 'expired' as const, at: '2026-09-28T10:00:00.000Z' };
    await runStreamPostProcessing(
      ctx({ stoppedReason: 'hold_expired', rounds: 1, runPolicy: 'manual', pendingSteps: ['Searching the literature'], policyHolds: [hold] }),
    );
    expect(saved.metadata[0]).toMatchObject({
      stoppedReason: 'hold_expired',
      rounds: 1,
      runPolicy: 'manual',
      pendingSteps: ['Searching the literature'],
      policyHolds: [hold],
    });
  });

  it('an answer that was cut off is stored as one', async () => {
    await runStreamPostProcessing(ctx({ stoppedReason: 'answer_cut_off', rounds: 1 }));
    expect(saved.metadata[0]).toMatchObject({ stoppedReason: 'answer_cut_off', rounds: 1 });
  });

  it('a turn she finished stores its rounds and no reason', async () => {
    await runStreamPostProcessing(ctx({ stoppedReason: 'no_more_tools', rounds: 2 }));
    const meta = saved.metadata[0] as Record<string, unknown>;
    expect(meta.rounds).toBe(2);
    expect('stoppedReason' in meta).toBe(false);
  });

  /* QA 2026-10-08 (j5, "Stop leaves the question with no answer"): an answer
     was saved only when there was text, so a turn stopped before AnA wrote a
     word left the question alone in the conversation, and a reload showed it
     with nothing after it. The stop is saved as what it is: an empty answer
     that says it was stopped. */
  it('a turn the person stopped before any text is saved as a stopped, empty answer', async () => {
    await runStreamPostProcessing(ctx({ fullContent: '', toolTrace: [], stopped: true, stoppedReason: 'cancelled', rounds: 1 }));
    expect(saved.rows).toEqual([{ role: 'assistant', content: '' }]);
    expect(saved.metadata[0]).toMatchObject({ stoppedReason: 'cancelled' });
  });

  it('a stopped turn whose loop reported no reason is still saved as stopped', async () => {
    await runStreamPostProcessing(ctx({ fullContent: 'Three risks stand out.', stopped: true, stoppedReason: 'no_more_tools' }));
    expect(saved.rows).toEqual([{ role: 'assistant', content: 'Three risks stand out.' }]);
    expect(saved.metadata[0]).toMatchObject({ stoppedReason: 'cancelled' });
  });

  it('a turn with no text that was not stopped still saves nothing', async () => {
    await runStreamPostProcessing(ctx({ fullContent: '', toolTrace: [], stopped: false }));
    expect(saved.rows).toEqual([]);
  });

  it('a stop that ended the turn in the error path saves what was streamed, as stopped', async () => {
    await expect(persistStoppedAnswer('th_1', 'Three risks stand out. First,')).resolves.toBe(41);
    expect(saved.rows).toEqual([{ role: 'assistant', content: 'Three risks stand out. First,' }]);
    expect(saved.metadata[0]).toEqual({ stoppedReason: 'cancelled' });
  });
});

describe('stream.ts carries the loop outcome — carriage', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'server/routes/ana-ri/stream.ts'), 'utf8');

  it('keeps the loop rounds beside its reason', () => {
    expect(src).toMatch(/let loopRounds = 0;/);
    expect(src).toMatch(/loopRounds = loopResult\.rounds;/);
  });

  it("the turn's done frame carries stoppedReason, rounds and the run policy", () => {
    // The main done frame — the one that carries the model — not the
    // intelligence fast path's, which runs no loop.
    const m = src.match(/type: 'done',\s*\n\s*model: gwResponse\.model,[\s\S]{0,2500}?\}\)\}\\n\\n`/);
    expect(m, 'main done frame not found').not.toBeNull();
    expect(m![0]).toMatch(/stoppedReason: loopStoppedReason,/);
    expect(m![0]).toMatch(/rounds: loopRounds,/);
    // S4 (row 74) fills the policy: the parsed run_policy, null when none was
    // sent (stream-run-policy.test.ts drives both through the route).
    expect(m![0]).toMatch(/runPolicy,/);
  });

  it('hands both to post-processing', () => {
    const call = src.slice(src.indexOf('void runStreamPostProcessing({'));
    const body = call.slice(0, call.indexOf('});'));
    expect(body).toMatch(/stoppedReason: loopStoppedReason,/);
    expect(body).toMatch(/rounds: loopRounds,/);
  });

  it('a Stop that aborts the model call saves the stopped answer before the record is filed', () => {
    const at = src.indexOf('const stoppedByPerson = Boolean(runHandle?.cancelSignal.aborted);');
    expect(at, 'the error path no longer tells a stop from a failure').toBeGreaterThan(-1);
    const path = src.slice(at, src.indexOf("await fileTurnRecord(stoppedByPerson ? 'stopped' : 'failed')", at));
    expect(path).toMatch(/if \(stoppedByPerson && stoppedTurnThreadId\) \{/);
    expect(path).toMatch(/await persistStoppedAnswer\(stoppedTurnThreadId, turnRecorder\?\.streamedText \?\? ''\)/);
    // The thread it saves into is the one the turn resolved and saved its question in.
    expect(src).toMatch(/turnRecorder\?\.setMessageIds\(\{ user: userMessageId \}\);\s*\n\s*stoppedTurnThreadId = threadId;/);
  });

  it('records a warning on the turn record when the loop did not end by her choice', () => {
    expect(src).toMatch(/if \(loopStoppedReason !== 'no_more_tools'\) \{\s*\n\s*turnRecorder\?\.warn\(/);
  });

  it('adds the stopped-turn note beside the trace note, from the same history', () => {
    const at = src.indexOf('const traceNote = formatTraceForContext(traces);');
    expect(at).toBeGreaterThan(-1);
    const near = src.slice(at, at + 800);
    expect(near).toMatch(/const stoppedNote = formatStoppedTurnNote\(previousMsgs\);/);
    // Pushed as a system message, after the trace note it qualifies.
    expect(near).toMatch(/messages\.push\(\s*\.\.\.\[traceNote, stoppedNote\]\.filter\(Boolean\)\.map\(\(content\) => \(\{ role: 'system' as const, content \}\)\)/);
  });

  // The last model call wrote the answer the person reads. If it was cut off,
  // the turn ended short however the loop ended — and the frame, the record
  // and the saved message must all read that, so it is decided before them.
  it('decides a cut-off answer from the last call, before anything reads the reason', () => {
    expect(src).toMatch(/lastFinishReason = gwResponse\.finishReason;/);
    expect(src).toMatch(/lastFinishReason = roundResponse\.finishReason;/);
    const decided = src.indexOf('loopStoppedReason = turnEndingReason(loopStoppedReason, lastFinishReason);');
    expect(decided, 'the turn ending is never decided').toBeGreaterThan(-1);
    expect(decided).toBeGreaterThan(src.indexOf('loopStoppedReason = loopResult.stoppedReason;'));
    expect(decided).toBeLessThan(src.search(/type: 'done',\s*\n\s*model: gwResponse\.model,/));
    expect(decided).toBeLessThan(src.indexOf("if (loopStoppedReason !== 'no_more_tools') {"));
  });
});
