/**
 * P-70 (D6, 2026-10-29): no session setting lifts row-level security.
 *
 * `app.bypass_rls` and `app.is_admin` are custom settings, and PostgreSQL lets
 * any role set one. Before this fix the runtime role, in tenant A's scope, set
 * `app.bypass_rls = 'true'` and read and updated tenant B's Vault version: four
 * SECURITY DEFINER helpers (identity.can_access_org / can_write_org /
 * can_access_program / can_write_program) returned TRUE on it, and 146 policies
 * on 69 tables decide through them. Sixteen more policies read it directly and
 * three read `app.is_admin`.
 *
 * This runs on the database install-fresh + deploy-migrate built (the CI
 * real-database lane), as the non-superuser runtime role the real recipe mints.
 * In tenant A's scope, with each switch the inventory found set alone and all
 * together, the runtime role reads and writes only A's rows: in the Vault, in
 * each of the nineteen tables whose policy read a switch directly, and through
 * each helper. The switches that remain session-settable (`app.rls_enforce`,
 * `app.current_user_role = 'app_super_admin'`) are in the matrix too: none of
 * the 165 changed policies has an arm for either. They still widen the other
 * policies, which is reported, not fixed (README, "What remains").
 *
 * The legitimate paths still work: A reads and writes its own rows, and the
 * operator's same-organization preflight, which used the bypass to read every
 * tenant's rows, now refuses a check it cannot complete instead of
 * under-counting it.
 *
 * Evidence: docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, withSession, type ScratchSchema } from './harness';
import { runProgramSameOrgPreflight } from '../../scripts/db/program-same-org-preflight.mjs';

const ROOT = path.join(__dirname, '../..');
const CONVERGENCE = 'migrations/20261029j_no_session_rls_bypass.sql';
/** The deploy-set creators whose program-isolation policies are created only when absent and converge themselves. */
const CREATORS = [
  'db/migrations/20260206_phase5_evidence_fabric.sql',
  'db/migrations/20260206_phase5_contradiction_scanner.sql',
  'db/migrations/20260207_phase6_6_predicate_intelligence.sql',
];
const PREFIX = 'dbtest-p70';
const OWNER_PROBE = 'dbtest_p70_owner_probe';

/** Every switch the inventory found, alone and together. */
const SWITCHES: Record<string, Record<string, string>> = {
  'no switch': {},
  'app.bypass_rls': { 'app.bypass_rls': 'true' },
  'app.is_admin': { 'app.is_admin': 'true' },
  'app.rls_enforce off': { 'app.rls_enforce': 'off' },
  'app_super_admin': { 'app.current_user_role': 'app_super_admin' },
  'all four': {
    'app.bypass_rls': 'true', 'app.is_admin': 'true', 'app.rls_enforce': 'off', 'app.current_user_role': 'app_super_admin',
  },
};

/** The nineteen tables whose policy read a switch directly, and how a row names its tenant. */
const DIRECT_TABLES = [
  'evidence.claims', 'evidence.sources', 'evidence.support', 'evidence.derivations', 'evidence.provenance',
  'evidence.hash_ledger', 'evidence.contradiction_scans',
  'predicate.candidates', 'predicate.se_matrix_rows', 'predicate.defense_previews',
  'intelligent_docs.source_documents', 'intelligent_docs.traceability_links',
  'intelligent_docs.change_propagation_events', 'intelligent_docs.compliance_scores',
  'intelligent_docs.compliance_rules', 'intelligent_docs.auto_generated_tables',
  'innovation.workspace_analytics',
] as const;

interface Tenant {
  tag: 'a' | 'b';
  orgId: number;
  orgUuid: string;
  programId: string;
  userUuid: string;
  doc: string;
  /** Row id per direct table. */
  rows: Record<string, string>;
}

let scratch: ScratchSchema;
let A: Tenant;
let B: Tenant;
let federatedId: string;
let guidanceId: string;

const hash = (seed: string) => seed.padEnd(64, '0').slice(0, 64);

