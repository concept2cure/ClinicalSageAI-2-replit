/**
 * recordGovernedAction — END-TO-END against a real (in-process PGlite) Postgres.
 *
 * recordGovernedAction is the single ledger primitive the whole governed surface
 * shares: every governed UI/AnA mutation (the six universal mutations in
 * writeMutation, the domain endpoints, the AnA tool executor, AND the canonical
 * document spine's commitCanonicalRevision) calls it to write, in ONE
 * transaction, a c2c_ana_actions row + an audit_logs sha256-chain row.
 *
 * Unit tests mock the DB, and the existing audit-integrity PGlite test seeds the
 * chain with a hand-built 8-column INSERT — so nothing proved the REAL
 * recordGovernedAction (its 16-column audit_logs INSERT + 18-column
 * c2c_ana_actions INSERT, the backlink between the two rows, and the atomic
 * commit/rollback of the pair) against a real Postgres engine. This closes that
 * seam.
 *
 * It is ALSO the regression guard for the c2c_ana_actions command-vocabulary
 * defect (migration 20260730_c2c_ana_actions_command_vocab.sql): the original
 * `command` CHECK enumerated only the six universal mutations + reverses, so the
 * domain verbs the platform actually passes — 'update'/'reaffirm' (spine),
 * 'create'/'delete'/'assign'/'approve'/'review' (governed routes + AnA tools),
 * 'transmittal_rollback' (FDA-ESG) — raised check_violation (23514) and rolled
 * back the whole governed transaction. This test writes those verbs through the
 * real recordGovernedAction against the corrected schema and asserts they land.
 *
 * PGlite is pure-WASM Postgres — no server, no docker, no cloud.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { recordGovernedAction } from '../actions.js';
import { verifyAuditChain, type PoolClient } from '../../../services/audit/chain.js';

// The REAL fix migration under test. Applying it (rather than hard-coding the
// post-migration DDL) means this test genuinely consumes the migration: revert
// the DROP and the domain-verb cases below fail, exactly as production would.
const COMMAND_VOCAB_MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../../../db/migrations/20260730_c2c_ana_actions_command_vocab.sql'),
  'utf8',
);

// audit_logs — the FULL governed column set recordGovernedAction writes (mirrors
// scripts/db-verify/00_bootstrap_base.sql + migration 20260527/20260609).
const AUDIT_LOGS_DDL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  tenant_id    INTEGER,
  user_id      INTEGER,
  action       TEXT,
  table_name   TEXT,
  record_id    TEXT,
  actor_id     INTEGER,
  target       TEXT,
  target_type  TEXT,
  target_id    TEXT,
  reason       TEXT,
  payload_hash TEXT,
  ana_action_id TEXT,
  sha256_chain TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hmac_seal    TEXT,
  old_values   JSON,
  new_values   JSON,
  ip_address   TEXT,
  user_agent   TEXT
);
`;

// c2c_ana_actions EXACTLY as migrations/20260527_mutation_primitives.sql creates
// it — WITH the original narrow `command` allow-list. beforeEach then applies the
// real 20260730 migration on top, so the test starts from the pre-fix schema and
// proves the migration removes the barrier.
const ANA_ACTIONS_ORIGINAL_DDL = `
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id              TEXT PRIMARY KEY,
  org_id          INTEGER NOT NULL,
  conversation_id TEXT,
  domain          TEXT NOT NULL,
  surface         TEXT NOT NULL,
  command         TEXT NOT NULL,
  target          TEXT NOT NULL,
  risk            TEXT NOT NULL DEFAULT 'low',
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode    TEXT NOT NULL DEFAULT 'suggest',
  state           TEXT NOT NULL DEFAULT 'proposed',
  proposed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_by     INTEGER NOT NULL,
  decided_at      TIMESTAMPTZ,
  decided_by      INTEGER,
  decision_reason TEXT,
  executed_at     TIMESTAMPTZ,
  audit_row_id    UUID,
  idempotency_key TEXT UNIQUE,
  CONSTRAINT c2c_ana_actions_command_check
    CHECK (command IN ('claim','transition','resolve','sign','accept-ai-suggestion','lock',
                       'unclaim','transition-back','reopen','revoke-signature','reject-ai-suggestion','unlock')),
  CONSTRAINT c2c_ana_actions_risk_check  CHECK (risk IN ('low','med','high')),
  CONSTRAINT c2c_ana_actions_state_check CHECK (state IN ('proposed','approved','modified','skipped','executed','failed','reversed')),
  CONSTRAINT c2c_ana_actions_mode_check  CHECK (agentic_mode IN ('suggest','act_without_asking'))
);
`;

let pg: PGlite;
// A node-pg-compatible client over the single PGlite connection, so
// recordGovernedAction + computeAuditChainSealed (SELECT ... FOR UPDATE) and the
// surrounding BEGIN/COMMIT all run on the same session.
let client: PoolClient & { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const base = { orgId: 7, userId: 42, target: 'artifact:art_123', reason: 'AnA revised the Clinical Overview (v2)' };

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_DDL);
  await pg.exec(ANA_ACTIONS_ORIGINAL_DDL); // pre-fix: narrow command CHECK
  await pg.exec(COMMAND_VOCAB_MIGRATION);  // the real migration under test
  client = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }> };
});
afterEach(async () => {
  await pg.close();
});

describe('recordGovernedAction against real Postgres', () => {
  it('writes BOTH the c2c_ana_actions row and the audit_logs row, mutually backlinked', async () => {
    const r = await recordGovernedAction(client, { ...base, command: 'update', domain: 'authoring', surface: 'ana' });

    const action = (await pg.query(`SELECT * FROM c2c_ana_actions WHERE id = $1`, [r.actionId])).rows[0] as any;
    const audit = (await pg.query(`SELECT * FROM audit_logs WHERE id = $1`, [r.auditId])).rows[0] as any;

    expect(action).toBeTruthy();
    expect(audit).toBeTruthy();
    // Backlink both ways: the audit row names the action, the action names the audit row.
    expect(audit.ana_action_id).toBe(r.actionId);
    expect(String(action.audit_row_id)).toBe(r.auditId);
    // The action's audit-facing fields are consistent.
    expect(audit.action).toBe('c2c.work.update');
    expect(action.state).toBe('executed');
    expect(action.org_id).toBe(7);
    expect(audit.tenant_id).toBe(7);
  });

  // Regression guard for 20260730_c2c_ana_actions_command_vocab.sql: each of
  // these verbs raised check_violation (23514) under the original narrow CHECK.
  it.each(['update', 'reaffirm', 'create', 'delete', 'assign', 'approve', 'review', 'transmittal_rollback'])(
    "accepts the domain command %s (was rejected by the pre-migration CHECK)",
    async (command) => {
      const r = await recordGovernedAction(client, { ...base, command });
      const row = (await pg.query(`SELECT command FROM c2c_ana_actions WHERE id = $1`, [r.actionId])).rows[0] as any;
      expect(row.command).toBe(command);
    },
  );

  it('chains successive governed actions and verifyAuditChain confirms integrity', async () => {
    await recordGovernedAction(client, { ...base, command: 'create' });
    await recordGovernedAction(client, { ...base, command: 'update' });

    const verdict = await verifyAuditChain(client);
    expect(verdict.ok).toBe(true);
    expect(verdict.rowsChecked).toBe(2);
  });

  it('produces a chain a later tamper breaks (verifyAuditChain catches it)', async () => {
    const first = await recordGovernedAction(client, { ...base, command: 'create' });
    await recordGovernedAction(client, { ...base, command: 'update' });

    // Tamper: alter a CHAINED field (target) on the first governed audit row.
    // (reason is deliberately NOT hash-bound, so editing it would not break the
    // chain — the chain protects action/actor_id/target/payload_hash/occurred_at.)
    await pg.query(`UPDATE audit_logs SET target = 'artifact:TAMPERED' WHERE id = $1`, [first.auditId]);

    const verdict = await verifyAuditChain(client);
    expect(verdict.ok).toBe(false);
    expect(verdict.brokenAt?.id).toBe(first.auditId);
  });

  it('records both rows ATOMICALLY — a rolled-back transaction persists neither', async () => {
    await client.query('BEGIN');
    await recordGovernedAction(client, { ...base, command: 'update' });
    await client.query('ROLLBACK');

    const actions = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    const audits = (await pg.query(`SELECT count(*)::int AS n FROM audit_logs`)).rows[0] as { n: number };
    expect(actions.n).toBe(0);
    expect(audits.n).toBe(0);
  });

  it('commits both rows together when the transaction commits', async () => {
    await client.query('BEGIN');
    const r = await recordGovernedAction(client, { ...base, command: 'update' });
    await client.query('COMMIT');

    const actions = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    const audits = (await pg.query(`SELECT count(*)::int AS n FROM audit_logs`)).rows[0] as { n: number };
    expect(actions.n).toBe(1);
    expect(audits.n).toBe(1);
    expect(r.sha256Chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('classifies risk from the command and hashes the payload into audit_logs', async () => {
    const high = await recordGovernedAction(client, { ...base, command: 'sign', payload: { a: 1 } });
    const low = await recordGovernedAction(client, { ...base, command: 'update', payload: { a: 1 } });

    const hi = (await pg.query(`SELECT risk, payload FROM c2c_ana_actions WHERE id = $1`, [high.actionId])).rows[0] as any;
    const lo = (await pg.query(`SELECT risk FROM c2c_ana_actions WHERE id = $1`, [low.actionId])).rows[0] as any;
    expect(hi.risk).toBe('high');       // 'sign' is a HIGH_RISK_COMMANDS member
    expect(lo.risk).toBe('low');        // domain verb defaults to low
    expect(hi.payload).toEqual({ a: 1 }); // jsonb round-trips

    // Identical payloads → identical payload_hash on the audit rows.
    const h1 = (await pg.query(`SELECT payload_hash FROM audit_logs WHERE id = $1`, [high.auditId])).rows[0] as any;
    const h2 = (await pg.query(`SELECT payload_hash FROM audit_logs WHERE id = $1`, [low.auditId])).rows[0] as any;
    expect(h1.payload_hash).toBe(h2.payload_hash);
  });

  it('still refuses an empty command (the drift-proof length bound is live)', async () => {
    await expect(recordGovernedAction(client, { ...base, command: '' })).rejects.toThrow();
  });
});
