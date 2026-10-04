/**
 * The runtime role cannot UPDATE, DELETE or TRUNCATE an append-only audit store
 * (plan P0-8, grant half; security audit 2026-09-24 DP-04, High; rows D5, D6).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * The grant recipe (scripts/db/provision-app-role.mjs) gives the runtime role
 * full DML on every table in `public`, and that is where audit_logs,
 * audit_events, electronic_signatures and the other append-only records live.
 * Only `audit.tamper_proof_log` sat under the append-only ceiling. So the one
 * thing between the application's own credentials and a rewritten audit trail
 * was the immutability trigger: a statement the trigger never reaches
 * (`UPDATE … WHERE false`) ran, and with the trigger out of the way — a restore
 * without triggers, `session_replication_role = replica`, a DISABLE TRIGGER —
 * the role deleted an audit row outright (DELETE 1). The deploy's grant audit
 * (`auditRuntimeRoleGrants`, deploy-migrate step 5/5) checked the ceiling only
 * in the `audit` schema, so it reported that estate clean. Measured at HEAD:
 * docs/evidence/D6/2026-10-01-tranche-4/P0-8-grants/red/.
 *
 * ── How it runs ──────────────────────────────────────────────────────────────
 * Two roles, both NOSUPERUSER NOBYPASSRLS, under RLS:
 *   1. a per-run role minted by the REAL recipe (provisionAppServiceRole), so
 *      what is under test is the recipe itself, without touching anyone else's
 *      role;
 *   2. app_service — APP_DATABASE_URL, the role production and every other
 *      suite here serve with — as deploy-migrate step 4/5 leaves it.
 * Every row written is inside a transaction that is rolled back. Tenant 92808
 * is this file's; no other suite uses it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  refreshRuntimeRoleGrants,
  resolveAppServiceRole,
  auditRuntimeRoleGrants,
} from '../../scripts/db/provision-app-role.mjs';
import { verifyReadinessContract } from '../../scripts/db/readiness-contract.mjs';

const ORG = 92808;
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtest-p08-append-only-grants-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtest_p08_${RUN}` });
const APP_ROLE = resolveAppServiceRole(process.env);

/**
 * The stores, named here rather than read from APPEND_ONLY_TABLES: a test that
 * takes its population from the code under test cannot notice the code
 * leaving one out.
 */
const STORES = [
  'public.audit_logs',
  'public.audit_events',
  'public.audit_log_archives',
  'audit.tamper_proof_log',
  'public.electronic_signatures',
  'public.ana_turn_records',
  'public.ana_record_blobs',
  'public.authoring_audit_trail',
  'public.doc_revisions',
  'public.concept2cure_signatures',
  'public.concept2cure_submission_snapshots',
  // DP-66 (plan P1-52), 2026-10-01: stores the census found written by INSERT
  // only, on every path (docs/evidence/D6/2026-10-01-tranche-4/DP-66-store-ceiling/).
  'public.proof_audit_logs',
  'public.coauthor_validation_history',
  'public.embedding_audit_log',
  'public.ai_provider_audit_log',
  'ai.gateway_audit_log',
  'public.credit_ledger',
  'public.document_audit_trail',
  'public.ectd_submission_status_history',
  'public.specification_audit_log',
  'public.stab_audit',
  'public.ivdr_validation_parameter_history',
  'public.ivdr_evidence_result_history',
  'public.ivdr_cdx_status_history',
  'regulatory_harmonization.export_job_audit_log',
  // P1-24's domain-history stores, under the ceiling since the same day (DP-66).
  'public.workflow_history',
  'public.document_audit_logs',
  'public.regulatory_audit_logs',
  'public.c2c_ana_actions',
  'public.authoring_signatures',
] as const;
const WITHHELD = ['UPDATE', 'DELETE', 'TRUNCATE'] as const;
/**
 * Stores the runtime role may read and not append to (P0-8 follow-up,
 * 2026-10-01): the archive ledger, which only audit_logs_archive_delete()
 * writes, as audit_archiver. Named here, as STORES is.
 */
const SELECT_ONLY: readonly string[] = ['public.audit_log_archives'];
const withheldOn = (store: string): readonly string[] => (SELECT_ONLY.includes(store) ? [...WITHHELD, 'INSERT'] : WITHHELD);
/** The write-once supersession its trigger admits (signature-persistence.ts revocation). */
const SUPERSESSION = ['superseded_by', 'is_valid', 'verification_status', 'verification_date', 'updated_at'];
const ATTESTED = ['signer_id', 'signer_email', 'signature_hash', 'signature_meaning', 'signed_at', 'bound_payload_digest'];
const INSUFFICIENT_PRIVILEGE = '42501';

