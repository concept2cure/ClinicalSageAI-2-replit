/**
 * The one audit_events walk, against a real Postgres running the real trigger.
 *
 * The unit tests build chains with the module's own hash function, which
 * proves the walk is self-consistent and nothing more. What makes it CORRECT
 * is that its preimage equals what the trigger hashed, and that rests on
 * Postgres' rendering of `timestamp without time zone`::text. So this installs
 * db/migrations/20260222_audit_events_hash_chain.sql verbatim, lets the trigger
 * hash rows, selects them with the module's canonical columns and walks them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AUDIT_EVENT_CHAIN_COLUMNS,
  AUDIT_EVENT_CHAIN_ORDER,
  auditEventChainVerdict,
  walkAuditEventChain,
  type AuditEventChainRow,
} from '../audit-event-chain';

let pg: PGlite;

async function insert(org: number, n: number, stamp?: string): Promise<void> {
  for (let i = 0; i < n; i++) {
    await pg.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, "timestamp", reason, new_values)
       VALUES ($1, 'document.approved', 'document', $2, 7, 'A. Rivera', COALESCE($3::timestamp, now()), $4, '{"status":"approved"}')`,
      [org, 100 + i, stamp ?? null, i === 0 ? null : `step ${i}`],
    );
  }
}

async function walk(org?: number) {
  const { rows } = await pg.query(
    `SELECT ${AUDIT_EVENT_CHAIN_COLUMNS} FROM audit_events
      ${org === undefined ? '' : 'WHERE organization_id = $1'}
      ORDER BY ${AUDIT_EVENT_CHAIN_ORDER}`,
    org === undefined ? [] : [org],
  );
  return walkAuditEventChain(rows as AuditEventChainRow[]);
}

beforeAll(async () => {
  pg = new PGlite();
  // audit_events as migrations/0000_sweet_joseph.sql creates it: `timestamp` is
  // WITHOUT time zone, which is the whole reason the text must come from SQL.
  await pg.exec(`CREATE TABLE audit_events (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL,
    event_type VARCHAR(100) NOT NULL, entity_type VARCHAR(100) NOT NULL, entity_id INTEGER NOT NULL,
    user_id INTEGER, user_name TEXT NOT NULL, user_role TEXT, session_id TEXT, ip_address TEXT,
    "timestamp" TIMESTAMP NOT NULL DEFAULT now(), old_values JSON, new_values JSON, changed_fields JSON,
    reason TEXT, comments TEXT, metadata JSON, created_at TIMESTAMP NOT NULL DEFAULT now());`);
  await pg.exec(fs.readFileSync(path.join(process.cwd(), 'db/migrations/20260222_audit_events_hash_chain.sql'), 'utf8'));
}, 60_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM audit_events'); });

describe('rows the trigger wrote verify', () => {
  it('with now(), microseconds and all', async () => {
    await insert(1, 4);
    const w = await walk(1);
    expect(w.breaks, 'a row the trigger hashed did not re-derive').toEqual([]);
    expect(w).toMatchObject({ rowsSeen: 4, hashedRows: 4, verifiedRows: 4, unhashedRows: 0, unlinkedRows: 0 });
    expect(auditEventChainVerdict(w)).toBe('intact');
  });

  it('across the timestamp shapes Postgres renders differently', async () => {
    for (const stamp of [
      '2026-08-14 09:00:00',         // no fractional part
      '2026-08-14 09:00:00.100000',  // rendered as .1
      '2026-08-14 09:00:00.123',
      '2026-08-14 09:00:00.000001',
      '2026-12-31 23:59:59.999999',
    ]) {
      await pg.exec('DELETE FROM audit_events');
      await insert(1, 2, stamp);
      const w = await walk(1);
      expect(w.breaks, `timestamp ${stamp} did not re-derive`).toEqual([]);
      expect(w.verifiedRows).toBe(2);
    }
  });

  it("each organisation's chain on its own", async () => {
    await insert(1, 2);
    await insert(2, 3);
    const all = await walk();
    expect(all.verifiedRows).toBe(5);
    expect(all.breaks, "one organisation's first row was read as a break in another's chain").toEqual([]);
  });
});

describe('what the walk catches in a written chain', () => {
  it('a covered field altered in place', async () => {
    await insert(1, 3);
    await pg.query(`UPDATE audit_events SET reason = 'back-dated after the fact' WHERE sequence_number = 2`);
    const w = await walk(1);
    expect(w.breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['content', 2]]);
    expect(w.verifiedRows).toBe(2);
  });

  it('a timestamp moved by one microsecond', async () => {
    await insert(1, 2);
    await pg.query(`UPDATE audit_events SET "timestamp" = "timestamp" + interval '1 microsecond' WHERE sequence_number = 1`);
    expect((await walk(1)).breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['content', 1]]);
  });

  it('a removed entry', async () => {
    await insert(1, 4);
    await pg.query(`DELETE FROM audit_events WHERE sequence_number = 2`);
    expect((await walk(1)).breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['pointer', 3]]);
  });

  /* The hole every pointer-only copy shared: remove an entry and blank its
     successor's pointer, and the comparison was skipped for the null. */
  it('a removed entry hidden by blanking its successor\'s pointer', async () => {
    await insert(1, 3);
    await pg.query(`DELETE FROM audit_events WHERE sequence_number = 2`);
    await pg.query(`UPDATE audit_events SET previous_hash = NULL WHERE sequence_number = 3`);
    const w = await walk(1);
    expect(auditEventChainVerdict(w), 'a blanked pointer hid a removed entry').toBe('broken');
    expect(w.breaks.map(b => [b.kind, b.sequenceNumber])).toEqual([['content', 3]]);
  });
});

describe('what the hash does not cover stays unclaimed', () => {
  /* Stated in the module header and in every sentence it prints: the trigger's
     recipe does not include the before and after values. This pins the fact the
     wording rests on, so the wording is not softened by someone who assumes the
     hash covers the row. */
  it('an edited after-value still re-derives, because the recipe never hashed it', async () => {
    await insert(1, 2);
    await pg.query(`UPDATE audit_events SET new_values = '{"status":"rejected"}' WHERE sequence_number = 2`);
    const w = await walk(1);
    expect(w.breaks).toEqual([]);
    expect(w.verifiedRows).toBe(2);
  });
});

describe('rows written before the trigger', () => {
  it('are counted unhashed, and the trigger-written row after them is not accused', async () => {
    await pg.exec('ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_hash_chain');
    await pg.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, sequence_number)
       VALUES (1, 'legacy', 'document', 1, 'A. Rivera', 1)`);
    await pg.exec('ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_hash_chain');
    await insert(1, 2);
    const w = await walk(1);
    expect(w).toMatchObject({ rowsSeen: 3, unhashedRows: 1, hashedRows: 2, verifiedRows: 2, unlinkedRows: 0 });
    expect(w.breaks).toEqual([]);
    expect(auditEventChainVerdict(w)).toBe('unverified');
  });
});
