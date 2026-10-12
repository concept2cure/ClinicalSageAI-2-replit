/**
 * What a turn record says SERVED it, without checking any words against it
 * (AnA reasoning round 15, SEC-A-7's server doors).
 *
 * ── Why this exists, and why it is not `verifyMachineText` ──────────────────
 * Three server doors have to apply the governed-write rule — the section save,
 * `POST /docs/from-draft` and the section revert — and each needs the same one
 * fact: which models served the turn this content came from, and what RULE 2
 * says of each. `verifyMachineText` already reads a record and computes that,
 * but it cannot be reused as-is: it requires the TEXT to verify, and only one
 * of the three doors has text to offer. `from-draft` hands over a whole
 * document the model wrote; nothing in it is a quotable claim about a span.
 *
 * So the model check and the text check are separable, and this is the model
 * half: one function, reusing `verifyMachineText`'s own record reader, so
 * there is still one implementation of "read a record and say what served it".
 * A door that also has text to check keeps calling `verifyMachineText`.
 *
 * Fail closed is the caller's job, and the shape makes it hard to get wrong: a
 * record naming NO model returns an empty list rather than an error, because
 * "the record names no model" is a fact about the record, not a failure to read
 * it — and an empty list is not a list of approved models.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { openTurnRecorder, writeTurnRecordSafely } from '../../ana/turn-record';
import { servedModelsForTurn } from '../authoring-record';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 71;
const OTHER_ORG = 72;

const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };

let pg: PGlite;
const q = {
  query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]) as Promise<{ rows: any[] }>,
};
const pool = {
  connect: async () => ({ ...q, release: () => undefined }),
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });

/** A filed turn served by the given models, and the id it was filed under. */
async function filedTurn(served: Array<{ provider: string; model: string }>, orgId = ORG): Promise<string> {
  const r = openTurnRecorder({ orgId, userId: 7, typed: 'Draft the efficacy overview for 2.5.4' })!;
  r.setAnswer({ streamed: 'The primary endpoint was met.', stored: 'The primary endpoint was met.' });
  if (served[0]) r.setModel(served[0]);
  served.forEach((s, i) => r.addServed(i + 1, s));
  const status = await writeTurnRecordSafely(pool, r, 'answered');
  if (status.status !== 'recorded') throw new Error('the fixture turn was not filed: ' + status.status);
  return status.id;
}

describe('servedModelsForTurn — the model half of the record check', () => {
  it('names every model that served the turn, each with RULE 2’s verdict', async () => {
    const id = await filedTurn([OPUS, SONNET]);
    const out = await servedModelsForTurn(q, ORG, id);
    expect(out.ok).toBe(true);
    expect(out.ok && out.turnRecordId).toBe(id);
    /* Outside production RULE 2 admits a PQ-pending model that is approved for
       high-risk drafting, and admits no model that is not. */
    expect(out.ok && out.servedBy).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' },
      { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' },
    ]);
    /* The verdict a door acts on: one unqualified model is enough to refuse. */
    expect(out.ok && out.servedBy.some((m) => m.model === null || !m.qualified)).toBe(true);
  });

  it('admits a turn every one of whose models the rule allows (negative control)', async () => {
    const id = await filedTurn([OPUS]);
    const out = await servedModelsForTurn(q, ORG, id);
    expect(out.ok && out.servedBy).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' },
    ]);
    expect(out.ok && out.servedBy.some((m) => m.model === null || !m.qualified)).toBe(false);
  });

  it('a record that names no model returns an empty list, not an error', async () => {
    /* The distinction the honest-state rule turns on: "the record names no
       model" is a fact ABOUT the record, which a door must refuse on; it is not
       a failure to read the record, which is a different sentence. An empty
       list is not a list of approved models, and the `.some()` test above
       reports nothing to refuse — so the door's rule must treat empty as
       unapproved in its own right. The next test pins that. */
    const id = await filedTurn([]);
    const out = await servedModelsForTurn(q, ORG, id);
    expect(out.ok).toBe(true);
    expect(out.ok && out.servedBy).toEqual([]);
  });

  it('an empty list is not approval: a door reading only `.some(unqualified)` would admit it', async () => {
    const id = await filedTurn([]);
    const out = await servedModelsForTurn(q, ORG, id);
    /* This is the trap, written down: `[].some(...)` is false, so a door that
       asks only "is any model unqualified?" admits a turn whose record names
       NO model at all. Every door must require a non-empty list as well. The
       client gate already does (anaInsertGate.ts: `served.length === 0`). */
    expect(out.ok && out.servedBy.some((m) => !m.qualified)).toBe(false);
    expect(out.ok && out.servedBy.length === 0).toBe(true);
  });

  it('refuses an id that is not a record id, without touching the store', async () => {
    for (const bad of ['', '   ', 'turn_7', 'not-a-uuid', '../../etc/passwd']) {
      const out = await servedModelsForTurn(q, ORG, bad);
      expect(out.ok).toBe(false);
      expect(out.ok === false && out.reason).toBe(bad.trim() ? 'malformed_turn_record_id' : 'no_turn_record_id');
    }
  });

  it('refuses a record of another organisation: a turn id is not a capability', async () => {
    const id = await filedTurn([OPUS], OTHER_ORG);
    const out = await servedModelsForTurn(q, ORG, id);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toBe('turn_record_not_found');
    /* And it IS readable in its own organisation, so the refusal above is the
       tenant check and not a broken fixture. */
    expect((await servedModelsForTurn(q, OTHER_ORG, id)).ok).toBe(true);
  });

  it('refuses a record that no longer verifies whole', async () => {
    /* The chain row carrying the record's hash is gone, so the record is no
       longer what the tenant's audit chain says was written. The same way the
       batch-draft suite makes a record un-intact — the store itself cannot be
       tampered with: `ana_turn_records` is append-only by trigger AND a table
       CHECK enforces record_sha256 = sha256(record_text), so a mismatched pair
       cannot be inserted at all. */
    const id = await filedTurn([OPUS]);
    expect((await servedModelsForTurn(q, ORG, id)).ok).toBe(true);
    await pg.query(`DELETE FROM audit_logs WHERE record_id = $1`, [id]);
    const out = await servedModelsForTurn(q, ORG, id);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toBe('record_not_intact');
    /* The reason is the one an inspector reads, not an internal token. */
    expect(out.ok === false && out.why).toBe('the turn record does not verify');
  });

  it('refuses a record id that names nothing', async () => {
    const out = await servedModelsForTurn(q, ORG, '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toBe('turn_record_not_found');
  });
});