async function seedTenant(tag: 'a' | 'b'): Promise<Tenant> {
  const q = async (sql: string, params: unknown[] = []) => (await scratch.ownerPool.query(sql, params)).rows[0];
  const org = await q(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active')
       ON CONFLICT (slug) DO UPDATE SET status = 'active' RETURNING id, uuid`,
    [`${PREFIX} ${tag}`, `${PREFIX}-${tag}`]);
  const orgId = Number(org.id);
  const orgUuid = String(org.uuid);
  const programId = String((await q(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PREFIX} ${tag} program`, `P70-${tag}`.toUpperCase(), orgId, `${tag} 5mg`])).id);
  const doc = String((await q(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, file_name, content_hash, status, source_type)
     VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'txt') RETURNING id`,
    [programId, orgId, `${PREFIX}-${tag}-doc`, `Sponsor ${tag} doc`, `${tag}.txt`, hash(tag)])).id);
  const userUuid = randomUUID();
  const id = async (sql: string, params: unknown[]) => String((await q(sql, params)).id);
  const rows: Record<string, string> = {};
  rows['evidence.claims'] = await id(
    `INSERT INTO evidence.claims (program_id, claim_type, claim_text) VALUES ($1, 'efficacy', $2) RETURNING id`,
    [programId, `${PREFIX} ${tag} claim`]);
  const claim2 = await id(
    `INSERT INTO evidence.claims (program_id, claim_type, claim_text) VALUES ($1, 'efficacy', $2) RETURNING id`,
    [programId, `${PREFIX} ${tag} claim 2`]);
  rows['evidence.sources'] = await id(
    `INSERT INTO evidence.sources (program_id, source_type, source_ref) VALUES ($1, 'document', $2) RETURNING id`,
    [programId, `${PREFIX}-${tag}`]);
  rows['evidence.support'] = await id(
    `INSERT INTO evidence.support (claim_id, source_id, program_id) VALUES ($1, $2, $3) RETURNING id`,
    [rows['evidence.claims'], rows['evidence.sources'], programId]);
  rows['evidence.derivations'] = await id(
    `INSERT INTO evidence.derivations (program_id, derived_claim_id, source_claim_id) VALUES ($1, $2, $3) RETURNING id`,
    [programId, claim2, rows['evidence.claims']]);
  rows['evidence.provenance'] = await id(
    `INSERT INTO evidence.provenance (program_id, event_type, claim_id) VALUES ($1, 'created', $2) RETURNING id`,
    [programId, rows['evidence.claims']]);
  rows['evidence.hash_ledger'] = await id(
    `INSERT INTO evidence.hash_ledger (program_id, entity_type, entity_id, content_hash) VALUES ($1, 'claim', $2, $3) RETURNING id`,
    [programId, rows['evidence.claims'], hash(`${tag}l`)]);
  rows['evidence.contradiction_scans'] = await id(
    `INSERT INTO evidence.contradiction_scans (program_id) VALUES ($1) RETURNING id`, [programId]);
  rows['predicate.candidates'] = await id(
    `INSERT INTO predicate.candidates (program_id, k_number, device_name) VALUES ($1, $2, $3) RETURNING id`,
    [programId, `K70000${tag === 'a' ? 1 : 2}`, `${tag} device`]);
  rows['predicate.se_matrix_rows'] = await id(
    `INSERT INTO predicate.se_matrix_rows (program_id, characteristic, subject_value, predicate_value) VALUES ($1, 'size', 'x', 'y') RETURNING id`,
    [programId]);
  rows['predicate.defense_previews'] = await id(
    `INSERT INTO predicate.defense_previews (program_id) VALUES ($1) RETURNING id`, [programId]);
  rows['intelligent_docs.source_documents'] = await id(
    `INSERT INTO intelligent_docs.source_documents (organization_id, title, document_type, content_hash, created_by)
     VALUES ($1, $2, 'other', $3, $4) RETURNING id`, [orgUuid, `${PREFIX} ${tag}`, hash(`${tag}s`), PREFIX]);
  rows['intelligent_docs.traceability_links'] = await id(
    `INSERT INTO intelligent_docs.traceability_links (organization_id, source_document_id, source_hash, source_version,
       target_document_id, linked_text, citation_type, link_hash, created_by)
     VALUES ($1, $2, $3, '1', $4, 'text', 'reference', $5, $6) RETURNING id`,
    [orgUuid, rows['intelligent_docs.source_documents'], hash(`${tag}s`), randomUUID(), hash(`${tag}k`), PREFIX]);
  rows['intelligent_docs.change_propagation_events'] = await id(
    `INSERT INTO intelligent_docs.change_propagation_events (organization_id, source_document_id, old_version, new_version,
       old_hash, new_hash, change_type, event_hash, created_by)
     VALUES ($1, $2, '1', '2', $3, $4, 'correction', $5, $6) RETURNING id`,
    [orgUuid, rows['intelligent_docs.source_documents'], hash(`${tag}o`), hash(`${tag}n`), hash(`${tag}e`), PREFIX]);
  rows['intelligent_docs.compliance_scores'] = await id(
    `INSERT INTO intelligent_docs.compliance_scores (organization_id, document_id, submission_type, overall_score)
     VALUES ($1, $2, 'IND', 50) RETURNING id`, [orgUuid, rows['intelligent_docs.source_documents']]);
  rows['intelligent_docs.compliance_rules'] = await id(
    `INSERT INTO intelligent_docs.compliance_rules (organization_id, rule_id, name, category, severity)
     VALUES ($1, $2, $3, 'content', 'info') RETURNING id`, [orgUuid, `${PREFIX}-${tag}`, `${PREFIX} ${tag} rule`]);
  rows['intelligent_docs.auto_generated_tables'] = await id(
    `INSERT INTO intelligent_docs.auto_generated_tables (organization_id, table_type, title, table_data, column_definitions,
       content_hash, generated_by)
     VALUES ($1, 'custom', $2, '{}'::jsonb, '[]'::jsonb, $3, $4) RETURNING id`,
    [orgUuid, `${PREFIX} ${tag}`, hash(`${tag}t`), PREFIX]);
  rows['innovation.workspace_analytics'] = await id(
    `INSERT INTO innovation.workspace_analytics (user_id, session_id, session_start) VALUES ($1, $2, now()) RETURNING id`,
    [userUuid, randomUUID()]);
  return { tag, orgId, orgUuid, programId, userUuid, doc, rows };
}

/** Tenant A's scope, as the pool applies it, plus the selectors the direct policies read. */
function scopeOf(t: Tenant, switches: Record<string, string> = {}): Record<string, string> {
  return {
    'app.rls_enforce': 'on',
    'app.current_tenant_id': String(t.orgId),
    'app.current_org_id': t.orgUuid,
    'app.current_user_role': 'admin',
    'app.current_program_id': t.programId,
    'app.current_organization_id': t.orgUuid,
    'app.current_user_id': t.userUuid,
    ...switches,
  };
}

/** Which of `t`'s rows the session sees, table by table (1 or 0). */
async function visible(client: PoolClient, t: Tenant): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  out['vault.documents'] = Number((await client.query(
    'SELECT count(*)::int AS n FROM vault.documents WHERE id = $1', [t.doc])).rows[0].n);
  for (const table of DIRECT_TABLES) {
    out[table] = Number((await client.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE id = $1`, [t.rows[table]])).rows[0].n);
  }
  return out;
}
const every = (n: number) => Object.fromEntries(['vault.documents', ...DIRECT_TABLES].map(t => [t, n]));

