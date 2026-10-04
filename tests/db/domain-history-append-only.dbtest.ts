/**
 * The domain history tables and the authoring signature store are append-only
 * in the database (P1-24; security audit 2026-09-24 DP-15, DP-16; rows D5, D6).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * workflow_history, document_audit_logs, regulatory_audit_logs, c2c_ana_actions
 * and authoring_signatures carried no trigger at all. The runtime role holds
 * UPDATE and DELETE on every public table, so app_service — under RLS, in its
 * own tenant — could rewrite who approved a workflow step, what a governed
 * action did, or whose e-mail an authoring signature carries, and could delete
 * any of them; the owner could TRUNCATE them; and deleting a unified document,
 * a workflow or an AnA conversation cascaded into the history beneath it.
 * Measured at HEAD: docs/evidence/D6/2026-10-01-tranche-4/P1-24/red/.
 *
 * migrations/20261001_domain_history_append_only.sql installs a row trigger
 * (UPDATE, DELETE) and a statement trigger (TRUNCATE) on each. There is no
 * door: no code path updates or deletes these tables (census in the file's
 * header), so nothing is admitted.
 *
 * ── How it runs ──────────────────────────────────────────────────────────────
 * Writes and refused mutations go through the APPLICATION'S OWN POOL — the
 * runtime role (APP_DATABASE_URL, app_service) — inside the tenant scope a
 * request opens, with RLS on. Cascades and TRUNCATE run as the owner, inside a
 * transaction that is always rolled back, because no route deletes a parent and
 * the runtime role holds no TRUNCATE privilege. The migration is applied by this
 * file (it is idempotent, as the deploy requires). Every row carries this file's
 * probe tenant, and the cleanup touches nothing else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const ROOT = path.join(__dirname, '..', '..');
const MIGRATION = 'migrations/20261001_domain_history_append_only.sql';
const TAG = 'dbtest-p124';
const EMAIL = `${TAG}@example.invalid`;
const CALLER = 'tests/db/domain-history-append-only.dbtest.ts';

/** The five stores this file protects, each with its own trigger names. */
const STORES = [
  'workflow_history',
  'document_audit_logs',
  'regulatory_audit_logs',
  'c2c_ana_actions',
  'authoring_signatures',
] as const;
type Store = (typeof STORES)[number];

let owner: Pool;
let org: number;
let orgUuid: string;
let uid: number;
let tpl: number;
let seq = 0;

type Outcome =
  | { ok: true; rowCount: number; rows: Array<Record<string, unknown>> }
  | { ok: false; message: string };

/** One statement as the runtime role, in the probe tenant's request scope. COMMITs only when `commit`. */
async function asRuntime(sql: string, params: unknown[] = [], commit = false): Promise<Outcome> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const scope = { tenantId: String(org), orgUuid, role: 'admin', source: 'request' as const, caller: CALLER };
  return runWithTenantScope(scope, async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(sql, params);
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  });
}

