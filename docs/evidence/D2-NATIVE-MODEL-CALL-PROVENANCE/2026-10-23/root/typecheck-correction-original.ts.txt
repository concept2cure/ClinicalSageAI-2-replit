/**
 * Native host model provenance: mounted /api/claude/agent and the production
 * realtime turn runner, with a scripted executor and real shared collector,
 * TurnRecorder, PGlite storage, chained audit writer and record reader.
 * No gateway, provider, socket handshake, deployed role or SDK is exercised.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgenticOptions } from '../AnaToolExecutor.js';
import type { AnaGatewayResponse, GatewayRequest } from '../../ai-gateway/types.js';
import type { TurnRecordBody, TurnRecordStatus } from '../turn-record.js';

type Script = (request: GatewayRequest, options: AgenticOptions) => Promise<AnaGatewayResponse>;
const h = vi.hoisted(() => ({ pg: null as PGlite | null, script: null as Script | null, invocations: 0 }));
vi.mock('../../../db.js', () => {
  const query = (sql: string, params?: unknown[]) => h.pg!.query(sql, params);
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { getPool: () => pool, pool };
});
// As the existing turn-record-loop fixture: the route's separate general audit
// service is outside this single-session schema. Record chained-audit SQL stays real.
vi.mock('../../auditService', async importOriginal => {
  const real = await importOriginal<typeof import('../../auditService.js')>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});
vi.mock('../../auditService.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../auditService.js')>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});
function scriptedExecutor(input: GatewayRequest, options: AgenticOptions): Promise<AnaGatewayResponse> {
  h.invocations++;
  expect(input.organizationId).toBe(7);
  expect(input.userId).toBe(1);
  if (!h.script) throw new Error('The test did not provide an executor script.');
  return h.script(input, options);
}
vi.mock('../AnaToolExecutor', async importOriginal => ({
  ...await importOriginal<object>(), executeAgenticLoop: scriptedExecutor,
}));
vi.mock('../AnaToolExecutor.js', async importOriginal => ({
  ...await importOriginal<object>(), executeAgenticLoop: scriptedExecutor,
}));

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness.js';
import { loadTurnRecord, verifyStoredTurnRecord } from '../turn-record-verify.js';
import { servedModelsOf } from '../turn-record-models.js';
import { qualifyServedModels } from '../../ai-governance/approved-models.js';
import { runAgenticTurn } from '../ana-realtime.js';
import router from '../../../routes/ana-intelligence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ORG = 7;
const ANSWER = 'Synthetic source: the endpoint is PFS.';
const RAW = '{"hits":[{"study":"SYNTHETIC-01","value":"日本語 12 mg"}]}';
const LEGACY_WARNING = 'This turn ran through a door that reports its tool calls and final answer but not its rounds or what each later model call was sent; the record holds the first call\'s input, every tool call and the answer.';
const realtimeInput = { turnId: 'synthetic-native', message: 'Which endpoint?', organizationId: ORG, userId: 1 };
const pg = () => {
  if (!h.pg) throw new Error('PGlite fixture has not opened.');
  return h.pg;
};

beforeAll(async () => {
  h.pg = new PGlite();
  await pg().exec(AUDIT_LOGS_PGLITE_DDL);
  await pg().exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg().exec('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;');
  await pg().exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => { await h.pg?.close(); });
beforeEach(() => {
  h.script = null;
  h.invocations = 0;
  vi.stubEnv('AUDIT_HMAC_KEY', '');
});
afterAll(() => { vi.unstubAllEnvs(); });

function agentApp(withClient = true) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantContext: { organizationId: ORG }, user: { id: 1 } });
    if (withClient) Object.assign(req, { dbClient: { query: (sql: string, params?: unknown[]) => pg().query(sql, params) } });
    next();
  });
  app.use('/api/claude', router);
  return app;
}

function response(provider: unknown, model: unknown, requestId: unknown): AnaGatewayResponse {
  return { provider, model, requestId, content: ANSWER, thinking: 'Synthetic reasoning.', toolUses: [],
    usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 }, latencyMs: 2 } as AnaGatewayResponse;
}
const initial = () => response('openai', 'gpt-4o', 'req-initial');
const final = () => response('anthropic', 'claude-opus-5-5', 'req-repeat');
function observe(options: AgenticOptions, replies: AnaGatewayResponse[]): void {
  replies.forEach((reply, round) => options.onModelResponse?.(reply, round));
  options.onToolExecution?.('project_knowledge_search', { query: 'endpoint' }, RAW);
}
const recordedCall = (call: number, round: number, provider: string | null, model: string | null, requestId: string | null) =>
  ({ call, round, provider, model, requestId, sent: null });
const ids = async () => new Set((await pg().query<{ id: string }>('SELECT id FROM ana_turn_records')).rows.map(row => row.id));
async function newRecord(before: Set<string>) {
  const added = [...await ids()].filter(id => !before.has(id));
  expect(added).toHaveLength(1);
  const stored = await loadTurnRecord(pg(), ORG, added[0]);
  if (!stored) throw new Error('Expected the actual writer to persist its turn.');
  expect(verifyStoredTurnRecord(stored)).toMatchObject({ ok: true, chainCarriesHash: true, textsIntact: true });
  return { body: JSON.parse(stored.recordText) as TurnRecordBody, stored };
}
type Host = 'agent' | 'realtime';
async function runHost(host: Host) {
  const before = await ids();
  if (host === 'agent') {
    const http = await request(agentApp()).post('/api/claude/agent').send({ prompt: 'Which endpoint?', organizationId: 999, userId: 999 });
    const record = await newRecord(before);
    return { ...record, httpStatus: http.status, error: null };
  }
  let error: unknown = null;
  try { await runAgenticTurn(realtimeInput, new AbortController().signal, () => undefined); }
  catch (caught) { error = caught; }
  return { ...await newRecord(before), httpStatus: null, error };
}
function assertPreserved(body: TurnRecordBody, stored: Awaited<ReturnType<typeof newRecord>>['stored'], outcome: 'answered' | 'failed' | 'stopped') {
  expect([body.turn.organizationId, body.turn.actorUserId, body.turn.outcome]).toEqual([ORG, 1, outcome]);
  expect(body.steps).toHaveLength(1);
  const result = body.steps[0].result;
  expect(result && stored.texts.get(result.sha256)).toBe(RAW);
  expect(body.steps[0].tool).toBe('project_knowledge_search');
  expect(body.roundInputs).toEqual([]);
  expect(h.invocations).toBe(1);
}

describe.each(['agent', 'realtime'] as const)('%s native host records returned model calls', host => {
  it('records mixed models, repeated calls and request IDs in actual observation order', async () => {
    h.script = async (_request, options) => {
      const replies = [initial(), final(), final()];
      observe(options, replies);
      return replies[2];
    };
    const { body, stored } = await runHost(host);
    assertPreserved(body, stored, 'answered');
    expect(body.model.calls).toEqual([
      recordedCall(1, 0, 'openai', 'gpt-4o', 'req-initial'),
      recordedCall(2, 1, 'anthropic', 'claude-opus-5-5', 'req-repeat'),
      recordedCall(3, 2, 'anthropic', 'claude-opus-5-5', 'req-repeat'),
    ]);
    expect(servedModelsOf(body.model)).toEqual([{ provider: 'openai', model: 'gpt-4o' }, { provider: 'anthropic', model: 'claude-opus-5-5' }]);
    expect(body.model).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(stored.texts.get(body.answer.streamed!.sha256)).toBe(ANSWER);
    expect(body.warnings).toContain('This turn reports its served model calls and raw tool calls; tool-step round assignments and later model inputs are not reported by this door.');
  });

  it('keeps an earlier unknown author when a later qualified model answers', async () => {
    h.script = async (_request, options) => {
      const last = final();
      observe(options, [response(undefined, 42, ''), last]);
      return last;
    };
    const { body, stored } = await runHost(host);
    assertPreserved(body, stored, 'answered');
    expect(body.model.calls).toEqual([recordedCall(1, 0, null, null, null), recordedCall(2, 1, 'anthropic', 'claude-opus-5-5', 'req-repeat')]);
    expect(qualifyServedModels(servedModelsOf(body.model), { NODE_ENV: 'development' }).map(author => author.qualified)).toEqual([false, true]);
  });

  it('retains earlier responses on late failure without inventing a served failed call', async () => {
    const failure = new Error('synthetic late gateway failure');
    h.script = async (_request, options) => { observe(options, [initial(), final()]); throw failure; };
    const { body, stored, httpStatus, error } = await runHost(host);
    assertPreserved(body, stored, 'failed');
    expect(body.model.calls).toEqual([recordedCall(1, 0, 'openai', 'gpt-4o', 'req-initial'), recordedCall(2, 1, 'anthropic', 'claude-opus-5-5', 'req-repeat')]);
    expect(body.model.model).toBeNull();
    expect(body.warnings.join(' ')).toContain(failure.message);
    if (host === 'agent') expect(httpStatus).toBeGreaterThanOrEqual(500);
    else expect(error).toBe(failure);
  });
});

describe.each(['agent', 'realtime'] as const)('%s native host compatibility', host => {
  it('records the first returned response even when no tool was requested', async () => {
    h.script = async (_request, options) => {
      const last = final();
      options.onModelResponse?.(last, 0);
      return last;
    };
    const { body } = await runHost(host);
    expect(body.turn.outcome).toBe('answered');
    expect(body.steps).toEqual([]);
    expect(body.model.calls).toEqual([recordedCall(1, 0, 'anthropic', 'claude-opus-5-5', 'req-repeat')]);
    expect(h.invocations).toBe(1);
  });

  it('CONTROL: a first-call failure records no invented model or call', async () => {
    const failure = new Error('synthetic first gateway failure');
    h.script = async () => { throw failure; };
    const { body, httpStatus, error } = await runHost(host);
    expect(body.turn.outcome).toBe('failed');
    expect(body.model.calls).toEqual([]);
    expect(servedModelsOf(body.model)).toEqual([]);
    expect(body.steps).toEqual([]);
    expect(body.warnings).toContain(LEGACY_WARNING);
    if (host === 'agent') expect(httpStatus).toBeGreaterThanOrEqual(500);
    else expect(error).toBe(failure);
  });

  it('CONTROL: an executor that reports no observer keeps its legacy fallback and exact warning', async () => {
    h.script = async (_request, options) => { options.onToolExecution?.('project_knowledge_search', { query: 'endpoint' }, RAW); return final(); };
    const { body, stored } = await runHost(host);
    assertPreserved(body, stored, 'answered');
    expect(body.model.calls).toEqual([]);
    expect(servedModelsOf(body.model)).toEqual([{ provider: 'anthropic', model: 'claude-opus-5-5' }]);
    expect(body.warnings).toContain(LEGACY_WARNING);
  });
});

describe('realtime cancellation keeps actual returned provenance', () => {
  it.each(['throws', 'returns'] as const)('retains the prior response when the stopped executor %s', async ending => {
    const controller = new AbortController();
    const failure = new Error('synthetic stopped gateway failure');
    h.script = async (_request, options) => {
      const last = final();
      observe(options, [initial(), last]);
      controller.abort();
      if (ending === 'throws') throw failure;
      return last;
    };
    const before = await ids();
    let error: unknown;
    try { await runAgenticTurn(realtimeInput, controller.signal, () => undefined); }
    catch (caught) { error = caught; }
    const { body, stored } = await newRecord(before);
    assertPreserved(body, stored, 'stopped');
    expect(body.model.calls).toEqual([recordedCall(1, 0, 'openai', 'gpt-4o', 'req-initial'), recordedCall(2, 1, 'anthropic', 'claude-opus-5-5', 'req-repeat')]);
    if (ending === 'throws') expect(error).toBe(failure);
    else expect(stored.texts.get(body.answer.streamed!.sha256)).toBe(ANSWER);
  });

  it('CONTROL: an agent without its request DB client records nothing through the shared pool', async () => {
    h.script = async (_request, options) => { observe(options, [initial(), final()]); return final(); };
    const before = await ids();
    const res = await request(agentApp(false)).post('/api/claude/agent').send({ prompt: 'No scoped client.' });
    expect(res.status).toBe(200);
    expect(res.body.data.turnRecord).toMatchObject({ status: 'not_recorded' } satisfies Partial<TurnRecordStatus>);
    expect(await ids()).toEqual(before);
  });
});
