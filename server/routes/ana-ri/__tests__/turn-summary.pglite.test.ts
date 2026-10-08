/**
 * GET /api/ana-ri/turn-records/:id/summary — the Summary payload — on a real
 * Postgres engine (PGlite) behind the real Express routes (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.5, §3.5, §5 S4 tests 3–5,
 * "Decisions taken" 6).
 *
 *   3. Leak. A record holding sentinels in the system prompt, the model input,
 *      a round input that is not a note, a step's input and result, what the
 *      model was sent, a tool name, a tool-use id, a model request id, the
 *      organisation and the person, a control's author and the reasoning: none
 *      reaches the payload. The check is shown failing on a route that spreads
 *      the record's metadata (the full record read, `?texts=1`), as the first
 *      draft's Summary did.
 *   4. (server half) The list names each record's assistant message, so a
 *      reloaded message finds its record by id.
 *   5. Access, as decision 6 was taken: the Summary is for anyone who may read
 *      the thread's transcript — the asker, an admin and a colleague in the
 *      organisation get 200, another organisation 404 — while the full record
 *      (`?texts=1`, `/export`) stays with the asker and admins (a colleague
 *      gets 403, told who may have it).
 *   6. (server half) The verdict is recomputed on the Summary read.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const holder = vi.hoisted(() => {
  const h = {
    pg: null as any,
    query: async (sql: string, params?: unknown[]) => {
      const r = await h.pg.query(sql, params);
      return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  return h;
});

vi.mock('../../../db.js', () => {
  const pool = { query: holder.query, connect: async () => ({ query: holder.query, release: () => undefined }) };
  return { getPool: () => pool, pool };
});
vi.mock('../../../services/audit/tenant-chain-verdict.js', async () => {
  const { verifyAuditChain } = await import('../../../services/audit/chain.js');
  return { verifyTenantChainOnAdminScope: async (orgId: number) => verifyAuditChain(holder.pg, { tenantId: orgId }) };
});

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { TurnRecorder, writeTurnRecord } from '../../../services/ana/turn-record';
import { TurnTimeline } from '../../../services/ana/turn-timeline-emitter';
import { announcedStepFields, finishedStep } from '../../../services/ana/step-presentation';
import { mountTurnRecordRoutes } from '../turn-records';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 90417;
const ASKER = 80423;

const USERS: Record<string, { id: number; org: number; role: string }> = {
  asker: { id: ASKER, org: ORG, role: 'member' },
  colleague: { id: 80424, org: ORG, role: 'member' },
  admin: { id: 80425, org: ORG, role: 'admin' },
  outsider: { id: 80426, org: 90418, role: 'admin' },
};

function appAs() {
  const app = express();
  app.use((req, _res, next) => {
    const u = USERS[String(req.header('x-as'))];
    (req as any).user = { id: u.id, role: u.role, roles: [u.role] };
    (req as any).userId = u.id;
    (req as any).tenantId = u.org;
    (req as any).dbClient = { query: holder.query };
    next();
  });
  const router = express.Router();
  mountTurnRecordRoutes(router);
  app.use('/api/ana-ri', router);
  return app;
}

const pool = () => ({
  connect: async () => ({ query: (s: string, p?: unknown[]) => holder.pg.query(s, p), release: () => undefined }),
});

const SENTINELS = [
  'SENT_SYSTEM_PROMPT',
  'SENT_MODEL_INPUT',
  'SENT_REQUEST_TYPED',
  'SENT_ROUND_INPUT',
  'SENT_STEP_INPUT',
  'SENT_STEP_RESULT',
  'SENT_SENT_TO_MODEL',
  'sentinel_tool_SENTTOOLNAME',
  'tu_SENT_TOOL_USE_ID',
  'req_SENT_REQUEST_ID',
  'SENT_THINKING',
  'SENT_ANSWER',
];
const NOTE = 'I will look in the Vault for the stability reports first.';

/**
 * A /4 record built the way the stream builds one: the recorder for the turn's
 * texts, the timeline emitter for its events, presentStep for each step.
 */
