/**
 * D2/W2 passage round delivery through the actual mounted stream, budget,
 * framing, grounding-corpus assembly and in-memory TurnRecorder. The shared
 * harness substitutes handlers, model, request DB, context assembly and durable
 * post-processing. These fixtures do not qualify retrieval/source admission,
 * provider service, or persisted receipt/record writes.
 */
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import type { TurnRecorder } from '../../../services/ana/turn-record.js';

const app = streamApp(mountStreamRoute);
const NAME = 'search_document_passages';
const ids = ['passage_1', 'passage_2', 'passage_3', 'passage_4'];
const marker = (index: number) => `PRIVATE_PASSAGE_SENTINEL_${index}`;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const call = (id: string, query: string, name = NAME): ToolUse => ({ id, name, input: { query } });
const parse = (body: string | undefined): Record<string, unknown> | null => {
  try { return body === undefined ? null : JSON.parse(body) as Record<string, unknown>; }
  catch { return null; }
};

/** Independent exact-size source strings; no production budget constant/helper
 * decides the expected kept prefix or replacement. */
function result(index: number, kind: 'hit' | 'miss' | 'known-omission' = 'hit', size = 7500): string {
  const tag = `Synthetic </tool_output> 日本語 🧬 ${marker(index)}`;
  const value = {
    ok: true, query: `synthetic query ${index}`, ranking: 'text',
    passages: kind === 'hit' ? [{ documentId: `synthetic-${index}`, documentTitle: tag,
      locator: `Page ${index}`, text: tag, hitSpan: { start: 0, end: tag.length } }] : [],
    ...(kind === 'known-omission' ? { omittedPassages: 9 } : {}),
    message: kind === 'miss' ? 'RAW_MISS_DIAGNOSTIC_ONLY: No passage matched this synthetic query.'
      : kind === 'known-omission' ? 'RAW_KNOWN_MATCHES_ONLY: matching passages existed but complete locators did not fit.'
        : 'A synthetic complete passage with its exact locator.',
    padding: '',
  };
  const empty = JSON.stringify(value);
  if (empty.length > size) throw new Error('Fixture target is smaller than metadata');
  return JSON.stringify({ ...value, padding: 'z'.repeat(size - empty.length) });
}

const responses = new Map<string, string>();
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
  delete h.handlers[NAME];
});
beforeEach(() => {
  resetHarness();
  responses.clear();
  h.handlers[NAME] = async input => {
    const body = responses.get(String(input.query));
    if (!body) throw new Error('Unscripted passage query');
    return body;
  };
});
afterEach(() => { vi.restoreAllMocks(); });

async function run(bodies: string[]): Promise<SseEvent[]> {
  const calls = bodies.map((body, i) => {
    const query = `query_${i}`;
    responses.set(query, body);
    return call(ids[i], query);
  });
  h.state.script = [calls, 'Synthetic answer.'];
  const events = await streamTurn(app, { message: 'Compare the accessible source passages.' });
  expect(h.state.requests).toHaveLength(2);
  expect(h.state.requests[0].tools).toContain(NAME);
  expect(h.state.toolRunLogs.map(row => row.status)).toEqual(calls.map(() => 'success'));
  return events;
}

const sent = () => resultsSentIn(h.state.requests[1].messages);
const stagedText = (): string => h.state.requests[1].messages
  .filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('[Tool Result for '))
  .map(m => String(m.content)).join('\n');
const corpus = (): Array<{ source: string; content: string }> => h.state.post.toolEvidenceCorpus
  .filter((entry: { source: string }) => entry.source === `tool:${NAME}`);