let owner: Pool;
let runtimePool: Pool;
let appPool: Pool;
/** The stores present on this database, each with one column to name in an UPDATE. */
let present: { store: string; col: string }[] = [];

type Attempt = { ok: true; rowCount: number } | { ok: false; code: string; message: string };

/** One statement in a savepoint, so a refusal leaves the transaction usable. */
async function attempt(c: PoolClient, sql: string, params: unknown[] = []): Promise<Attempt> {
  await c.query('SAVEPOINT p08');
  try {
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p08');
    return { ok: true, rowCount: r.rowCount ?? 0 };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p08');
    const err = e as { code?: string; message?: string };
    return { ok: false, code: String(err.code ?? ''), message: String(err.message ?? e) };
  }
}

const outcome = (a: Attempt) => (a.ok ? `ran (${a.rowCount} row(s))` : `${a.code} ${a.message}`);

/** `fn` on `pool`, in tenant ORG's request scope with RLS on, in a transaction that is always rolled back. */
async function inTenant<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL lock_timeout = '10s'`);
    await c.query(`SELECT set_config('app.rls_enforce', 'on', true), set_config('app.current_tenant_id', $1, true)`, [
      String(ORG),
    ]);
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}

async function insertAuditRow(c: PoolClient, action: string, ageMonths = 0): Promise<string> {
  const { rows } = await c.query(
    `INSERT INTO public.audit_logs (tenant_id, action, table_name, record_id, created_at)
     VALUES ($1, $2, 'p08_probe', $3, now() - make_interval(months => $4)) RETURNING id`,
    [ORG, action, RUN, ageMonths],
  );
  return String(rows[0].id);
}

async function privileges(role: string): Promise<Record<string, Record<string, boolean>>> {
  const { rows } = await owner.query(
    `SELECT s.store, p.priv, has_table_privilege($1, s.store, p.priv) AS held
       FROM unnest($2::text[]) AS s(store)
       CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)`,
    [role, present.map((p) => p.store)],
  );
  const out: Record<string, Record<string, boolean>> = {};
  for (const r of rows) (out[r.store] ??= {})[r.priv] = r.held;
  return out;
}

/** What a role holds beyond each store's ceiling (SELECT, INSERT; SELECT on the ledger), as `store: PRIV,…` lines (empty = the ceiling holds). */
async function beyondCeiling(role: string): Promise<string[]> {
  const held = await privileges(role);
  return Object.entries(held)
    .map(([store, p]) => [store, withheldOn(store).filter((w) => p[w])] as const)
    .filter(([, w]) => w.length > 0)
    .map(([store, w]) => `${store}: ${w.join(',')}`)
    .sort();
}

/** The attempts a role makes on every store: UPDATE/DELETE that reach no row, and TRUNCATE. */
async function mutationAttempts(pool: Pool): Promise<string[]> {
  return inTenant(pool, async (c) => {
    const ran: string[] = [];
    for (const { store, col } of present) {
      for (const sql of [
        `UPDATE ${store} SET ${col} = ${col} WHERE false`,
        `DELETE FROM ${store} WHERE false`,
        `TRUNCATE ${store}`,
      ]) {
        const a = await attempt(c, sql);
        if (a.ok || a.code !== INSUFFICIENT_PRIVILEGE) ran.push(`${sql} → ${outcome(a)}`);
      }
    }
    return ran;
  });
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const appUrl = process.env.APP_DATABASE_URL;
  if (!appUrl) throw new Error('[p08] APP_DATABASE_URL is required: an owner connection proves nothing about the runtime role.');
  appPool = new Pool({ connectionString: appUrl, max: 2 });

  const cols = await owner.query(
    `SELECT s.store, quote_ident(a.attname) AS col
       FROM unnest($1::text[]) AS s(store)
       JOIN pg_attribute a ON a.attrelid = to_regclass(s.store) AND a.attnum = 1`,
    [[...STORES]],
  );
  present = cols.rows.map((r) => ({ store: String(r.store), col: String(r.col) }));

  const minted = await provisionAppServiceRole(owner, {
    env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
  });
  if (minted.skipped) throw new Error('[p08] provisionAppServiceRole skipped — the per-run role was not minted.');
  const url = new URL(databaseUrl);
  url.username = runtimeRole;
  url.password = RUNTIME_PASSWORD;
  runtimePool = new Pool({ connectionString: url.toString(), max: 2 });
}, 180_000);

afterAll(async () => {
  await runtimePool?.end().catch(() => {});
  await appPool?.end().catch(() => {});
  if (owner) {
    await owner
      .query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`)
      .catch(() => {/* the role may not have been minted */});
    await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
    await owner.end();
  }
});