async function cleanup(): Promise<void> {
  const o = scratch.ownerPool;
  const programs = `SELECT id FROM regulatory_programs WHERE name LIKE '${PREFIX} %'`;
  const orgs = `SELECT uuid FROM organizations WHERE slug LIKE '${PREFIX}-%'`;
  // Append-only stores refuse a DELETE; the owner lifts their triggers for the
  // test's own rows only, inside one transaction.
  const client = await o.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    for (const table of ['evidence.support', 'evidence.derivations', 'evidence.provenance', 'evidence.hash_ledger',
      'evidence.contradiction_scans', 'evidence.sources', 'evidence.claims', 'predicate.se_matrix_rows',
      'predicate.defense_previews', 'predicate.candidates']) {
      await client.query(`DELETE FROM ${table} WHERE program_id IN (${programs})`);
    }
    for (const table of ['intelligent_docs.compliance_scores', 'intelligent_docs.change_propagation_events',
      'intelligent_docs.traceability_links', 'intelligent_docs.compliance_rules', 'intelligent_docs.auto_generated_tables',
      'intelligent_docs.source_documents']) {
      await client.query(`DELETE FROM ${table} WHERE organization_id IN (${orgs})`);
    }
    await client.query('DELETE FROM innovation.workspace_analytics WHERE user_id = ANY($1::uuid[])',
      [[A?.userUuid, B?.userUuid].filter(Boolean)]);
    await client.query(`DELETE FROM cortex.federated_learning_state WHERE task_name LIKE '${PREFIX}%'`);
    await client.query(`DELETE FROM innovation.guidance_documents WHERE title LIKE '${PREFIX}%'`);
    await client.query(`DELETE FROM vault.documents WHERE program_id IN (${programs})`);
    await client.query(`DELETE FROM regulatory_programs WHERE name LIKE '${PREFIX} %'`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  scratch = await createScratchSchema(databaseUrl);
  await scratch.connectAsRuntimeRole();
  await cleanup();
  A = await seedTenant('a');
  B = await seedTenant('b');
  federatedId = String((await scratch.ownerPool.query(
    `INSERT INTO cortex.federated_learning_state (task_name, task_type, participant_count, differential_privacy_epsilon)
     VALUES ($1, 'insight_aggregation', 2, 0.5) RETURNING id`, [`${PREFIX} task`])).rows[0].id);
  guidanceId = String((await scratch.ownerPool.query(
    `INSERT INTO innovation.guidance_documents (agency, title, content_hash, publication_date, document_type)
     VALUES ('FDA', $1, $2, CURRENT_DATE, 'guidance') RETURNING id`, [`${PREFIX} guidance`, hash('g')])).rows[0].id);
}, 180_000);

