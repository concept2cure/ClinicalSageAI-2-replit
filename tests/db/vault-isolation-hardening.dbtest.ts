/**
 * P-66 (D6, 2026-10-29): two of the three tenant-isolation hardenings, on a real
 * PostgreSQL, as the roles production runs as.
 *
 * 1. An evidence citation cites only its own organization's document. The
 *    citation policies of migrations/20260911_vault_evidence_citations.sql
 *    checked the SOURCE document alone, so organization B could write a
 *    citation whose evidence is A's document (B's row, by its source), and A's
 *    purge then deleted B's row by cascade
 *    (docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/cross-tenant-citation-probe.txt).
 *    The insert and update policies now check both ends. The one application
 *    writer (advancedRAGPipeline.persistEvidenceCitations) refuses a foreign
 *    document by its own predicate, before the database is asked.
 *
 * 2. The Vault child tables FORCE row-level security, so the table owner is no
 *    exception. A superuser bypasses RLS whatever FORCE says, which is why the
 *    owner here is minted NOSUPERUSER NOBYPASSRLS (the shape of a managed
 *    Postgres migration role) and handed the tables inside a transaction that
 *    is rolled back. The same owner also owns the tenant purge's Vault door
 *    (purge_tenant_vault_records), which must still erase the purged tenant's
 *    rows, and nobody else's, once its policies apply to it.
 *
 * The amended files are applied here, twice, rather than assumed: the suite
 * tests the files as committed, and the second run shows the policy
 * replacement is conditional (Rule 1: every file re-runs on every deploy).
 *
 * Evidence: docs/evidence/D6-ISOLATION-HARDENING/2026-10-29/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, withSession, type ScratchSchema } from './harness';
import { AdvancedRAGPipeline } from '../../server/services/advancedRAGPipeline';

const ROOT = path.join(__dirname, '../..');
const AMENDED = [
  'migrations/20260905_document_catalog.sql',
  'migrations/20260905b_vault_document_chunks.sql',
  'migrations/20260911_vault_evidence_citations.sql',
  'migrations/20260926_vault_documents_record_immutability.sql',
];
const PREFIX = 'dbtest-p66';
const CHILD_TABLES = [
  'document_archives', 'document_catalog', 'document_chunks', 'document_read_receipts', 'evidence_citations',
] as const;
const OWNER_PROBE = 'dbtest_p66_owner_probe';

interface Tenant {
  orgId: number;
  orgUuid: string;
  programId: string;
  doc: string;
  doc2: string;
  chunk: string;
  citation: string;
  archive: string;
}

let scratch: ScratchSchema;
let A: Tenant;
let B: Tenant;

const hash = (seed: string) => seed.padEnd(64, '0').slice(0, 64);

async function seedTenant(tag: 'a' | 'b'): Promise<Tenant> {
  const q = (sql: string, params?: unknown[]) => scratch.ownerPool.query(sql, params as unknown[]);
  // A is the tenant the purge door erases, so it is pending deletion.
  const org = await q(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET status = EXCLUDED.status RETURNING id, uuid`,
    [`${PREFIX} ${tag}`, `${PREFIX}-${tag}`, tag === 'a' ? 'pending_deletion' : 'active'],
  );
  const orgId = Number(org.rows[0].id);
  const prog = await q(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PREFIX} ${tag} program`, `P66-${tag}`.toUpperCase(), orgId, `${tag} 5mg`],
  );
  const programId = String(prog.rows[0].id);
  const doc = async (suffix: string) => String((await q(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, file_name, content_hash, status, source_type)
     VALUES ($1, $2, $3, $4, $5, $6, 'completed', 'txt') RETURNING id`,
    [programId, orgId, `${PREFIX}-${tag}-${suffix}`, `Sponsor ${tag} ${suffix}`, `${tag}-${suffix}.txt`, hash(tag + suffix)],
  )).rows[0].id);
  const d1 = await doc('doc');
  const d2 = await doc('doc2');
  const chunk = await q(
    `INSERT INTO vault.document_chunks (document_id, chunk_index, chunk_text) VALUES ($1, 0, $2) RETURNING id`,
    [d1, `Sponsor ${tag} passage`],
  );
  await q(`INSERT INTO vault.document_catalog (document_id, content_hash, catalog_status) VALUES ($1, $2, 'extracted')`,
    [d1, hash(tag + 'doc')]);
  await q(`INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end) VALUES ($1, $2, 0, 1)`,
    [d1, hash(tag + 'doc')]);
  const citation = await q(
    `INSERT INTO vault.evidence_citations (source_document_id, evidence_document_id, claim_text)
     VALUES ($1, $2, $3) RETURNING id`, [d1, d2, `Sponsor ${tag} claim`]);
  const archive = await q(
    `INSERT INTO vault.document_archives (original_document_id, program_id, snapshot) VALUES ($1, $2, '{}'::jsonb) RETURNING id`,
    [d1, programId]);
  return {
    orgId, orgUuid: String(org.rows[0].uuid), programId, doc: d1, doc2: d2,
    chunk: String(chunk.rows[0].id), citation: String(citation.rows[0].id), archive: String(archive.rows[0].id),
  };
}

/** The settings pool instrumentation applies to a tenant-scoped statement. */
function scopeOf(t: Tenant): Record<string, string> {
  return {
    'app.rls_enforce': 'on',
    'app.current_tenant_id': String(t.orgId),
    'app.current_org_id': t.orgUuid,
    'app.current_user_role': 'admin',
  };
}

