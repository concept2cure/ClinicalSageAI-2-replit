/**
 * A filed turn tells the client which models wrote it, and what RULE 2 says
 * of each (AnA reasoning round 11, GRD-missed, 2026-10-05).
 *
 * The client's insert of an AnA answer into a document is refused for an
 * answer a model may not write governed content with (the governed-write
 * rule, approved-models.ts isServedModelApprovedForHighRisk). The client can
 * apply that rule only to what the server tells it, so the status the stream
 * sends on `post_done` (writeTurnRecordSafely) names the record's served
 * models, read from the sealed record itself (turn-record-models.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { openTurnRecorder, writeTurnRecordSafely } from '../turn-record';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 62;

let pg: PGlite;
const pool = {
  connect: async () => ({
    query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]) as Promise<{ rows: any[] }>,
    release: () => undefined,
  }),
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });

const turn = () => {
  const r = openTurnRecorder({ orgId: ORG, userId: 7, typed: 'Draft the efficacy overview for 2.5.4' })!;
  r.setAnswer({ streamed: 'The primary endpoint was met.', stored: 'The primary endpoint was met.' });
  return r;
};

describe('the filed status names the models that wrote the turn', () => {
  it('every model that served a call, each with RULE 2’s verdict and the facts it rests on', async () => {
    const r = turn();
    r.setModel({ provider: 'anthropic', model: 'claude-opus-5-5' });
    r.addServed(1, { provider: 'anthropic', model: 'claude-opus-5-5' });
    r.addServed(2, { provider: 'anthropic', model: 'claude-sonnet-5' });
    const status = await writeTurnRecordSafely(pool, r, 'answered');
    expect(status.status).toBe('recorded');
    // Outside production RULE 2 admits a PQ-pending model approved for high-risk work.
    expect(status.status === 'recorded' && status.servedBy).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' },
      { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' },
    ]);
  });

  it('a turn whose record names no model says so: an empty list, which no reader may take as approved', async () => {
    const status = await writeTurnRecordSafely(pool, turn(), 'failed');
    expect(status.status === 'recorded' && status.servedBy).toEqual([]);
  });

  it('a turn that was not filed names no models (negative control: unchanged)', async () => {
    expect(await writeTurnRecordSafely(pool, null, 'answered')).toEqual({
      status: 'not_recorded',
      reason: 'This turn had no organization to file it under.',
    });
  });
});
