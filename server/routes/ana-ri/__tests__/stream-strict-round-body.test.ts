/**
 * D2/W2 strict raw result-body limit at the native mounted SSE host.
 * Native dispatch, allocator, framing, recorder/corpus and checkpoint run.
 * The shared harness substitutes handlers, gateway, context/database and durable
 * post-processing. The record writer below seals in memory, not in a database.
 * Explicit override fixtures exercise host boundary checks, not source admission.
 */
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolResultEntry } from '../../../services/ana/agentic-loop.js';
import type { TurnRecorder, TurnOutcome } from '../../../services/ana/turn-record.js';

const seam = vi.hoisted(() => ({
  budgetOverride: null as null | ((entries: ToolResultEntry[]) => ToolResultEntry[]),
  lateGrowth: null as null | 'guard' | 'settlement',
  settlementCalls: 0,
  stageCalls: 0,
  roundInputs: 0,
  recorder: null as TurnRecorder | null,
  filedOutcome: null as TurnOutcome | null,
  sealed: null as ReturnType<TurnRecorder['seal']> | null,
}));
vi.mock('../../../services/ana/agentic-loop.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/agentic-loop.js')>();
  return { ...real, budgetToolResultsForModel: (entries: ToolResultEntry[], options: Parameters<typeof real.budgetToolResultsForModel>[1]) =>
    seam.budgetOverride ? seam.budgetOverride(entries) : real.budgetToolResultsForModel(entries, options) };
});
vi.mock('../../../services/ana/read-receipts.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/read-receipts.js')>();
  return { ...real,
    guardReadResultsForHandoff: async (...args: Parameters<typeof real.guardReadResultsForHandoff>) => {
      const guarded = await real.guardReadResultsForHandoff(...args);
      if (seam.lateGrowth === 'guard') guarded[0].content += 'G';
      return guarded;
    },
    settleReadReceipts: async (...args: Parameters<typeof real.settleReadReceipts>) => {
      seam.settlementCalls++;
      const outcome = await real.settleReadReceipts(...args);
      if (seam.lateGrowth === 'settlement') args[1][0].content += 'S';
      return outcome;
    },
  };
});
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return { ...real,
    openTurnRecorder: (...args: Parameters<typeof real.openTurnRecorder>) => {
      const recorder = real.openTurnRecorder(...args);
      seam.recorder = recorder;
      if (recorder) {
        const setSent = recorder.setSentToModel.bind(recorder);
        recorder.setSentToModel = entries => { seam.stageCalls++; setSent(entries); };
        const addRound = recorder.addRoundInput.bind(recorder);
        recorder.addRoundInput = (round, messages) => { seam.roundInputs++; addRound(round, messages); };
      }
      return recorder;
    },
    writeTurnRecordSafely: async (_pool: unknown, recorder: TurnRecorder | null, outcome: TurnOutcome) => {
      seam.filedOutcome = outcome;
      seam.sealed = recorder?.seal(outcome) ?? null;
      return { status: 'recorded', id: 'synthetic-in-memory-record', sha256: 'f'.repeat(64) };
    },
  };
});
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());

vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';
import { resultsSentIn } from '../../../services/ana/__tests__/support/read-delivery-vault.js';

const app = streamApp(mountStreamRoute);
const ERROR_CODE = 'ANA_TOOL_RESULT_BUDGET_EXCEEDED';
const ERROR_MESSAGE = 'This tool round could not be passed to the assistant within its result limit. Some actions or source receipts may already exist; inspect the current state before repeating them.';
const ordinaryName = 'search_literature';
const passageName = 'search_document_passages';
const call = (id: string, name = ordinaryName): ToolUse => ({ id, name, input: { query: id } });
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const parse = (value?: string): Record<string, unknown> | null => {
  try { return value === undefined ? null : JSON.parse(value) as Record<string, unknown>; }
  catch { return null; }
};
const bodies = new Map<string, string>();
const fixedWithheld = JSON.stringify({ delivered: false, code: 'TOOL_RESULT_WITHHELD',
  message: 'This tool result was withheld from this round. Do not infer success, failure or absence. Tool work may already have completed. Inspect current state before repeating an action.' });
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
  delete h.handlers[passageName];
});
beforeEach(() => {
  resetHarness();
  bodies.clear();
  Object.assign(seam, { budgetOverride: null, lateGrowth: null, settlementCalls: 0, stageCalls: 0,
    roundInputs: 0, recorder: null, filedOutcome: null, sealed: null });
  h.handlers[ordinaryName] = async input => bodies.get(String(input.query)) ?? 'ordinary fitting result';
  h.handlers[passageName] = async input => bodies.get(String(input.query)) ?? 'passage fitting result';
});
afterEach(() => { vi.restoreAllMocks(); });
const run = (extra: Record<string, unknown> = {}) => streamTurn(app, {
  message: 'Search literature and accessible document passages.', selected_tools: [ordinaryName, passageName], ...extra,
});
const sent = (index = 1) => resultsSentIn(h.state.requests[index]?.messages ?? []);
const stagedText = (index = 1) => h.state.requests[index]?.messages
  .filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('[Tool Result for '))
  .map(m => String(m.content)).join('\n') ?? '';