describe('the stores exist on this database', () => {
  it('every append-only store this file names is present (a missing one would make the rest vacuous)', () => {
    expect(present.map((p) => p.store).sort()).toEqual([...STORES].sort());
  });
});

describe('the grant recipe (provisionAppServiceRole) on a per-run role', () => {
  it('withholds UPDATE, DELETE and TRUNCATE on every append-only store, and keeps SELECT and INSERT', async () => {
    expect(await beyondCeiling(runtimeRole)).toEqual([]);
    const held = await privileges(runtimeRole);
    for (const { store } of present) {
      expect([store, held[store].SELECT, held[store].INSERT]).toEqual([store, true, !SELECT_ONLY.includes(store)]);
    }
  });

  it('electronic_signatures: the supersession columns stay updatable (revocation), the attested ones do not', async () => {
    const { rows } = await owner.query(
      `SELECT c, has_column_privilege($1, 'public.electronic_signatures', c, 'UPDATE') AS u FROM unnest($2::text[]) AS c`,
      [runtimeRole, [...SUPERSESSION, ...ATTESTED]],
    );
    const updatable = rows.filter((r) => r.u).map((r) => r.c);
    expect(updatable.sort()).toEqual([...SUPERSESSION].sort());
  });

  it('the privilege refuses first: UPDATE/DELETE that reach no row, and TRUNCATE, are 42501 on every store', async () => {
    expect(await mutationAttempts(runtimePool)).toEqual([]);
  });

  it('the governed revocation statement still runs (its columns only)', async () => {
    const a = await inTenant(runtimePool, (c) =>
      attempt(
        c,
        `UPDATE public.electronic_signatures
            SET superseded_by = superseded_by, is_valid = is_valid, verification_status = verification_status,
                verification_date = verification_date, updated_at = updated_at
          WHERE false RETURNING id`,
      ),
    );
    expect(outcome(a)).toBe('ran (0 row(s))');
  });

  it('a re-run of the recipe takes a hand GRANT of DELETE on audit_logs back', async () => {
    await owner.query(`GRANT DELETE ON public.audit_logs TO ${runtimeRole}`);
    expect(await beyondCeiling(runtimeRole)).toEqual(['public.audit_logs: DELETE']);
    await refreshRuntimeRoleGrants(owner, { role: runtimeRole });
    expect(await beyondCeiling(runtimeRole)).toEqual([]);
  }, 180_000);
});

describe('the deploy grant audit (auditRuntimeRoleGrants → readiness contract, deploy-migrate 5/5)', () => {
  it('reports the per-run role clean on every store: nothing beyond the ceiling, nothing denied', async () => {
    const audit = await auditRuntimeRoleGrants(owner, runtimeRole);
    const onStores = (r: { relation: string }) => (STORES as readonly string[]).includes(r.relation);
    expect(audit.excess.filter(onStores)).toEqual([]);
    expect(audit.denied.filter(onStores)).toEqual([]);
    expect(audit.ownedAppendOnly).toEqual([]);
  });

  it('refuses a hand GRANT of DELETE, TRUNCATE or an attested column on a store, by name', async () => {
    const grants = [
      `GRANT DELETE ON public.audit_logs TO ${runtimeRole}`,
      `GRANT TRUNCATE ON public.audit_events TO ${runtimeRole}`,
      `GRANT UPDATE (signer_id) ON public.electronic_signatures TO ${runtimeRole}`,
    ];
    for (const g of grants) await owner.query(g);
    try {
      const audit = await auditRuntimeRoleGrants(owner, runtimeRole);
      expect(audit.excess.filter((e: { relation: string }) => (STORES as readonly string[]).includes(e.relation))).toEqual([
        { relation: 'public.audit_events', held: ['TRUNCATE'] },
        { relation: 'public.audit_logs', held: ['DELETE'] },
        { relation: 'public.electronic_signatures', held: ['UPDATE(signer_id)'] },
      ]);
      const verdict = await verifyReadinessContract(owner, { runtimeRole });
      expect(verdict.ok).toBe(false);
      expect(verdict.failures.join('\n')).toMatch(/beyond the append-only ceiling on: .*public\.audit_logs \(DELETE\)/);
    } finally {
      await owner.query(`REVOKE DELETE ON public.audit_logs FROM ${runtimeRole}`);
      await owner.query(`REVOKE TRUNCATE ON public.audit_events FROM ${runtimeRole}`);
      await owner.query(`REVOKE UPDATE (signer_id) ON public.electronic_signatures FROM ${runtimeRole}`);
    }
  }, 120_000);
});