async function cleanup(): Promise<void> {
  const programs = `SELECT id FROM regulatory_programs WHERE name LIKE '${PREFIX} %'`;
  await scratch.ownerPool.query(`DELETE FROM vault.document_archives WHERE program_id IN (${programs})`);
  await scratch.ownerPool.query(`DELETE FROM vault.documents WHERE program_id IN (${programs})`);
  await scratch.ownerPool.query(
    `DELETE FROM identity.org_relationships WHERE created_by = $1`, [PREFIX]).catch(() => undefined);
  await scratch.ownerPool.query(`DELETE FROM regulatory_programs WHERE name LIKE $1`, [`${PREFIX} %`]);
}

/** Policy oids and text for the citation table, to show a replay replaces nothing. */
async function citationPolicies(): Promise<Array<{ oid: string; polname: string; qual: string | null; check: string | null }>> {
  const { rows } = await scratch.ownerPool.query(
    `SELECT p.oid::text AS oid, p.polname, pg_get_expr(p.polqual, p.polrelid) AS qual,
            pg_get_expr(p.polwithcheck, p.polrelid) AS check
       FROM pg_policy p WHERE p.polrelid = 'vault.evidence_citations'::regclass ORDER BY p.polname`);
  return rows;
}

/**
 * Run `fn` inside a transaction in which a NOSUPERUSER NOBYPASSRLS role owns
 * every Vault table and the purge door, then roll everything back.
 */
async function asNonSuperuserOwner<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await scratch.ownerPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE ROLE ${OWNER_PROBE} NOSUPERUSER NOBYPASSRLS NOLOGIN`);
    await client.query(`DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'vault' AND c.relkind = 'r' LOOP
        EXECUTE format('ALTER TABLE vault.%I OWNER TO ${OWNER_PROBE}', t);
      END LOOP; END $$`);
    await client.query(`ALTER FUNCTION public.purge_tenant_vault_records(integer) OWNER TO ${OWNER_PROBE}`);
    await client.query(`GRANT USAGE ON SCHEMA vault, core, identity TO ${OWNER_PROBE}`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core, identity TO ${OWNER_PROBE}`);
    // The real owner owns the public tables its triggers and policies read, too.
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${OWNER_PROBE}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

async function setLocal(client: PoolClient, settings: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) await client.query('SELECT set_config($1, $2, true)', [key, value]);
}