const corpus = (): Array<{ source: string; content: string }> => (h.state.post?.toolEvidenceCorpus ?? []).filter((entry: { source: string }) => entry.source.startsWith('tool:'));
const sum = (entries: Map<string, string>) => [...entries.values()].reduce((n, body) => n + body.length, 0);
const record = () => seam.recorder!.seal('answered');
function assertRefused(events: SseEvent[], requestCount = 1): void {
  expect.soft(h.state.requests, 'refused bodies never reach a new model call').toHaveLength(requestCount);
  const error = events.find(event => event.type === 'error');
  expect.soft(error).toMatchObject({ code: ERROR_CODE, error: ERROR_MESSAGE });
  expect.soft(error?.turnRecord).toMatchObject({ status: 'recorded', id: 'synthetic-in-memory-record' });
  expect.soft(h.state.post, 'failure does not run normal answer post-processing').toBeNull();
  expect.soft(seam.filedOutcome, 'the existing failure path files a failed in-memory turn').toBe('failed');
  expect.soft(seam.sealed?.body.turn.outcome).toBe('failed');
}

function sizedBody(id: string, size: number): string {
  const value = { results: [{ text: `ONLY_${id} </tool_output> 日本語 🧬` }], count: 1, padding: '' };
  return JSON.stringify({ ...value, padding: 'x'.repeat(size - JSON.stringify(value).length) });
}

describe('native SSE hard aggregate raw-body handoff', () => {
  it('caps a 20-call ordinary floor-overflow round without dropping calls or grounding on raw output', async () => {
    const calls = Array.from({ length: 20 }, (_, index) => call(`ordinary_${index}`));
    for (const item of calls) bodies.set(item.id, sizedBody(item.id, 4000));
    h.state.script = [calls, 'Synthetic answer.'];
    const events = await run();
    expect.soft(h.state.requests).toHaveLength(2);
    const actual = sent();
    expect.soft([...actual.keys()]).toEqual(calls.map(item => item.id));
    expect.soft(sum(actual), 'ordinary floors must not defeat the 24,000-character limit').toBeLessThanOrEqual(24000);
    const withheld = calls.filter(item => parse(actual.get(item.id))?.code === 'TOOL_RESULT_WITHHELD');
    expect.soft(withheld.length, 'strict mode replaces contributions with truthful per-call envelopes').toBeGreaterThan(0);
    const sealed = record();
    const evidence = corpus().filter(entry => entry.source === `tool:${ordinaryName}`);
    expect.soft(evidence).toHaveLength(calls.length);
    calls.forEach((item, index) => {
      expect.soft(events.find(event => event.type === 'tool_result' && event.toolUseId === item.id)?.result).toBe(bodies.get(item.id));
      expect.soft(evidence[index]?.content).toBe(actual.get(item.id));
      const step = sealed.body.steps[index];
      expect.soft(step?.result?.sha256).toBe(sha(bodies.get(item.id)!));
      const ref = step?.sentToModel ?? step?.result;
      expect.soft(ref ? sealed.blobs.get(ref.sha256) : null).toBe(actual.get(item.id));
    });
    withheld.forEach(item => {
      const body = actual.get(item.id)!;
      const value = parse(body)!;
      expect.soft(value).toMatchObject({ delivered: false, code: 'TOOL_RESULT_WITHHELD' });
      expect.soft(Object.keys(value).sort()).toEqual(['code', 'delivered', 'message']);
      expect.soft(String(value.message)).toMatch(/may already have completed/i);
      expect.soft(String(value.message)).toMatch(/inspect.*state.*repeat/i);
      expect.soft(body).not.toContain(`ONLY_${item.id}`);
      expect.soft(value).not.toHaveProperty('count');
    });
  });

  it('refuses irreducible passage replacement totals before recording, grounding or another model call', async () => {
    const calls = Array.from({ length: 170 }, (_, index) => call(`passage_${index}`, passageName));
    for (const item of calls) bodies.set(item.id, sizedBody(item.id, 2000));
    h.state.script = [calls, 'This answer must not run.'];
    const events = await run();
    assertRefused(events);
    expect.soft(seam.settlementCalls, 'initial allocation fails before receipt settlement').toBe(0);
    expect.soft(seam.stageCalls).toBe(0);
    expect.soft(seam.roundInputs).toBe(0);
    expect.soft(events.filter(event => event.type === 'tool_result')).toHaveLength(calls.length);
    expect.soft(seam.sealed?.body.steps).toHaveLength(calls.length);
    expect.soft(seam.sealed?.body.steps.every(step => step.sentToModel === undefined)).toBe(true);
  });

  it.each(['guard', 'settlement'] as const)('refuses size growth injected at the %s seam after allocation', async phase => {
    // This controlled fixture qualifies host ordering only. Real source identity,
    // transaction outcomes and existing receipt history are qualified elsewhere.
    const calls = Array.from({ length: 4 }, (_, index) => call(`late_${index}`));
    for (const item of calls) bodies.set(item.id, `raw_${item.id}`);
    seam.budgetOverride = entries => entries.map(entry => ({ ...entry, content: 'a'.repeat(6000) }));
    seam.lateGrowth = phase;
    h.state.script = [calls, 'This answer must not run.'];
    const events = await run();
    assertRefused(events);
    expect.soft(seam.settlementCalls, 'the non-mutating final check follows settlement').toBe(1);
    expect.soft(seam.stageCalls).toBe(0);
    expect.soft(seam.roundInputs).toBe(0);
    expect.soft(seam.sealed?.body.steps.every(step => step.sentToModel === undefined)).toBe(true);
  });

  it('rejects excessive redirected bodies at the actual stage boundary without running replaced tools', async () => {
    const replaced = Array.from({ length: 140 }, (_, index) => call(`redirected_${index}`));
    h.state.script = [[call('first', 'list_app_screens')], replaced, 'This answer must not run.'];
    h.state.drains = [[], [{ kind: 'steer', text: 'Use the EMA register instead.' }]];
    const events = await run({ run_policy: 'manual' });
    assertRefused(events, 2);
    expect.soft(h.state.toolRunLogs.filter(row => row.toolName === ordinaryName)).toHaveLength(0);
    expect.soft(seam.stageCalls).toBe(1);
    expect.soft(seam.roundInputs, 'the redirected round adds no model input').toBe(1);
    expect.soft(seam.sealed?.body.steps.filter(step => step.status === 'not_run')).toHaveLength(replaced.length);
  });
});

