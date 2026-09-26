/**
 * AnA's turn record on a real Postgres engine (PGlite): the migration, the
 * writer and the verifier together.
 *
 * What an inspector relies on, each shown here as the engine's behaviour, not
 * the application's promise:
 *   - a record, its texts and its chained audit row commit together or not at
 *     all;
 *   - UPDATE, DELETE and TRUNCATE are refused on both tables, for the owner too;
 *   - a record or a text stored under a hash that is not its own is refused;
 *   - someone who disables the triggers and rewrites a record, keeping every
 *     hash consistent, is still caught — the tenant chain carries the original
 *     hash.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { TurnRecorder, sha256Hex, writeTurnRecord, TURN_RECORD_AUDIT_ACTION } from '../turn-record';
import { verifyTurnRecord } from '../turn-record-verify';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const CHAIN_SEQ = path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql');
const TURN_RECORDS = path.join(ROOT, 'migrations/20260926_ana_turn_records.sql');
const ORG = 61;

let pg: PGlite;
/** A pool whose one client is the PGlite session; `failOn` makes one statement throw. */
const poolOf = (failOn?: RegExp) => ({
  connect: async () => ({
    query: async (sql: string, params?: unknown[]) => {
      if (failOn && failOn.test(sql)) throw new Error('simulated failure');
      return pg.query(sql, params as unknown[]) as Promise<{ rows: any[] }>;
    },
    release: () => undefined,
  }),
});

function sampleTurn(question = 'Summarise the primary endpoint') {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: ORG, threadId: 'th_1', runId: 'run_1', actorUserId: 7, projectId: 'p1', surface: 'conversation' });
  r.setRequest(question, question);
  r.setModelInput([
    { role: 'system', content: 'You are AnA.' },
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'earlier answer' },
    {
      role: 'user',
      content: 'Read the attached document "Protocol.pdf" and use it to answer.',
      contentBlocks: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.7 bytes').toString('base64') }, title: 'Protocol.pdf' },
        { type: 'text', text: 'Attached document: Protocol.pdf' },
      ],
    },
    { role: 'user', content: question },
  ]);
  r.setContext(
    {
      type: 'context_used',
      uploads: [{ fileId: 'f1', fileName: 'Protocol.pdf', mimeType: 'application/pdf', read: 'content' }],
      unresolvedUploads: 0,
      memory: [{ layer: 'project_memory', title: 'Estimand decision' }],
      memoryStatus: 'read',
    } as never,
    new Map([['f1', 'a'.repeat(64)]]),
  );
  r.setModel({ provider: 'anthropic', model: 'model-x', effort: 'balanced' });
  r.addServed(1, { provider: 'anthropic', model: 'model-x' });
  r.addPlan(1, [{ title: 'Read the protocol', status: 'in_progress' }]);
  r.addStep({ round: 1, tool: 'project_knowledge_search', label: 'Searching', status: 'success', latencyMs: 12, input: { query: 'primary endpoint' }, result: '{"hits":2}' });
  r.setAnswer({ streamed: 'PFS at 12 months.', stored: 'PFS at 12 months.' });
  return r;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(CHAIN_SEQ, 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  // Applied twice: every deploy replays the set (CLAUDE.md RULE 1).
  await pg.exec(fs.readFileSync(TURN_RECORDS, 'utf8'));
  await pg.exec(fs.readFileSync(TURN_RECORDS, 'utf8'));
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY;
});