/** One statement as the owner, in a transaction that is ALWAYS rolled back. */
async function asOwnerRolledBack(sql: string, params: unknown[] = []): Promise<Outcome> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    const r = await client.query(sql, params);
    return { ok: true, rowCount: r.rowCount ?? 0, rows: r.rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

/*
 * A refusal: the trigger's, or, for the runtime role, its missing privilege.
 * Since 2026-10-01 (DP-66) these stores are under the grant recipe's
 * append-only ceiling (scripts/db/provision-app-role.mjs APPEND_ONLY_TABLES),
 * so a runtime UPDATE or DELETE is refused 42501 before the trigger fires.
 * The owner's statements still meet the trigger.
 */
const refused = (r: Outcome) => {
  expect(r.ok ? `applied (${r.rowCount} row(s))` : r.message, 'the change was applied').toMatch(
    /IMMUTABILITY_VIOLATION|permission denied for table/,
  );
};

/** A unified document, optionally with a workflow under it. Owner-inserted parents. */
async function makeDocument(): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO unified_documents (title, document_type, created_by, organization_id)
     VALUES ($1, 'protocol', $1, $2) RETURNING id`,
    [TAG, org],
  );
  return Number(rows[0].id);
}
async function makeWorkflow(doc: number): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO document_workflows (document_id, template_id, started_by, organization_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [doc, tpl, TAG, org],
  );
  return Number(rows[0].id);
}
async function makeConversation(): Promise<string> {
  const id = `${TAG}-conv-${process.pid}-${++seq}`;
  // One conversation per (owner, domain, surface): the surface carries the id.
  await owner.query(
    `INSERT INTO c2c_ana_conversations (id, org_id, owner_id, surface) VALUES ($1, $2, $3, $1)`,
    [id, org, uid],
  );
  return id;
}

/**
 * Append one row to `store` through its legitimate path — an INSERT as the
 * runtime role, committed — and return a WHERE clause naming exactly that row.
 */
async function append(store: Store, parents: { doc?: number; wf?: number; conv?: string } = {}): Promise<string> {
  const n = `${process.pid}-${++seq}`;
  const statements: Record<Store, [string, unknown[], string]> = {
    workflow_history: [
      `INSERT INTO workflow_history (workflow_id, action, performed_by) VALUES ($1, 'step_approved', $2) RETURNING id`,
      [parents.wf, `${TAG}-${n}`],
      'id',
    ],
    document_audit_logs: [
      `INSERT INTO document_audit_logs (document_id, action, performed_by) VALUES ($1, 'approved', $2) RETURNING id`,
      [parents.doc, `${TAG}-${n}`],
      'id',
    ],
    regulatory_audit_logs: [
      `INSERT INTO regulatory_audit_logs (audit_id, organization_id, entity_type, entity_id, action, action_category,
         user_id, user_name, ip_address)
       VALUES ($1, $2, 'submission', 's1', 'approve', 'approval', $3, 'P124 Probe', '127.0.0.1') RETURNING id`,
      [`${TAG}-${n}`, org, uid],
      'id',
    ],
    c2c_ana_actions: [
      `INSERT INTO c2c_ana_actions (id, org_id, conversation_id, domain, surface, command, target, proposed_by)
       VALUES ($1, $2, $3, 'mdx', 'probe', 'sign', 'doc:1', $4) RETURNING id`,
      [`${TAG}-act-${n}`, org, parents.conv ?? null, uid],
      'id',
    ],
    authoring_signatures: [
      `INSERT INTO authoring_signatures (id, doc_id, signer_email, meaning, content_hash, tenant_id)
       VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'APPROVER', 'h', $2) RETURNING id`,
      [EMAIL, org],
      'id',
    ],
  };
  const [sql, params, key] = statements[store];
  const r = await asRuntime(sql, params, true);
  if (!r.ok) throw new Error(`[${TAG}] the legitimate INSERT into ${store} was refused: ${r.message}`);
  expect(r.rowCount).toBe(1);
  return `${key} = '${String(r.rows[0][key])}'`;
}

/** A column each store has, to rewrite in the UPDATE probe. */
const REWRITE: Record<Store, string> = {
  workflow_history: `action = 'rewritten'`,
  document_audit_logs: `performed_by = 'someone else'`,
  regulatory_audit_logs: `user_name = 'someone else'`,
  c2c_ana_actions: `state = 'reversed', decision_reason = 'rewritten'`,
  authoring_signatures: `signer_email = 'someone-else@example.invalid'`,
};

/** Remove this file's rows, as the owner, with the guards off for this transaction only. */
async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    const { rows: guards } = await client.query<{ rel: string; tgname: string }>(
      `SELECT c.relname AS rel, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])
          AND t.tgname = 'trg_' || c.relname || '_append_only'`,
      [STORES],
    );
    for (const g of guards) await client.query(`ALTER TABLE public.${g.rel} DISABLE TRIGGER ${g.tgname}`);
    await client.query(
      `DELETE FROM workflow_history WHERE workflow_id IN (SELECT id FROM document_workflows WHERE organization_id = $1)`,
      [org],
    );
    await client.query(
      `DELETE FROM document_audit_logs WHERE document_id IN (SELECT id FROM unified_documents WHERE organization_id = $1)`,
      [org],
    );
    await client.query('DELETE FROM regulatory_audit_logs WHERE organization_id = $1', [org]);
    await client.query('DELETE FROM c2c_ana_actions WHERE org_id = $1', [org]);
    await client.query('DELETE FROM authoring_signatures WHERE tenant_id = $1', [org]);
    for (const g of guards) await client.query(`ALTER TABLE public.${g.rel} ENABLE TRIGGER ${g.tgname}`);
    await client.query('DELETE FROM c2c_ana_conversations WHERE org_id = $1', [org]);
    await client.query('DELETE FROM document_workflows WHERE organization_id = $1', [org]);
    await client.query('DELETE FROM unified_documents WHERE organization_id = $1', [org]);
    await client.query('DELETE FROM workflow_templates WHERE organization_id = $1', [org]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8'));
  const o = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [TAG],
  );
  org = Number(o.rows[0].id);
  orgUuid = String(o.rows[0].uuid);
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'P124 Probe', 'x')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [EMAIL],
  );
  uid = Number(u.rows[0].id);
  await cleanup();
  const t = await owner.query(
    `INSERT INTO workflow_templates (name, module_type, organization_id, created_by)
     VALUES ($1, 'cmc', $2, $1) RETURNING id`,
    [TAG, org],
  );
  tpl = Number(t.rows[0].id);
}, 60_000);

afterAll(async () => {
  if (owner && org) {
    await cleanup();
    await owner.query('DELETE FROM users WHERE email = $1', [EMAIL]);
    await owner.query('DELETE FROM organizations WHERE id = $1', [org]);
  }
  await owner?.end();
});

describe('the probe runs as the runtime role, under RLS', () => {
  it('is app_service-shaped: not the owner, not a superuser, no BYPASSRLS, RLS enforced', async () => {
    const r = await asRuntime(
      `SELECT current_user AS who, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    if (!r.ok) throw new Error(r.message);
    const ownerRole = (await owner.query('SELECT current_user AS who')).rows[0].who;
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false, rls: 'on' });
    expect(r.rows[0].who).not.toBe(ownerRole);
  });
});

