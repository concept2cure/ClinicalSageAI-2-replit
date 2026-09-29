/**
 * The turn-record read, verify and export endpoints, and the audited
 * conversation delete, on a real Postgres engine (PGlite) behind the real
 * Express routes.
 *
 * What is shown:
 *   - the person whose turn it was, and an org admin, can read and export it;
 *     a colleague gets 403, another organization 404;
 *   - every read re-verifies from the stored bytes, and a record rewritten
 *     past the trigger reads as not intact;
 *   - an export is recorded on the chain before anything leaves, and is
 *     refused when that record cannot be written;
 *   - deleting a conversation is the owner's act, audited in the same
 *     transaction, and the turn records survive it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const holder = vi.hoisted(() => {
  const h = {
    pg: null as any,
    failOn: null as RegExp | null,
    chainWalkFails: false,
    query: async (sql: string, params?: unknown[]) => {
      if (h.failOn && h.failOn.test(sql)) throw new Error('simulated failure');
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
  return {
    verifyTenantChainOnAdminScope: async (orgId: number) => {
      if (holder.chainWalkFails) throw new Error('no admin scope');
      return verifyAuditChain(holder.pg, { tenantId: orgId });
    },
  };
});

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { TurnRecorder, writeTurnRecord, sha256Hex } from '../../../services/ana/turn-record';
import { mountTurnRecordRoutes, TURN_RECORD_EXPORT_ACTION } from '../turn-records';
import { deleteConversation, CONVERSATION_DELETED_AUDIT_ACTION } from '../../../services/chat-thread-helpers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 61;

const USERS: Record<string, { id: number; org: number; role: string }> = {
  owner: { id: 7, org: ORG, role: 'member' },
  colleague: { id: 8, org: ORG, role: 'member' },
  admin: { id: 9, org: ORG, role: 'admin' },
  outsider: { id: 10, org: 62, role: 'admin' },
};

function appAs() {
  const app = express();
  app.use((req, _res, next) => {
    const u = USERS[String(req.header('x-as'))];
    (req as any).user = { id: u.id, role: u.role, roles: [u.role] };
    (req as any).userId = u.id;
    (req as any).tenantId = u.org;
    // The request-scoped client the global auth gate attaches; the routes
    // read and record on it, never on the shared pool.
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

async function recordTurn(question: string, threadId = 'th_live') {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: ORG, threadId, runId: 'run_x', actorUserId: USERS.owner.id });
  r.setRequest(question, question);
  r.setModelInput([{ role: 'system', content: 'You are AnA.' }, { role: 'user', content: question }]);
  r.addStep({ toolUseId: 'tu_1', round: 1, tool: 'project_knowledge_search', label: 'Searching', status: 'success', input: { q: 'x' }, result: '{"hits":1}' });
  r.setSentToModel([{ tool_use_id: 'tu_1', content: '{"hits":1}' }]);
  r.addServed(1, { provider: 'anthropic', model: 'model-x' });
  r.addRoundInput(1, [{ role: 'user', content: '[Tool Result for project_knowledge_search (tu_1)]:\n{"hits":1}' }]);
  r.addServed(1, { provider: 'anthropic', model: 'model-x' });
  r.setAnswer({ streamed: 'The answer.', stored: 'The answer.' });
  return writeTurnRecord(pool(), r.seal('answered'));
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
    CREATE TABLE chat_messages (id SERIAL PRIMARY KEY, thread_id TEXT, role TEXT, content TEXT, model TEXT,
                                tokens_used INTEGER, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now());
  `);
});
afterAll(async () => {
  await holder.pg.close();
});
beforeEach(() => {
  holder.failOn = null;
  holder.chainWalkFails = false;
  delete process.env.AUDIT_HMAC_KEY;
});

describe('reading a turn record', () => {
  it('the person who asked reads it, re-verified from the stored bytes', async () => {
    const { id, sha256 } = await recordTurn('What is the primary endpoint?');
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}?texts=1`).set('x-as', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.data.recordSha256).toBe(sha256);
    expect(res.body.data.verdict).toMatchObject({ recordIntact: true, chainCarriesHash: true, chainPayloadIntact: true, textsIntact: true, ok: true });
    expect(res.body.data.record.turn.actorUserId).toBe(USERS.owner.id);
    // The texts come back under the hashes the record names.
    const texts: Record<string, string> = res.body.data.texts;
    expect(texts[res.body.data.record.request.typed.sha256]).toBe('What is the primary endpoint?');
    // What each later call added to the model's input is on the record, and
    // the calls are numbered: two calls both labelled round 1 stay apart.
    expect(res.body.data.record.roundInputs.map((ri: any) => [ri.call, ri.round])).toEqual([[2, 1]]);
    expect(res.body.data.record.model.calls.map((c: any) => [c.call, c.round])).toEqual([[1, 1], [2, 1]]);
  });

  it('an org admin reads it; a colleague is refused; another organization cannot tell it exists', async () => {
    const { id } = await recordTurn('Whose record is this?');
    expect((await request(appAs()).get(`/api/ana-ri/turn-records/${id}`).set('x-as', 'admin')).status).toBe(200);
    const colleague = await request(appAs()).get(`/api/ana-ri/turn-records/${id}`).set('x-as', 'colleague');
    expect(colleague.status).toBe(403);
    expect(colleague.body.error.code).toBe('TURN_RECORD_NOT_YOURS');
    const outsider = await request(appAs()).get(`/api/ana-ri/turn-records/${id}`).set('x-as', 'outsider');
    expect(outsider.status).toBe(404);
  });

  it('lists only the caller\'s own records unless they read every record', async () => {
    await recordTurn('listed turn', 'th_list');
    const own = await request(appAs()).get('/api/ana-ri/turn-records?thread_id=th_list').set('x-as', 'owner');
    expect(own.status).toBe(200);
    expect(own.body.data.records.length).toBeGreaterThan(0);
    const colleague = await request(appAs()).get('/api/ana-ri/turn-records?thread_id=th_list').set('x-as', 'colleague');
    expect(colleague.body.data.records).toEqual([]);
    const admin = await request(appAs()).get('/api/ana-ri/turn-records?thread_id=th_list').set('x-as', 'admin');
    expect(admin.body.data.records.length).toBe(own.body.data.records.length);
  });

  it('finds a turn by the run it was served under — how a client that stopped listening learns it was filed', async () => {
    const { id } = await recordTurn('a turn the person stopped');
    const own = await request(appAs()).get('/api/ana-ri/turn-records?run_id=run_x&limit=50').set('x-as', 'owner');
    expect(own.body.data.records.map((r: any) => r.id)).toContain(id);
    const other = await request(appAs()).get('/api/ana-ri/turn-records?run_id=run_nobody').set('x-as', 'owner');
    expect(other.body.data.records).toEqual([]);
    // A colleague learns nothing about someone else's run.
    const colleague = await request(appAs()).get('/api/ana-ri/turn-records?run_id=run_x').set('x-as', 'colleague');
    expect(colleague.body.data.records).toEqual([]);
  });

  it('a record rewritten past the trigger reads as not intact', async () => {
    const { id } = await recordTurn('the question as asked');
    const forged = new TurnRecorder();
    forged.setTurn({ organizationId: ORG, threadId: 'th_live', actorUserId: USERS.owner.id });
    forged.setRequest('a question nobody asked');
    const sealed = forged.seal('answered');
    for (const [sha, text] of sealed.blobs) {
      await holder.pg.query(
        `INSERT INTO ana_record_blobs (organization_id, sha256, text, chars) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [ORG, sha, text, text.length],
      );
    }
    await holder.pg.exec(`ALTER TABLE ana_turn_records DISABLE TRIGGER trg_ana_turn_records_append_only`);
    await holder.pg.query(`UPDATE ana_turn_records SET record_text = $1, record_sha256 = $2 WHERE id = $3`, [sealed.text, sealed.sha256, id]);
    await holder.pg.exec(`ALTER TABLE ana_turn_records ENABLE TRIGGER trg_ana_turn_records_append_only`);

    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}`).set('x-as', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.data.verdict.recordIntact).toBe(true);
    expect(res.body.data.verdict.chainCarriesHash).toBe(false);
    expect(res.body.data.verdict.ok).toBe(false);
  });
});

describe('exporting a turn record for an inspector', () => {
  it('records the export on the chain, then hands over a package that verifies offline', async () => {
    const { id, sha256 } = await recordTurn('Export me');
    const before = (await holder.pg.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = $1 AND record_id = $2`, [TURN_RECORD_EXPORT_ACTION, id])).rows[0].n;
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/export`).set('x-as', 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain(`ana-turn-${id}.json`);
    const after = (await holder.pg.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = $1 AND record_id = $2`, [TURN_RECORD_EXPORT_ACTION, id])).rows[0].n;
    expect(after - before).toBe(1);

    const pkg = JSON.parse(res.text);
    // The inspector's own checks, with nothing from this server but the package.
    expect(sha256Hex(pkg.record.recordText)).toBe(sha256);
    expect(pkg.chain.details.recordSha256).toBe(sha256);
    expect(sha256Hex(JSON.stringify(pkg.chain.details))).toBe(pkg.chain.payloadHash);
    const body = JSON.parse(pkg.record.recordText);
    expect(sha256Hex(pkg.texts[body.request.typed.sha256])).toBe(body.request.typed.sha256);
    expect(pkg.verdict.ok).toBe(true);
    expect(pkg.tenantChain.ok).toBe(true);
    expect(pkg.howToVerify.length).toBeGreaterThan(0);
  });

  it('says the chain walk is unknown when it could not run — never that it passed', async () => {
    const { id } = await recordTurn('Export with no admin scope');
    holder.chainWalkFails = true;
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/export`).set('x-as', 'owner');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text).tenantChain.ok).toBeNull();
  });

  it('refuses the export when it cannot be recorded, and nothing leaves', async () => {
    const { id } = await recordTurn('Export that cannot be recorded');
    holder.failOn = /INSERT INTO audit_logs/;
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/export`).set('x-as', 'owner');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('TURN_RECORD_EXPORT_NOT_RECORDED');
    expect(res.text).not.toContain('recordText');
  });
});

describe('deleting a conversation', () => {
  async function seedThread(id: string, owner: number | null) {
    await holder.pg.query(`INSERT INTO chat_threads (id, user_id, organization_id, title) VALUES ($1,$2,$3,'Endpoint questions')`, [id, owner, ORG]);
    await holder.pg.query(`INSERT INTO chat_messages (thread_id, role, content) VALUES ($1,'user','q'),($1,'assistant','a')`, [id]);
  }
  const threadExists = async (id: string) => (await holder.pg.query(`SELECT 1 FROM chat_threads WHERE id = $1`, [id])).rows.length > 0;

  it('is the owner\'s act, audited in the same transaction, and the turn records survive it', async () => {
    await seedThread('th_del', USERS.owner.id);
    await recordTurn('a turn in a conversation about to be deleted', 'th_del');
    const result = await deleteConversation({ threadId: 'th_del', organizationId: ORG, userId: USERS.owner.id });
    expect(result).toEqual({ status: 'deleted', messagesDeleted: 2, turnRecordsRetained: 1 });
    expect(await threadExists('th_del')).toBe(false);
    const audit = (await holder.pg.query(`SELECT new_values FROM audit_logs WHERE action = $1 AND record_id = 'th_del'`, [CONVERSATION_DELETED_AUDIT_ACTION])).rows[0];
    const details = typeof audit.new_values === 'string' ? JSON.parse(audit.new_values) : audit.new_values;
    expect(details).toMatchObject({ threadId: 'th_del', ownerUserId: USERS.owner.id, messagesDeleted: 2, turnRecordsRetained: 1 });
    const kept = (await holder.pg.query(`SELECT count(*)::int AS n FROM ana_turn_records WHERE thread_id = 'th_del'`)).rows[0].n;
    expect(kept).toBe(1);
  });

  it('refuses a colleague, and removes nothing', async () => {
    await seedThread('th_mine', USERS.owner.id);
    expect(await deleteConversation({ threadId: 'th_mine', organizationId: ORG, userId: USERS.colleague.id })).toEqual({ status: 'forbidden' });
    expect(await threadExists('th_mine')).toBe(true);
  });

  it('removes nothing when the audit row cannot be written', async () => {
    await seedThread('th_keep', USERS.owner.id);
    holder.failOn = /INSERT INTO audit_logs/;
    await expect(deleteConversation({ threadId: 'th_keep', organizationId: ORG, userId: USERS.owner.id })).rejects.toThrow();
    holder.failOn = null;
    expect(await threadExists('th_keep')).toBe(true);
    expect((await holder.pg.query(`SELECT count(*)::int AS n FROM chat_messages WHERE thread_id = 'th_keep'`)).rows[0].n).toBe(2);
  });
});

// Last: a forged chain row breaks the tenant's chain for good, as it should,
// and every export after it would say so.
describe('a forger who rewrites the chain row too', () => {
  // Rewrite the record AND its chain row's details to carry the forged hash.
  async function forgeRecordAndChain(id: string) {
    const forged = new TurnRecorder();
    forged.setTurn({ organizationId: ORG, threadId: 'th_live', actorUserId: USERS.owner.id });
    forged.setRequest('a question nobody asked');
    const sealed = forged.seal('answered');
    for (const [sha, text] of sealed.blobs) {
      await holder.pg.query(
        `INSERT INTO ana_record_blobs (organization_id, sha256, text, chars) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [ORG, sha, text, text.length],
      );
    }
    await holder.pg.exec(`ALTER TABLE ana_turn_records DISABLE TRIGGER trg_ana_turn_records_append_only`);
    await holder.pg.query(`UPDATE ana_turn_records SET record_text = $1, record_sha256 = $2 WHERE id = $3`, [sealed.text, sealed.sha256, id]);
    await holder.pg.exec(`ALTER TABLE ana_turn_records ENABLE TRIGGER trg_ana_turn_records_append_only`);
    const row = (await holder.pg.query(`SELECT id, new_values FROM audit_logs WHERE action = 'ana.turn.recorded' AND record_id = $1`, [id])).rows[0];
    const details = typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values;
    const forgedDetails = { ...details, recordSha256: sealed.sha256 };
    await holder.pg.query(`UPDATE audit_logs SET new_values = $1::json WHERE id = $2`, [JSON.stringify(forgedDetails), row.id]);
    return { auditId: row.id, forgedDetails };
  }

  it('is caught by the payload hash the chain link was computed over', async () => {
    const { id } = await recordTurn('the real question');
    await forgeRecordAndChain(id);
    const res = await request(appAs()).get(`/api/ana-ri/turn-records/${id}`).set('x-as', 'owner');
    expect(res.body.data.verdict.chainCarriesHash).toBe(true);
    expect(res.body.data.verdict.chainPayloadIntact).toBe(false);
    expect(res.body.data.verdict.ok).toBe(false);
  });

  it('and, when the payload hash is rewritten as well, by the walk of the tenant chain', async () => {
    const { id } = await recordTurn('the real question, again');
    const { auditId, forgedDetails } = await forgeRecordAndChain(id);
    await holder.pg.query(`UPDATE audit_logs SET payload_hash = $1 WHERE id = $2`, [sha256Hex(JSON.stringify(forgedDetails)), auditId]);
    const read = await request(appAs()).get(`/api/ana-ri/turn-records/${id}`).set('x-as', 'owner');
    // Every per-record check now agrees with the forgery...
    expect(read.body.data.verdict.ok).toBe(true);
    // ...and the chain does not: the link was computed over the original payload.
    const exported = await request(appAs()).get(`/api/ana-ri/turn-records/${id}/export`).set('x-as', 'admin');
    expect(JSON.parse(exported.text).tenantChain.ok).toBe(false);
  });
});