afterAll(async () => {
  if (!scratch) return;
  await cleanup().catch(() => undefined);
  await scratch.destroy();
});

describe('P-70: no session setting lifts row-level security', () => {
  it('no policy, and no function outside pg_catalog, reads app.bypass_rls or app.is_admin', async () => {
    const { rows } = await scratch.ownerPool.query(`
      SELECT format('policy %s on %s', pol.polname, pol.polrelid::regclass) AS reader
        FROM pg_policy pol
       WHERE coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'app\\.(bypass_rls|is_admin)'
      UNION ALL
      SELECT format('function %s', p.oid::regprocedure)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prosrc ~ 'app\\.(bypass_rls|is_admin)'
       ORDER BY 1`);
    expect(rows.map(r => r.reader)).toEqual([]);
  });

  for (const [name, switches] of Object.entries(SWITCHES)) {
    it(`in tenant A's scope with ${name}, the runtime role reads A's rows and none of B's`, async () => {
      const seen = await withSession(scratch.runtimePool!, scopeOf(A, switches), async c => ({
        own: await visible(c, A), other: await visible(c, B),
      }));
      expect(seen.other, `${name} showed the runtime role another tenant's rows`).toEqual(every(0));
      expect(seen.own, `${name}: the policies are not a blanket deny; A sees its own rows`).toEqual(every(1));
    });

    it(`in tenant A's scope with ${name}, no helper admits B's program or organization`, async () => {
      const verdicts = await withSession(scratch.runtimePool!, scopeOf(A, switches), async c => (await c.query(
        `SELECT identity.can_access_program($1::uuid) AS access_program, identity.can_write_program($1::uuid) AS write_program,
                core.can_access_program($1::uuid) AS core_access_program, core.can_write_program($1::uuid) AS core_write_program,
                identity.can_access_org($2::uuid) AS access_org, identity.can_write_org($2::uuid) AS write_org`,
        [B.programId, B.orgUuid])).rows[0]);
      expect(verdicts).toEqual({
        access_program: false, write_program: false, core_access_program: false,
        core_write_program: false, access_org: false, write_org: false,
      });
      const own = await withSession(scratch.runtimePool!, scopeOf(A, switches), async c => (await c.query(
        'SELECT identity.can_write_program($1::uuid) AS p, identity.can_write_org($2::uuid) AS o',
        [A.programId, A.orgUuid])).rows[0]);
      expect(own).toEqual({ p: true, o: true });
    });

    it(`in tenant A's scope with ${name}, the runtime role writes none of B's rows`, async () => {
      await withSession(scratch.runtimePool!, scopeOf(A, switches), async c => {
        const updated = await c.query(
          'UPDATE vault.documents SET document_title = document_title WHERE id = $1', [B.doc]);
        expect(updated.rowCount, `${name} let A update B's Vault version`).toBe(0);
        const claims = await c.query('UPDATE evidence.claims SET claim_text = claim_text WHERE id = $1',
          [B.rows['evidence.claims']]);
        expect(claims.rowCount).toBe(0);
        await expect(c.query(
          `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, file_name, content_hash, status, source_type)
           VALUES ($1, $2, $3, 'planted', 'planted.txt', $4, 'completed', 'txt')`,
          [B.programId, B.orgId, `${PREFIX}-planted-${randomUUID()}`, hash('p')])).rejects.toThrow(/row-level security/);
      });
    });

    it(`with ${name}, the two switch-only policies grant nothing: federated state unread, guidance unwritable`, async () => {
      await withSession(scratch.runtimePool!, scopeOf(A, switches), async c => {
        const fed = await c.query('SELECT count(*)::int AS n FROM cortex.federated_learning_state WHERE id = $1', [federatedId]);
        expect(fed.rows[0].n).toBe(0);
        const read = await c.query('SELECT count(*)::int AS n FROM innovation.guidance_documents WHERE id = $1', [guidanceId]);
        expect(read.rows[0].n, 'guidance stays public reference (its own select policy)').toBe(1);
        const updated = await c.query('UPDATE innovation.guidance_documents SET title = title WHERE id = $1', [guidanceId]);
        expect(updated.rowCount).toBe(0);
      });
    });
  }

  it('the convergence is conditional: applied twice more, with the creators, it rewrites no helper and no policy', async () => {
    const sql = fs.readFileSync(path.join(ROOT, CONVERGENCE), 'utf8');
    const snapshot = async (c: PoolClient) => (await c.query(`
      SELECT (SELECT array_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.xmin::text ORDER BY p.oid) FROM pg_proc p
               WHERE p.oid IN ('identity.can_access_org(uuid)'::regprocedure, 'identity.can_write_org(uuid)'::regprocedure,
                               'identity.can_access_program(uuid)'::regprocedure, 'identity.can_write_program(uuid)'::regprocedure)) AS fns,
             (SELECT array_agg(pol.oid::text || ':' || pol.polname || ':' || pol.xmin::text ORDER BY pol.oid) FROM pg_policy pol
               WHERE pol.polrelid IN ('cortex.federated_learning_state'::regclass, 'innovation.guidance_documents'::regclass,
                                      'innovation.workspace_analytics'::regclass)) AS pols,
             (SELECT array_agg(pol.oid::text || ':' || pol.xmin::text ORDER BY pol.oid) FROM pg_policy pol
               WHERE pol.polrelid::regclass::text ~ '^(evidence|predicate)[.]') AS program_pols`)).rows[0];
    const client = await scratch.ownerPool.connect();
    try {
      await client.query('BEGIN');
      const before = await snapshot(client);
      await client.query(sql);
      await client.query(sql);
      // Same oid, same text and the same row version: an unconditional CREATE OR
      // REPLACE or ALTER POLICY keeps the first two and writes a new xmin. The
      // creators of the program-isolation policies replace theirs only while the
      // stored text reads the bypass, too (their own BEGIN/COMMIT left out, so
      // this stays inside the rolled-back transaction).
      for (const file of CREATORS) {
        await client.query(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^(BEGIN|COMMIT);$/gm, ''));
      }
      expect(await snapshot(client)).toEqual(before);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});

describe('P-70: the paths that read across tenants without the bypass', () => {
  it('A writes its own Vault version in its own scope', async () => {
    const code = `${PREFIX}-a-own-${randomUUID()}`;
    await withSession(scratch.runtimePool!, scopeOf(A), c => c.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, file_name, content_hash, status, source_type)
       VALUES ($1, $2, $3, 'own', 'own.txt', $4, 'completed', 'txt')`, [A.programId, A.orgId, code, hash('own')]));
    const n = await scratch.ownerPool.query('SELECT count(*)::int AS n FROM vault.documents WHERE document_code = $1', [code]);
    expect(n.rows[0].n).toBe(1);
  });

  it('the same-organization preflight refuses vault.documents as a role row security holds, rather than under-count it', async () => {
    const client = await scratch.ownerPool.connect();
    try {
      await client.query('BEGIN');
      // A NOSUPERUSER NOBYPASSRLS owner: the shape of a managed-Postgres migration role.
      await client.query(`CREATE ROLE ${OWNER_PROBE} NOSUPERUSER NOBYPASSRLS NOLOGIN`);
      await client.query(`ALTER TABLE vault.documents OWNER TO ${OWNER_PROBE}`);
      await client.query(`GRANT USAGE ON SCHEMA vault, core, identity TO ${OWNER_PROBE}`);
      await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core, identity TO ${OWNER_PROBE}`);
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${OWNER_PROBE}`);
      await client.query(`SET LOCAL ROLE ${OWNER_PROBE}`);
      await client.query("SELECT set_config('app.rls_enforce', 'off', true)");
      const results = await runProgramSameOrgPreflight(client);
      const vault = results.find((r: { relation: string }) => r.relation === 'vault.documents');
      expect(vault?.refused, 'the preflight reported a Vault it could not read as clean').toMatch(/row security/);
      expect(vault?.rows).toEqual([]);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('the same preflight reads vault.documents as a role row security does not hold (a superuser here)', async () => {
    const results = await runProgramSameOrgPreflight(scratch.ownerPool);
    const vault = results.find((r: { relation: string }) => r.relation === 'vault.documents');
    expect(vault?.skipped).toBe(false);
    expect(vault?.refused ?? null).toBeNull();
  });
});