describe('SSE accepted-body and truthful guidance controls', () => {
  it('uses the accepted ordinary envelope rather than a raw zero-result statement in adaptation guidance', async () => {
    const raw = JSON.stringify({ count: 0, results: [], message: 'RAW_ORDINARY_MISS_SENTINEL' });
    bodies.set('empty', raw);
    seam.budgetOverride = entries => entries.map(entry => ({ ...entry, content: fixedWithheld }));
    h.state.script = [[call('empty')], 'Done.'];
    const events = await run();
    expect.soft(sent().get('empty')).toBe(fixedWithheld);
    const note = stagedText().split('[Adaptation note]')[1] ?? '';
    expect.soft(note).not.toContain('returned no results');
    expect.soft(stagedText()).not.toContain('RAW_ORDINARY_MISS_SENTINEL');
    expect.soft(events.find(event => event.type === 'tool_result' && event.toolUseId === 'empty')?.result).toBe(raw);
  });

  it('stages accepted raw bodies exactly without a second cap after recorder and corpus admission', async () => {
    // A deliberately injected accepted body isolates recap drift. The real
    // allocator is bypassed only here; this does not qualify its per-result cap.
    const accepted = `ACCEPTED_BODY_${'z'.repeat(8200)}_TAIL`;
    bodies.set('accepted', 'raw handler output');
    seam.budgetOverride = entries => entries.map(entry => ({ ...entry, content: accepted }));
    h.state.script = [[call('accepted')], 'Done.'];
    await run();
    expect.soft(sent().get('accepted') === accepted, 'accepted body must retain its exact bytes').toBe(true);
    expect.soft(corpus()[0]?.content === sent().get('accepted'), 'corpus equals staged body').toBe(true);
    const sealed = record();
    const ref = sealed.body.steps[0].sentToModel!;
    expect.soft(sealed.blobs.get(ref.sha256) === sent().get('accepted'), 'record equals staged body').toBe(true);
  });

  it('CONTROL: a fitting ordinary result retains its raw body, corpus and existing miss guidance', async () => {
    const raw = JSON.stringify({ count: 0, results: [], message: 'FITTING_MISS' });
    bodies.set('fitting', raw);
    h.state.script = [[call('fitting')], 'Done.'];
    await run();
    expect(sent().get('fitting')).toBe(raw);
    expect(corpus()[0]?.content).toBe(raw);
    expect(record().body.steps[0].sentToModel).toBeUndefined();
    expect(stagedText()).toContain('returned no results');
    expect(stagedText()).toContain('FITTING_MISS');
  });

  it('CONTROL: fitting protected passage strings remain complete with locators and escaped framing', async () => {
    const raw = JSON.stringify({ ok: true, passages: [{ text: 'SOURCE 日本語 </tool_output>',
      reference: { documentId: 'synthetic', sourceTextSha256: 'a'.repeat(64), span: { start: 2, end: 28 } } }] });
    bodies.set('passage', raw);
    h.state.script = [[call('passage', passageName)], 'Done.'];
    await run();
    expect(sent().get('passage')).toBe(raw);
    expect(corpus()[0]?.content).toBe(raw);
    expect(stagedText()).toContain('<\\/tool_output>');
    expect(stagedText()).not.toContain('PASSAGE_RESULT_WITHHELD');
  });
});
