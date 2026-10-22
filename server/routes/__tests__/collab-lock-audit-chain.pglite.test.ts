/**
 * A section-lock event is recorded on the audit chain as a SEQUENCED row
 * (row D5, Part 11 §11.10(e): integrity of audit records).
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * auditLockEvent handed recordGovernedAction the POOL. That writer takes its
 * chain position with pg_advisory_xact_lock and announces it in a
 * transaction-local GUC (app.audit_chain_tenant) that the audit_logs BEFORE
 * INSERT trigger reads. Outside a transaction each statement is its own, so
 * both end before the INSERT runs — and the trigger, finding no announcement,
 * records the row as a pre-migration LEGACY row with chain_seq NULL.
 * server/services/audit/chain.ts states this as a MUST, verbatim.
 *
 * So every lock event since migrations/20260921_audit_logs_chain_seq.sql was a
 * "legacy" row: outside the sequenced chain, verified only by the weaker
 * either-predecessor rule, and never serialised against a concurrent writer.
 *
 * ── What this proves ──────────────────────────────────────────────────────────
 * The real migration and the real ledger writer on PGlite. The pool-style case
 * is kept as the control, so the suite shows the mechanism and not only the
 * fix: if writeLockEventTx ever loses its transaction, the sequenced case turns
 * into the control's result and fails.
 *
 * PGlite is one connection, so this proves sequencing, not the concurrent race;
 * that needs real Postgres (server/services/audit/__tests__/chain-concurrency.dbtest.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../services/ana-ri/__tests__/governed-action-ledger.fixture';
import { recordGovernedAction } from '../c2c/actions';
import { writeLockEventTx, type LockEvent } from '../realtime-collab';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ORG = 7;
let pg: PGlite;
const client = {
  query: async (text: string, params?: unknown[]) => ({ rows: (await pg.query(text, params as unknown[])).rows as any[] }),
};

const event = (documentId: string, over: Partial<LockEvent> = {}): LockEvent => ({
  tenantId: ORG, userId: 5, command: 'collab.lock_acquire', documentId, sectionId: 'sec-1', ...over,
});

async function rowFor(target: string) {
  const rows = (await pg.query<{ chain_seq: string | null; sha256_chain: string | null; tenant_id: number; reason: string | null }>(
    'SELECT chain_seq, sha256_chain, tenant_id, reason FROM audit_logs WHERE target = $1', [target])).rows;
  expect(rows, `exactly one audit row for ${target}`).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
});
afterAll(async () => { await pg.close(); });

describe('a section-lock event is a sequenced row on the audit chain', () => {
  it('CONTROL: written statement by statement, as the pool did it, the row is recorded as legacy', async () => {
    // No BEGIN: each statement autocommits, exactly as passing the pool did.
    await recordGovernedAction(client, {
      orgId: ORG, userId: 5, command: 'collab.lock_acquire', target: 'document:control:sec-1',
      reason: null, domain: 'collab', surface: 'realtime-collab-api',
    });
    const row = await rowFor('document:control:sec-1');
    expect(row.sha256_chain, 'the writer did compute a chain hash').toMatch(/^[0-9a-f]{64}$/);
    expect(row.chain_seq, 'yet the trigger recorded it as a pre-migration legacy row').toBeNull();
  });

  it('writeLockEventTx records it SEQUENCED: a chain position, taken in the same transaction', async () => {
    await writeLockEventTx(client, event('doc-a'));
    const row = await rowFor('document:doc-a:sec-1');
    expect(row.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(row.chain_seq, 'a lock event must hold a chain position, not be filed as legacy').not.toBeNull();
    expect(row.tenant_id).toBe(ORG);
  });

  it('consecutive lock events take consecutive positions', async () => {
    await writeLockEventTx(client, event('doc-b', { command: 'collab.lock_acquire' }));
    await writeLockEventTx(client, event('doc-b', { command: 'collab.lock_release', sectionId: 'sec-2' }));
    const a = Number((await rowFor('document:doc-b:sec-1')).chain_seq);
    const b = Number((await rowFor('document:doc-b:sec-2')).chain_seq);
    expect(b, 'the release follows the acquire on the chain').toBe(a + 1);
  });

  it('keeps the reason the person gave, and records none when none was given (D5)', async () => {
    await writeLockEventTx(client, event('doc-c', { command: 'collab.lock_takeover', reason: '  Author is on leave.  ' }));
    await writeLockEventTx(client, event('doc-c', { sectionId: 'sec-9' }));
    expect((await rowFor('document:doc-c:sec-1')).reason).toBe('Author is on leave.');
    expect((await rowFor('document:doc-c:sec-9')).reason).toBeNull();
  });

  it('a failed write rolls back: no half-written event, and the connection is usable afterwards', async () => {
    const before = Number((await pg.query<{ n: string }>('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n);
    const broken = {
      query: async (text: string, params?: unknown[]) => {
        if (/INSERT INTO c2c_ana_actions/i.test(text)) throw new Error('ledger refused the row');
        return client.query(text, params);
      },
    };
    await expect(writeLockEventTx(broken, event('doc-d'))).rejects.toThrow('ledger refused the row');
    const after = Number((await pg.query<{ n: string }>('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n);
    expect(after, 'the audit_logs row rolled back with the ledger row').toBe(before);
    const live = await pg.query<{ ok: number }>('SELECT 1 AS ok');
    expect(live.rows[0].ok, 'ROLLBACK left the connection out of the aborted transaction').toBe(1);
  });
});