async function recordTurn(threadId: string | null, assistantMessageId: number | null = null) {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: ORG, threadId, runId: 'run_s4', actorUserId: ASKER });
  r.setMessageIds({ user: 1, assistant: assistantMessageId });
  r.setRequest('SENT_REQUEST_TYPED what is the shelf life?', 'SENT_REQUEST_TYPED what is the shelf life?');
  r.setModelInput([
    { role: 'system', content: 'You are AnA. SENT_SYSTEM_PROMPT' },
    { role: 'user', content: 'SENT_MODEL_INPUT what is the shelf life?' },
  ]);
  const t = new TurnTimeline({ write: () => undefined, recorder: () => r });
  const call = { id: 'tu_SENT_TOOL_USE_ID', name: 'sentinel_tool_SENTTOOLNAME', input: { filter: 'SENT_STEP_INPUT', query: 'shelf life' } };
  const result = JSON.stringify({ results: [1, 2], secret: 'SENT_STEP_RESULT' });
  r.addServed(1, { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req_SENT_REQUEST_ID' });
  t.noteFrom(NOTE);
  t.announced(1, call, announcedStepFields(call, null));
  const done = finishedStep(call, null, { status: 'success', result, latencyMs: 12, usedModel: false });
  const recorded = t.finished(1, call, { ...done.frame, status: 'success', heldBack: false, ms: 12, startedAt: Date.now() - 12 });
  r.addStep({ toolUseId: call.id, round: 1, tool: call.name, label: done.label, status: 'success', latencyMs: 12, input: call.input, result, ...recorded });
  r.setSentToModel([{ tool_use_id: call.id, content: 'SENT_SENT_TO_MODEL' }]);
  r.addRoundInput(1, [
    { role: 'assistant', content: NOTE },
    { role: 'user', content: '[Tool Result for sentinel_tool_SENTTOOLNAME (tu_SENT_TOOL_USE_ID)]: SENT_ROUND_INPUT' },
  ]);
  t.planned(1, [{ title: 'Find the reports', status: 'in_progress' }]);
  r.addServed(1, { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req_SENT_REQUEST_ID' });
  r.setReasoning('SENT_THINKING weighing the reports');
  r.setAnswer({ streamed: 'SENT_ANSWER The shelf life is 24 months.', stored: 'SENT_ANSWER The shelf life is 24 months.' });
  r.setControls([{ action: 'interject', message: 'Look at 2024 too', round: 2, at: new Date().toISOString(), byUserId: ASKER }]);
  t.end('answered', 'no_more_tools');
  return writeTurnRecord(pool(), r.seal('answered'));
}

/** What a payload leaks: every sentinel it contains, and the organisation's or the person's id as a value. */
function leaksIn(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  const found = SENTINELS.filter(s => text.includes(s));
  for (const [name, id] of [['organizationId', ORG], ['actorUserId', ASKER]] as const) {
    if (new RegExp(`[:\\[,]${id}[,}\\]]`).test(text)) found.push(`${name} ${id}`);
  }
  return found;
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await holder.pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await holder.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
  await holder.pg.exec(`
    CREATE TABLE chat_threads (id TEXT PRIMARY KEY, user_id INTEGER, project_id INTEGER, organization_id INTEGER,
                               title TEXT, model TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE ai_threads (id TEXT PRIMARY KEY, organization_id INTEGER);
  `);
  await holder.pg.query(`INSERT INTO chat_threads (id, user_id, organization_id, title) VALUES ('th_s4', $1, $2, 'Shelf life')`, [ASKER, ORG]);
});
afterAll(async () => {
  await holder.pg.close();
});

describe('3. the Summary payload leaks nothing the Summary never contains', () => {
  it('carries the notes, steps, tasks, controls and models, and none of the sentinels', async () => {
    const { id } = await recordTurn('th_s4');
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', 'asker');
    expect(res.status).toBe(200);
    const s = res.body.data;
    expect(Object.keys(s).sort()).toEqual(
      ['controls', 'endedAt', 'events', 'id', 'models', 'outcome', 'recordSha256', 'schemaVersion', 'startedAt', 'threadId', 'verdict'].sort(),
    );
    expect(s.schemaVersion).toBe('ana-turn-record/4');
    expect(s.events.find((e: any) => e.kind === 'note')?.text).toBe(NOTE);
    expect(s.events.filter((e: any) => e.kind === 'step').map((e: any) => e.label)).toEqual(['Running a step', 'Ran a step']);
    expect(s.events.find((e: any) => e.kind === 'task')).toMatchObject({ task: 't1', change: 'added', title: 'Find the reports' });
    expect(s.controls).toEqual([{ action: 'interject', message: 'Look at 2024 too', round: 2, at: expect.any(String) }]);
    expect(s.models).toEqual([{ provider: 'anthropic', model: 'claude-opus-5-5' }]);
    expect(leaksIn(s)).toEqual([]);
  });

  it('the check fails on a route that spreads the record\'s metadata (the full record read)', async () => {
    const { id } = await recordTurn('th_s4');
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}?texts=1`).set('x-as', 'asker');
    expect(res.status).toBe(200);
    const leaked = leaksIn(res.body.data);
    expect(leaked).toEqual(expect.arrayContaining([`organizationId ${ORG}`, `actorUserId ${ASKER}`, 'SENT_SYSTEM_PROMPT', 'SENT_THINKING']));
  });
});

describe('5. who may read the Summary (decision 6, as taken)', () => {
  it('the asker, an admin and a colleague read it; another organisation cannot tell it exists', async () => {
    const { id } = await recordTurn('th_s4');
    for (const who of ['asker', 'admin', 'colleague']) {
      const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', who);
      expect(res.status, who).toBe(200);
    }
    const outsider = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', 'outsider');
    expect(outsider.status).toBe(404);
  });

  it('the full record stays with the asker and admins: a colleague gets 403 on ?texts=1 and on /export, told who may', async () => {
    const { id } = await recordTurn('th_s4');
    for (const url of [`/api/ana-ri/turn-records/${id}?texts=1`, `/api/ana-ri/turn-records/${id}/export`]) {
      const colleague = await request(appAs()).get(url).set('x-as', 'colleague');
      expect(colleague.status, url).toBe(403);
      expect(colleague.body.error.message).toBe('The full record is available to the person who asked and to administrators.');
      expect((await request(appAs()).get(url).set('x-as', 'outsider')).status, url).toBe(404);
    }
    expect((await request(appAs()).get(`/api/ana-ri/turn-records/${id}?texts=1`).set('x-as', 'asker')).status).toBe(200);
  });

  it('a turn with no conversation has no transcript to read: a colleague gets 403 on its Summary', async () => {
    const { id } = await recordTurn(null);
    expect((await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', 'colleague')).status).toBe(403);
    expect((await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', 'asker')).status).toBe(200);
  });
});

describe('4. (server half) records join their messages by id', () => {
  it('the thread\'s list names each record\'s assistant message, for anyone who may read the thread', async () => {
    const { id } = await recordTurn('th_s4', 4321);
    for (const who of ['asker', 'colleague']) {
      const res = await request(appAs()).get('/api/ana-ri/turn-records?thread_id=th_s4').set('x-as', who);
      expect(res.status, who).toBe(200);
      const row = res.body.data.records.find((x: any) => x.id === id);
      expect(row, who).toMatchObject({ id, assistantMessageId: 4321 });
      // A colleague is not told who asked.
      if (who === 'colleague') expect(row).not.toHaveProperty('actorUserId');
    }
  });
});

describe('6. (server half) the verdict is recomputed on the Summary read', () => {
  it('reads ok for an intact record, and not ok, with a reason, once its chain row no longer carries its hash', async () => {
    const { id } = await recordTurn('th_s4');
    const ok = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', 'asker');
    expect(ok.body.data.verdict).toEqual({ ok: true });
    await holder.pg.exec(`ALTER TABLE audit_logs DISABLE TRIGGER ALL`);
    await holder.pg.query(`UPDATE audit_logs SET new_values = '{}'::jsonb WHERE record_id = $1`, [id]);
    await holder.pg.exec(`ALTER TABLE audit_logs ENABLE TRIGGER ALL`);
    const bad = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/summary`).set('x-as', 'asker');
    expect(bad.body.data.verdict.ok).toBe(false);
    expect(bad.body.data.verdict.reason).toEqual(expect.any(String));
  });
});
