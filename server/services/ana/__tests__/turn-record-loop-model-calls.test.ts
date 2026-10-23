/**
 * D2/W2 native model provenance: the real shared collector, TurnRecorder,
 * PGlite SQL and chained writer. Responses are deterministic callback fixtures;
 * no executor, gateway, provider or agency is contacted. The optional callback
 * keeps pre-change failures about missing retained facts, not missing methods.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { APPROVED_MODELS, qualifyServedModels } from '../../ai-governance/approved-models';
import { loopToolCollector, recordLoopTurn } from '../turn-record-loop';
import { servedModelsOf } from '../turn-record-models';
import { loadTurnRecord, verifyStoredTurnRecord } from '../turn-record-verify';
import type { TurnRecordBody } from '../turn-record';

interface ObservedCall {
  round: number;
  provider: string | null;
  model: string | null;
  requestId: string | null;
}
interface ExpectedCollector {
  calls: ReturnType<typeof loopToolCollector>['calls'];
  onToolExecution: ReturnType<typeof loopToolCollector>['onToolExecution'];
  servedCalls?: ObservedCall[];
  onModelResponse?: (response: Record<string, unknown>, round: number) => void;
}
type NativeTurn = Parameters<typeof recordLoopTurn>[1] & { servedCalls?: readonly ObservedCall[] };

const collect = (): ExpectedCollector => loopToolCollector() as ExpectedCollector;
const LEGACY_LIMIT = 'This turn ran through a door that reports its tool calls and final answer but not its rounds or what each later model call was sent; the record holds the first call\'s input, every tool call and the answer.';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ORG = 71;
const RAW_RESULT = '{"matches":["EXACT_RAW 日本語 </tool_output>"],"actionAlreadyCompleted":true}';

function fixtureModel(approvedForHighRisk: boolean): { provider: string; model: string } {
  const entry = APPROVED_MODELS.find(model => model.approvedForHighRisk === approvedForHighRisk);
  if (!entry) throw new Error('The existing approval registry lacks the required fixture category.');
  return { provider: entry.provider, model: entry.pinnedVersion };
}
const APPROVED = fixtureModel(true);
const UNAPPROVED = fixtureModel(false);
const observed = (round: number, requestId: string, who = APPROVED): ObservedCall => ({ round, ...who, requestId });
const recorded = (calls: readonly ObservedCall[]) => calls.map((call, index) => ({ call: index + 1, ...call, sent: null }));

let pg: PGlite;
const pool = {
  connect: async () => ({
    query: (sql: string, params?: unknown[]) => pg.query(sql, params),
    release: () => undefined,
  }),
};

beforeAll(async () => {
  vi.stubEnv('AUDIT_HMAC_KEY', '');
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;');
  await pg.exec(readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); vi.unstubAllEnvs(); });

async function file(overrides: Partial<NativeTurn> = {}) {
  const turn: NativeTurn = {
    orgId: ORG, userId: 3, surface: 'test:native-model-calls', projectId: 'project-fixture',
    threadId: 'thread-fixture', typed: 'Review the evidence.',
    messages: [{ role: 'user', content: 'Review the evidence.' }], calls: [],
    outcome: 'answered', response: { ...APPROVED, content: 'Final answer.', thinking: 'Final reasoning.' },
    ...overrides,
  };
  const status = await recordLoopTurn(pool, turn);
  expect(status.status, 'the existing real record writer must file the fixture').toBe('recorded');
  if (status.status !== 'recorded') throw new Error('The existing writer did not file the fixture.');
  const stored = await loadTurnRecord(pg, ORG, status.id);
  expect(stored).not.toBeNull();
  if (!stored) throw new Error('The existing reader could not load the fixture.');
  expect(verifyStoredTurnRecord(stored).ok, 'record, texts and chained audit hash remain intact').toBe(true);
  return { status, stored, body: JSON.parse(stored.recordText) as TurnRecordBody };
}

describe('the native collector retains detached served-call metadata', () => {
  it('copies only primitive metadata immediately, without retaining or mutating the response', () => {
    const c = collect();
    const response = { ...APPROVED, requestId: 'returned-1', content: 'PRIVATE_CONTENT', usage: { totalTokens: 999 }, toolUses: [{ input: { secret: 'PRIVATE_ARGUMENT' } }] };
    const before = globalThis.structuredClone(response);
    c.onModelResponse?.(response, 0);
    expect.soft(response).toEqual(before);
    Object.assign(response, { provider: 'POISON_PROVIDER', model: 'POISON_MODEL', requestId: 'POISON_REQUEST', content: 'POISON_CONTENT' });
    response.usage.totalTokens = 0;
    expect.soft(c.servedCalls ?? []).toEqual([observed(0, 'returned-1')]);
    expect.soft(Object.keys(c.servedCalls?.[0] ?? {}).sort()).toEqual(['model', 'provider', 'requestId', 'round']);
    expect.soft(c.servedCalls?.[0]).not.toBe(response);
    expect.soft(JSON.stringify(c.servedCalls ?? [])).not.toMatch(/PRIVATE_|POISON_|totalTokens|toolUses/);
  });

  it('keeps first-round zero, later rounds and repeated-model calls with their distinct request IDs in callback order', () => {
    const c = collect();
    const calls = [observed(0, 'returned-0', UNAPPROVED), observed(1, 'returned-1'), observed(2, 'returned-2')];
    calls.forEach(({ round, ...response }) => c.onModelResponse?.(response, round));
    expect(c.servedCalls ?? []).toEqual(calls);
  });

  it.each([
    { provider: '', model: '', requestId: '' },
    { provider: 42, model: false, requestId: { not: 'a request id' } },
    { provider: undefined, model: undefined, requestId: undefined },
  ])('retains an unknown returned author for unusable metadata %j', response => {
    const c = collect();
    c.onModelResponse?.(response, 0);
    expect(c.servedCalls ?? []).toEqual([{ round: 0, provider: null, model: null, requestId: null }]);
  });

  it('preserves nonempty strings exactly, including whitespace under the existing helper rule', () => {
    const c = collect();
    c.onModelResponse?.({ provider: ' ', model: '\t', requestId: '  ' }, 7);
    expect(c.servedCalls ?? []).toEqual([{ round: 7, provider: ' ', model: '\t', requestId: '  ' }]);
  });

  it('preserves the existing raw tool collector without a model observer', () => {
    const c = collect();
    const input = { query: 'stability' };
    c.onToolExecution('search_literature', input, RAW_RESULT);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toMatchObject({ tool: 'search_literature', input, result: RAW_RESULT });
    expect(c.calls[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(c.servedCalls ?? []).toEqual([]);
  });
});

describe('the native writer reaches existing per-call author qualification', () => {
  it('files every served call in order while the canonical author list deduplicates repeated models', async () => {
    const servedCalls = Object.freeze([observed(0, 'native-0', UNAPPROVED), observed(1, 'native-1'), observed(2, 'native-2')].map(call => Object.freeze(call)));
    const before = globalThis.structuredClone(servedCalls);
    const final = { provider: APPROVED.provider, model: `${APPROVED.provider}/${APPROVED.model}`, content: 'Final answer.', thinking: 'Final reasoning.' };
    const { body, stored, status } = await file({ servedCalls, response: final, calls: [{ tool: 'search_literature', input: { query: 'stability' }, result: RAW_RESULT, latencyMs: 17 }] });
    expect.soft(body.model.calls).toEqual(recorded(servedCalls));
    expect.soft(servedModelsOf(body.model)).toEqual([UNAPPROVED, APPROVED]);
    expect.soft(status.servedBy).toEqual(qualifyServedModels([UNAPPROVED, APPROVED]));
    expect.soft(status.servedBy?.map(model => model.approvedForHighRisk)).toEqual([false, true]);
    expect.soft(body.model.provider).toBe(final.provider);
    expect.soft(body.model.model).toBe(final.model);
    expect.soft(stored.texts.get(body.answer.streamed!.sha256)).toBe(final.content);
    expect.soft(stored.texts.get(body.reasoning!.sha256)).toBe(final.thinking);
    expect.soft(stored.texts.get(body.steps[0].result!.sha256)).toBe(RAW_RESULT);
    expect.soft(body.steps[0]).toMatchObject({ round: 0, status: 'success', latencyMs: 17 });
    expect.soft(body.turn).toMatchObject({ organizationId: ORG, actorUserId: 3, threadId: 'thread-fixture', outcome: 'answered' });
    expect.soft(servedCalls).toEqual(before);
  });

  it.each([
    { provider: APPROVED.provider, model: null },
    { provider: null, model: APPROVED.model },
    { provider: null, model: null },
  ])('keeps an earlier unknown author %j when the final model is known', async unknownAuthor => {
    const servedCalls: readonly ObservedCall[] = [{ round: 0, ...unknownAuthor, requestId: null }, observed(1, 'known-final')];
    const { body, status } = await file({ servedCalls });
    expect.soft(body.model.calls).toEqual(recorded(servedCalls));
    expect.soft(servedModelsOf(body.model)).toEqual([unknownAuthor, APPROVED]);
    expect.soft(status.servedBy).toEqual(qualifyServedModels([unknownAuthor, APPROVED]));
    expect.soft(status.servedBy?.[0].qualified).toBe(false);
  });

  it.each(['failed', 'stopped'] as const)('retains earlier returned calls on a late %s turn without inventing a call from its error', async outcome => {
    const servedCalls = [observed(0, 'completed-0', UNAPPROVED), observed(1, 'completed-1')];
    const error = Object.assign(new Error('The later model call did not return.'), { provider: 'REQUESTED_PROVIDER', model: 'REQUESTED_MODEL', requestId: 'NOT_A_RETURNED_CALL' });
    const before = { message: error.message, provider: error.provider, model: error.model, requestId: error.requestId };
    const { body, status } = await file({ outcome, response: undefined, error, servedCalls });
    expect.soft(body.turn.outcome).toBe(outcome);
    expect.soft(body.model.calls).toEqual(recorded(servedCalls));
    expect.soft(status.servedBy).toEqual(qualifyServedModels([UNAPPROVED, APPROVED]));
    expect.soft(body.model).toMatchObject({ provider: null, model: null });
    expect.soft(JSON.stringify(body.model)).not.toMatch(/REQUESTED_|NOT_A_RETURNED_CALL/);
    expect.soft(body.answer.streamed).toBeNull();
    expect.soft({ message: error.message, provider: error.provider, model: error.model, requestId: error.requestId }).toEqual(before);
  });

  it.each(['omitted', 'empty'] as const)('preserves the %s observation-list legacy fallback and exact warning', async kind => {
    const { body, status } = await file(kind === 'empty' ? { servedCalls: [] } : {});
    expect(body.model.calls).toEqual([]);
    expect(servedModelsOf(body.model)).toEqual([APPROVED]);
    expect(status.servedBy).toEqual(qualifyServedModels([APPROVED]));
    expect(body.warnings).toEqual([LEGACY_LIMIT]);
    expect(body.roundInputs).toEqual([]);
  });

  it('names no served model when the first call fails without returning a response', async () => {
    const { body, status } = await file({ servedCalls: [], outcome: 'failed', response: undefined, error: new Error('first call failed') });
    expect(body.model.calls).toEqual([]);
    expect(servedModelsOf(body.model)).toEqual([]);
    expect(status.servedBy).toEqual([]);
    expect(body.turn.outcome).toBe('failed');
    expect(body.warnings).toEqual([LEGACY_LIMIT, 'The turn ended with an error: first call failed']);
  });

  it('states the remaining tool-round and later-input gaps when served calls are recorded', async () => {
    const { body } = await file({ servedCalls: [observed(0, 'returned-only')] });
    expect.soft(body.model.calls).toEqual(recorded([observed(0, 'returned-only')]));
    expect.soft(body.roundInputs).toEqual([]);
    expect.soft(body.warnings).not.toContain(LEGACY_LIMIT);
    const warning = body.warnings.join(' ');
    expect.soft(warning).toMatch(/model calls/i);
    expect.soft(warning).toMatch(/tool[- ]step round/i);
    expect.soft(warning).toMatch(/later model inputs/i);
    expect.soft(warning).toMatch(/not reported/i);
  });

  it('keeps an unbound turn unrecorded despite observed models', async () => {
    const turn: NativeTurn = { orgId: null, userId: 3, typed: 'q', surface: 'test', messages: [], calls: [], outcome: 'answered', servedCalls: [observed(0, 'unbound')] };
    expect(await recordLoopTurn(pool, turn)).toEqual({ status: 'not_recorded', reason: 'This turn had no organization to file it under.' });
  });
});