describe(`${APP_ROLE}, as deploy-migrate step 4/5 leaves it`, () => {
  it('holds no UPDATE, DELETE or TRUNCATE on any append-only store', async () => {
    expect(await beyondCeiling(APP_ROLE)).toEqual([]);
  });

  it(`as ${APP_ROLE}, in its own tenant: DELETE and UPDATE of an audit row are refused by the privilege (42501), before the trigger`, async () => {
    const [del, upd] = await inTenant(appPool, async (c) => {
      const id = await insertAuditRow(c, 'dbtest-p08.app-probe');
      return [
        await attempt(c, 'DELETE FROM public.audit_logs WHERE id = $1', [id]),
        await attempt(c, `UPDATE public.audit_logs SET action = 'tampered' WHERE id = $1`, [id]),
      ];
    });
    expect(outcome(del)).toMatch(/^42501 permission denied for table audit_logs/);
    expect(outcome(upd)).toMatch(/^42501 permission denied for table audit_logs/);
  });

  it(`with the trigger out of the way (replica mode), ${APP_ROLE} still cannot remove or rewrite an audit row`, async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL lock_timeout = '10s'`);
      await c.query('SET LOCAL session_replication_role = replica');
      await c.query(`SET LOCAL ROLE ${APP_ROLE}`);
      await c.query(`SELECT set_config('app.rls_enforce', 'on', true), set_config('app.current_tenant_id', $1, true)`, [
        String(ORG),
      ]);
      const id = await insertAuditRow(c, 'dbtest-p08.replica-probe');
      expect(outcome(await attempt(c, 'DELETE FROM public.audit_logs WHERE id = $1', [id]))).toMatch(/^42501 /);
      expect(outcome(await attempt(c, `UPDATE public.audit_logs SET action = 'x' WHERE id = $1`, [id]))).toMatch(/^42501 /);
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });

  it(`cannot append to the archive ledger itself: the forged row of DP-68 is refused by the privilege (42501)`, async () => {
    const forged = await inTenant(appPool, (c) =>
      attempt(
        c,
        `INSERT INTO public.audit_log_archives (archived_at, row_count, min_created_at, max_created_at, cutoff, locator, sha256)
         VALUES (now(), 1000000, '2000-01-01', '2000-01-02', timestamptz '2100-01-01', 'dbtest-p08://forged', repeat('f', 64))`,
      ),
    );
    expect(outcome(forged)).toMatch(/^42501 permission denied for table audit_log_archives/);
  });

  it(`the archive door still deletes for ${APP_ROLE}, and records the batch in its ledger`, async () => {
    const result = await inTenant(appPool, async (c) => {
      const id = await insertAuditRow(c, 'dbtest-p08.archive-probe', 26);
      const locator = `dbtest-p08://${RUN}`;
      const door = await c.query(
        `SELECT public.audit_logs_archive_delete(ARRAY[$1]::uuid[], $2, repeat('a', 64), now() - interval '25 months') AS n`,
        [id, locator],
      );
      const left = await c.query('SELECT count(*)::int AS n FROM public.audit_logs WHERE id = $1', [id]);
      const ledger = await c.query('SELECT row_count FROM public.audit_log_archives WHERE locator = $1', [locator]);
      return { deleted: door.rows[0].n, left: left.rows[0].n, ledger: ledger.rows.map((r) => r.row_count) };
    });
    expect(result).toEqual({ deleted: 1, left: 0, ledger: [1] });
  });

  it(`the deploy grant audit agrees with the catalog for ${APP_ROLE}: nothing beyond the ceiling on any store`, async () => {
    const audit = await auditRuntimeRoleGrants(owner, APP_ROLE);
    const reported = audit.excess
      .filter((e: { relation: string }) => (STORES as readonly string[]).includes(e.relation))
      .map((e: { relation: string; held: string[] }) => `${e.relation}: ${e.held.join(',')}`)
      .sort();
    expect(reported).toEqual(await beyondCeiling(APP_ROLE));
    expect(reported).toEqual([]);
  });
});