/** How many of `t`'s seeded Vault rows the session can see, table by table. */
async function visibleRows(client: PoolClient, t: Tenant): Promise<Record<string, number>> {
  const { rows } = await client.query(
    `SELECT (SELECT count(*)::int FROM vault.documents WHERE id = $1) AS documents,
            (SELECT count(*)::int FROM vault.document_chunks WHERE id = $2) AS document_chunks,
            (SELECT count(*)::int FROM vault.document_catalog WHERE document_id = $1) AS document_catalog,
            (SELECT count(*)::int FROM vault.document_read_receipts WHERE document_id = $1) AS document_read_receipts,
            (SELECT count(*)::int FROM vault.evidence_citations WHERE id = $3) AS evidence_citations,
            (SELECT count(*)::int FROM vault.document_archives WHERE id = $4) AS document_archives`,
    [t.doc, t.chunk, t.citation, t.archive]);
  return rows[0];
}
const ALL_ONE = { documents: 1, document_chunks: 1, document_catalog: 1, document_read_receipts: 1, evidence_citations: 1, document_archives: 1 };
const ALL_ZERO = { documents: 0, document_chunks: 0, document_catalog: 0, document_read_receipts: 0, evidence_citations: 0, document_archives: 0 };

let policiesAfterFirstApply: Awaited<ReturnType<typeof citationPolicies>>;