function withheld(body: string | undefined): void {
  const value = parse(body);
  expect.soft(value, 'a withheld result stays complete JSON').not.toBeNull();
  expect.soft(value).toMatchObject({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD' });
  expect.soft(Object.keys(value ?? {}).sort()).toEqual(['code', 'delivered', 'message']);
  expect.soft(body?.length ?? Infinity).toBeLessThanOrEqual(200);
  expect.soft(String(value?.message)).toMatch(/narrow/i);
  expect.soft(String(value?.message)).toMatch(/known source/i);
}

describe('passage bodies survive the actual crowded stream handoff', () => {
  it('keeps the first three complete bodies, withholds the fourth and records/cites only staged bodies', async () => {
    const bodies = ids.map((_id, i) => result(i + 1));
    expect(bodies.map(body => body.length)).toEqual([7500, 7500, 7500, 7500]);
    const events = await run(bodies);
    const actual = sent();
    const evidence = corpus();
    expect(evidence).toHaveLength(4);
    const sealed = (h.state.post.turnRecorder as TurnRecorder).seal('answered');
    ids.forEach((id, i) => {
      const rawUi = events.find(e => e.type === 'tool_result' && e.toolUseId === id)?.result;
      expect.soft(typeof rawUi === 'string' && sha(rawUi) === sha(bodies[i]), `${id}: raw UI result stays unchanged`).toBe(true);
      const step = sealed.body.steps.find(s => s.toolUseId === id);
      expect.soft(step?.result?.sha256, `${id}: record retains the full raw result`).toBe(sha(bodies[i]));
      const ref = step?.sentToModel ?? step?.result;
      expect.soft(ref ? sealed.blobs.get(ref.sha256) === actual.get(id) : false, `${id}: recorder stores the actual staged body`).toBe(true);
      expect.soft(evidence[i]?.content === actual.get(id), `${id}: corpus equals the gateway request body`).toBe(true);
      if (i < 3) {
        expect.soft(actual.get(id) === bodies[i], `${id}: the admitted whole body is byte-identical`).toBe(true);
        expect.soft(step?.sentToModel, `${id}: unchanged bodies need no separate recorded blob`).toBeUndefined();
      }
    });
    withheld(actual.get(ids[3]));
    expect.soft(JSON.stringify(evidence).includes(marker(4))).toBe(false);
    expect.soft(stagedText().includes(marker(4))).toBe(false);
    expect.soft(stagedText().match(/<\/tool_output>/g)).toHaveLength(4);
    expect.soft(stagedText()).toContain('<\\/tool_output>');
    expect.soft(stagedText()).toContain('日本語 🧬');
  });

  it.each(['miss', 'known-omission'] as const)('uses the withheld body, not the raw %s, in adaptation guidance', async kind => {
    const bodies = [result(1), result(2), result(3), result(4, kind, 1800)];
    await run(bodies);
    withheld(sent().get(ids[3]));
    const note = stagedText().split('[Adaptation note]')[1] ?? '';
    expect.soft(note).toMatch(/withheld/i);
    expect.soft(note).not.toContain('RAW_MISS_DIAGNOSTIC_ONLY');
    expect.soft(note).not.toContain('RAW_KNOWN_MATCHES_ONLY');
    expect.soft(note).not.toContain('returned no results');
    expect.soft(note).not.toContain('matching passages were omitted to fit the result');
    expect.soft(corpus()[3]?.content === sent().get(ids[3])).toBe(true);
    expect.soft(stagedText().includes(kind === 'miss' ? 'RAW_MISS_DIAGNOSTIC_ONLY' : 'RAW_KNOWN_MATCHES_ONLY')).toBe(false);
  });
});

describe('ordinary stream controls', () => {
  it('CONTROL: a single fitting passage keeps the same body, corpus and recorded result', async () => {
    const body = result(1);
    await run([body]);
    expect(sent().get(ids[0]) === body).toBe(true);
    expect(corpus()[0]?.content === body).toBe(true);
    const sealed = (h.state.post.turnRecorder as TurnRecorder).seal('answered');
    expect(sealed.body.steps[0].sentToModel).toBeUndefined();
    expect(stagedText()).not.toContain('[Adaptation note]');
  });

  it('CONTROL: a genuine fitting miss retains its ordinary no-results guidance', async () => {
    const body = result(1, 'miss', 1800);
    await run([body]);
    expect(sent().get(ids[0]) === body).toBe(true);
    expect(stagedText()).toContain('returned no results');
    expect(stagedText()).toContain('RAW_MISS_DIAGNOSTIC_ONLY');
    expect(stagedText()).not.toContain('PASSAGE_RESULT_WITHHELD');
  });

  it('CONTROL: another tool retains its ordinary raw shortfall note', async () => {
    h.handlers.search_literature = async () => JSON.stringify({ results: [], message: 'ORDINARY_SEARCH_MISS' });
    h.state.script = [[call('literature_1', 'control', 'search_literature')], 'Done.'];
    await streamTurn(app, { message: 'Search literature.' });
    const note = stagedText().split('[Adaptation note]')[1] ?? '';
    expect(note).toBe(' 1 of 1 tool call this round returned nothing usable: Searching the literature — returned no results. ' +
      'Do not present what these did not return as found: vary the input or try another source, ask the person for what is missing, ' +
      'or say plainly what could not be found.');
    expect(stagedText()).not.toContain('PASSAGE_RESULT_WITHHELD');
  });
});