describe.each(STORES)('%s (P1-24)', (store) => {
  const parents = async () => {
    const doc = await makeDocument();
    return { doc, wf: await makeWorkflow(doc), conv: await makeConversation() };
  };

  it('accepts an INSERT from the runtime role — the one path every writer uses', async () => {
    const where = await append(store, await parents());
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM ${store} WHERE ${where}`);
    expect(rows[0].n).toBe(1);
  });

  it('refuses an UPDATE from the runtime role', async () => {
    const where = await append(store, await parents());
    refused(await asRuntime(`UPDATE ${store} SET ${REWRITE[store]} WHERE ${where}`));
  });

  it('refuses a DELETE from the runtime role', async () => {
    const where = await append(store, await parents());
    refused(await asRuntime(`DELETE FROM ${store} WHERE ${where}`));
  });

  it('refuses a TRUNCATE, even by the owner', async () => {
    // c2c_ana_actions is referenced by c2c_document_section_versions, so a plain
    // TRUNCATE stops at the foreign-key check before any trigger; CASCADE is the
    // form that would actually empty it.
    const cascade = store === 'c2c_ana_actions' ? ' CASCADE' : '';
    refused(await asOwnerRolledBack(`TRUNCATE ${store}${cascade}`));
  });

  it('is installed under its own names, enabled', async () => {
    const { rows } = await owner.query(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal ORDER BY tgname`,
      [`public.${store}`],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { tgname: `trg_${store}_append_only`, tgenabled: 'O' },
        { tgname: `trg_${store}_no_truncate`, tgenabled: 'O' },
      ]),
    );
  });
});

describe('a parent cannot take its history with it (the three cascading keys)', () => {
  it('deleting a unified document with an audit row and a workflow history is refused', async () => {
    const doc = await makeDocument();
    const wf = await makeWorkflow(doc);
    await append('document_audit_logs', { doc });
    await append('workflow_history', { wf });
    refused(await asOwnerRolledBack('DELETE FROM unified_documents WHERE id = $1', [doc]));
  });

  it('deleting a document workflow with history is refused', async () => {
    const wf = await makeWorkflow(await makeDocument());
    await append('workflow_history', { wf });
    refused(await asOwnerRolledBack('DELETE FROM document_workflows WHERE id = $1', [wf]));
  });

  it('deleting an AnA conversation that governed actions name is refused (its SET NULL is an UPDATE)', async () => {
    const conv = await makeConversation();
    await append('c2c_ana_actions', { conv });
    refused(await asOwnerRolledBack('DELETE FROM c2c_ana_conversations WHERE id = $1', [conv]));
  });

  it('a parent with no history is still deleted — the guard is on the history, not the parent', async () => {
    const doc = await makeDocument();
    await makeWorkflow(doc);
    const conv = await makeConversation();
    const d = await asOwnerRolledBack('DELETE FROM unified_documents WHERE id = $1', [doc]);
    const c = await asOwnerRolledBack('DELETE FROM c2c_ana_conversations WHERE id = $1', [conv]);
    expect(d.ok ? d.rowCount : d.message).toBe(1);
    expect(c.ok ? c.rowCount : c.message).toBe(1);
  });
});

describe('replay (CLAUDE.md Rule 1: the file re-runs on every deploy)', () => {
  it('re-applies cleanly and re-arms a trigger someone disabled', async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE public.c2c_ana_actions DISABLE TRIGGER trg_c2c_ana_actions_append_only');
      await client.query(fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8'));
      const { rows } = await client.query(
        `SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.c2c_ana_actions'::regclass
            AND tgname = 'trg_c2c_ana_actions_append_only'`,
      );
      expect(rows).toEqual([{ tgenabled: 'O' }]);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