beforeAll(async () => {
  scratch = await createScratchSchema(databaseUrl);
  for (const file of AMENDED) await scratch.ownerPool.query(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  policiesAfterFirstApply = await citationPolicies();
  for (const file of AMENDED) await scratch.ownerPool.query(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  await scratch.connectAsRuntimeRole();
  await cleanup();
  A = await seedTenant('a');
  B = await seedTenant('b');
}, 180_000);

afterAll(async () => {
  if (!scratch) return;
  await cleanup().catch(() => undefined);
  await scratch.destroy();
});

describe('P-66: an evidence citation cites only its own organization\'s document', () => {
  const insertCitation = (client: PoolClient, source: string, evidence: string) => client.query(
    `INSERT INTO vault.evidence_citations (source_document_id, evidence_document_id, claim_text) VALUES ($1, $2, 'probe')`,
    [source, evidence]);

  it('B cannot cite A\'s document as evidence for its own claim', async () => {
    await expect(withSession(scratch.runtimePool!, scopeOf(B), c => insertCitation(c, B.doc, A.doc)))
      .rejects.toThrow(/row-level security/);
  });

  it('B cites its own documents (the policy is not a blanket deny)', async () => {
    const inserted = await withSession(scratch.runtimePool!, scopeOf(B), c => insertCitation(c, B.doc, B.doc2));
    expect(inserted.rowCount).toBe(1);
  });

  it('B cannot re-point its own citation at A\'s document', async () => {
    await expect(withSession(scratch.runtimePool!, scopeOf(B), c => c.query(
      'UPDATE vault.evidence_citations SET evidence_document_id = $1 WHERE id = $2', [A.doc, B.citation])))
      .rejects.toThrow(/row-level security/);
  });

  it('a delegate that may read A\'s program still cannot cite A\'s document', async () => {
    // B as A's CRO: identity.can_access_program admits A's program for B.
    await scratch.ownerPool.query(
      `INSERT INTO identity.org_relationships (sponsor_org_id, delegate_org_id, contract_start_date, scope_all_programs, created_by)
       VALUES ($1, $2, CURRENT_DATE - 1, TRUE, $3)`, [A.orgUuid, B.orgUuid, PREFIX]);
    try {
      const seen = await withSession(scratch.runtimePool!, scopeOf(B), c =>
        c.query('SELECT count(*)::int AS n FROM vault.documents WHERE id = $1', [A.doc]));
      expect(seen.rows[0].n, 'the delegation fixture did not admit A\'s program').toBe(1);
      await expect(withSession(scratch.runtimePool!, scopeOf(B), c => insertCitation(c, B.doc, A.doc)))
        .rejects.toThrow(/row-level security/);
    } finally {
      await scratch.ownerPool.query('DELETE FROM identity.org_relationships WHERE created_by = $1', [PREFIX]);
    }
  });

  it('the application writer refuses a foreign document before the database is asked', async () => {
    // As the owner (a superuser here), so no policy is in the way: only the writer's own predicate.
    const persist = (AdvancedRAGPipeline.prototype as unknown as {
      persistEvidenceCitations(client: PoolClient, orgUuid: string, query: string, citations: unknown[]): Promise<void>;
    }).persistEvidenceCitations;
    const client = await scratch.ownerPool.connect();
    try {
      const count = async () => Number((await client.query(
        'SELECT count(*) FROM vault.evidence_citations WHERE claim_text = $1', [`${PREFIX} writer`])).rows[0].count);
      await persist.call(null, client, B.orgUuid, `${PREFIX} writer`,
        [{ documentId: A.doc, chunkId: A.chunk, quote: 'A passage', confidence: 0.9 }]);
      expect(await count(), 'the writer filed a citation of another organization\'s document').toBe(0);
      await persist.call(null, client, B.orgUuid, `${PREFIX} writer`,
        [{ documentId: B.doc, chunkId: B.chunk, quote: 'B passage', confidence: 0.9 }]);
      expect(await count()).toBe(1);
    } finally {
      client.release();
    }
  });

  it('a replay replaces no citation policy (the replacement is conditional on the policy text)', async () => {
    const now = await citationPolicies();
    expect(now.map(p => p.oid)).toEqual(policiesAfterFirstApply.map(p => p.oid));
    const insert = now.find(p => p.polname === 'rls_vault_citations_insert');
    const update = now.find(p => p.polname === 'rls_vault_citations_update');
    expect(insert?.check).toMatch(/evidence_document_id/);
    expect(update?.check).toMatch(/evidence_document_id/);
  });
});

describe('P-66: the Vault child tables FORCE row-level security', () => {
  it('every Vault table with row-level security FORCEs it', async () => {
    const { rows } = await scratch.ownerPool.query(
      `SELECT c.relname, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'vault' AND c.relkind = 'r' AND c.relrowsecurity ORDER BY 1`);
    expect(rows.map(r => r.relname)).toEqual(expect.arrayContaining([...CHILD_TABLES, 'documents']));
    for (const r of rows) expect(r.relforcerowsecurity, `vault.${r.relname} is not FORCEd`).toBe(true);
  });

  it('the table owner, not a superuser, reads only its own tenant\'s rows', async () => {
    const seen = await asNonSuperuserOwner(async client => {
      await client.query(`SET LOCAL ROLE ${OWNER_PROBE}`);
      const posture = await client.query(
        `SELECT current_setting('is_superuser') AS su, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass,
                (SELECT bool_and(pg_get_userbyid(c.relowner) = current_user) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'vault' AND c.relname = ANY($1::text[])) AS owns`, [[...CHILD_TABLES]]);
      expect(posture.rows[0]).toEqual({ su: 'off', bypass: false, owns: true });
      await setLocal(client, scopeOf(A));
      return { own: await visibleRows(client, A), other: await visibleRows(client, B) };
    });
    // Positive half first: without it the negative half proves nothing.
    expect(seen.own).toEqual(ALL_ONE);
    expect(seen.other).toEqual(ALL_ZERO);
  });

  it('the purge door, owned by that role, still erases the purged tenant\'s Vault rows and no one else\'s', async () => {
    const result = await asNonSuperuserOwner(async client => {
      await client.query(`SET LOCAL ROLE ${scratch.runtimeRole}`);
      await setLocal(client, { 'app.rls_enforce': 'on', 'app.current_user_role': 'app_super_admin' });
      const door = await client.query('SELECT storage_version_id FROM public.purge_tenant_vault_records($1)', [A.orgId]);
      const leaked = await client.query(`SELECT current_setting('app.bypass_rls', true) AS bypass,
        current_setting('app.current_org_id', true) AS org`);
      await client.query('RESET ROLE');
      return { versions: door.rowCount, leaked: leaked.rows[0], a: await visibleRows(client, A), b: await visibleRows(client, B) };
    });
    expect(result.versions).toBe(2);
    // The door's own scope does not outlive it in the caller's transaction.
    expect(result.leaked.bypass ?? '').toBe('');
    expect(result.leaked.org ?? '').toBe('');
    expect(result.a).toEqual(ALL_ZERO);
    expect(result.b).toEqual(ALL_ONE);
  });
});