async function counts() {
  const rec = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ana_turn_records`);
  const blobs = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ana_record_blobs`);
  const chain = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs WHERE action = $1`, [TURN_RECORD_AUDIT_ACTION]);
  return { records: rec.rows[0].n, blobs: blobs.rows[0].n, chain: chain.rows[0].n };
}

async function readBack(id: string) {
  const row = (await pg.query<any>(`SELECT record_text, record_sha256 FROM ana_turn_records WHERE id = $1`, [id])).rows[0];
  const chain = (await pg.query<any>(`SELECT new_values FROM audit_logs WHERE action = $1 AND record_id = $2`, [TURN_RECORD_AUDIT_ACTION, id])).rows[0];
  const texts = new Map<string, string>(
    (await pg.query<any>(`SELECT sha256, text FROM ana_record_blobs WHERE organization_id = $1`, [ORG])).rows.map((b) => [b.sha256, b.text]),
  );
  const details = chain ? (typeof chain.new_values === 'string' ? JSON.parse(chain.new_values) : chain.new_values) : null;
  return { row, details, texts };
}

describe('a turn record is written whole, or not at all', () => {
  it('commits the record, every text it references and a chain row carrying its hash', async () => {
    const before = await counts();
    const sealed = sampleTurn().seal('answered');
    const { id, sha256 } = await writeTurnRecord(poolOf(), sealed);
    const after = await counts();
    expect(after.records - before.records).toBe(1);
    expect(after.chain - before.chain).toBe(1);
    expect(after.blobs - before.blobs).toBe(sealed.blobs.size);

    const { row, details, texts } = await readBack(id);
    expect(row.record_sha256).toBe(sha256);
    expect(details.recordSha256).toBe(sha256);
    expect(verifyTurnRecord({ recordText: row.record_text, recordSha256: row.record_sha256, chainDetails: details, texts }).ok).toBe(true);
  });

  it('leaves nothing behind when the chain write fails', async () => {
    const before = await counts();
    await expect(writeTurnRecord(poolOf(/INSERT INTO audit_logs/), sampleTurn('a failing turn').seal('answered'))).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it('stores a repeated text once — turn 40 references the history, it does not copy it', async () => {
    const before = await counts();
    await writeTurnRecord(poolOf(), sampleTurn().seal('answered'));
    const after = await counts();
    expect(after.records - before.records).toBe(1);
    // Every text of an identical turn is already there.
    expect(after.blobs - before.blobs).toBe(0);
  });
});

describe('the engine refuses to change a record', () => {
  it.each([
    [`UPDATE ana_turn_records SET outcome = 'failed'`],
    [`DELETE FROM ana_turn_records`],
    [`TRUNCATE ana_turn_records`],
    [`UPDATE ana_record_blobs SET chars = 0`],
    [`DELETE FROM ana_record_blobs`],
    [`TRUNCATE ana_record_blobs`],
  ])('%s', async (sql) => {
    await writeTurnRecord(poolOf(), sampleTurn('something to protect').seal('answered'));
    await expect(pg.exec(sql)).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('refuses a record or a text stored under a hash that is not its own', async () => {
    await expect(
      pg.query(
        `INSERT INTO ana_turn_records (organization_id, outcome, started_at, ended_at, schema_version, record_text, record_sha256)
         VALUES ($1, 'answered', now(), now(), 'x', '{"a":1}', $2)`,
        [ORG, sha256Hex('{"a":2}')],
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      pg.query(`INSERT INTO ana_record_blobs (organization_id, sha256, text, chars) VALUES ($1, $2, 'real', 4)`, [ORG, sha256Hex('forged')]),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('tampering is caught even past the triggers', () => {
  it('a record rewritten with a consistent hash no longer matches the chain', async () => {
    const { id } = await writeTurnRecord(poolOf(), sampleTurn('the original question').seal('answered'));
    // The owner can disable a trigger; the startup check and daily sweep exist to notice.
    // Here the rewrite is made self-consistent, so only the chain can tell.
    const forged = sampleTurn('a question nobody asked').seal('answered');
    for (const [sha, text] of forged.blobs) {
      await pg.query(`INSERT INTO ana_record_blobs (organization_id, sha256, text, chars) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [ORG, sha, text, text.length]);
    }
    await pg.exec(`ALTER TABLE ana_turn_records DISABLE TRIGGER trg_ana_turn_records_append_only`);
    await pg.query(`UPDATE ana_turn_records SET record_text = $1, record_sha256 = $2 WHERE id = $3`, [forged.text, forged.sha256, id]);
    await pg.exec(`ALTER TABLE ana_turn_records ENABLE TRIGGER trg_ana_turn_records_append_only`);

    const { row, details, texts } = await readBack(id);
    const verdict = verifyTurnRecord({ recordText: row.record_text, recordSha256: row.record_sha256, chainDetails: details, texts });
    expect(verdict.recordIntact).toBe(true);
    expect(verdict.textsIntact).toBe(true);
    expect(verdict.chainCarriesHash).toBe(false);
    expect(verdict.ok).toBe(false);
  });

  it('a text that is missing is named', async () => {
    const sealed = sampleTurn('a record whose text goes missing').seal('answered');
    const texts = new Map(sealed.blobs);
    const question = sealed.body.request.typed.sha256;
    texts.delete(question);
    const verdict = verifyTurnRecord({ recordText: sealed.text, recordSha256: sealed.sha256, chainDetails: { recordSha256: sealed.sha256 }, texts });
    expect(verdict.missingTexts).toEqual([question]);
    expect(verdict.ok).toBe(false);
  });
});

describe('what the record will not claim', () => {
  it('controls that could not be read are recorded as unknown, not as none', () => {
    const unread = sampleTurn();
    unread.setControls(undefined);
    const body = unread.seal('stopped').body;
    expect(body.controls).toBeNull();
    expect(body.warnings.join(' ')).toMatch(/could not be read/);

    const none = sampleTurn();
    none.setControls([]);
    expect(none.seal('answered').body.controls).toEqual([]);
  });

  it('numbers model calls in order, and gives each later call the input staged for it', () => {
    const r = new TurnRecorder();
    r.setTurn({ organizationId: ORG });
    r.setRequest('q');
    r.addServed(1, { provider: 'anthropic', model: 'm' });
    r.addRoundInput(1, [{ role: 'user', content: 'results of round 1' }]);
    r.addServed(1, { provider: 'anthropic', model: null });
    const body = r.seal('answered').body;
    expect(body.model.calls).toEqual([
      { call: 1, round: 1, provider: 'anthropic', model: 'm' },
      // A call whose model the gateway did not report is still a call.
      { call: 2, round: 1, provider: 'anthropic', model: null },
    ]);
    expect(body.roundInputs.map((x) => x.call)).toEqual([2]);
  });
});
