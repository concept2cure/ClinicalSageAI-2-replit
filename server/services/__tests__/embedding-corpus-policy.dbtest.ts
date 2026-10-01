/**
 * findVectorsFromAnotherModel against real PostgreSQL, as the runtime role with
 * RLS enforced: the posture production runs the readiness probe in.
 *
 * ADR-0014 §1.5 (amended 2026-10-01): the self-hosted lane writes BAAI/bge-m3,
 * 1024 values zero-padded to the corpus width, so a column is one vector space
 * only if every vector in it came from that model; a corpus holding vectors
 * from another model is re-embedded before it is served. The rows cannot say
 * which model wrote them (their embedding_model is the name the caller asked
 * for, whichever lane served it), so the check reads the vectors: past position
 * 1024 a padded bge-m3 vector is zero, and an OpenAI vector is not.
 *
 * What only a real database shows: the check must see every row. The platform
 * scope sees a public corpus whole (its policies admit the super-admin arm), but
 * no Vault chunk at all (vault.document_chunks resolves the tenant from the
 * organization's UUID), so the check also reads each organization's corpus in
 * that organization's own scope. A check that read the platform scope alone
 * would report a mixed Vault corpus clean.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../../../tests/setup.db';

const PREFIX = 'dbtest-corpus-lane ';
const CODE = 'DBTEST-CORPUS-LANE-DOC';

/** A vector an OpenAI model wrote: every one of its 1536 values carries signal. */
const FOREIGN = `[${Array.from({ length: 1536 }, (_, i) => ((i % 7) + 1) / 100).join(',')}]`;
/** What the self-hosted lane writes: bge-m3's 1024 values, then 512 zeros. */
const PADDED = `[${Array.from({ length: 1536 }, (_, i) => (i < 1024 ? ((i % 5) + 1) / 100 : 0)).join(',')}]`;

let owner: Pool;
let orgA: number;
let orgB: number;
let vaultChunkId: string;

async function cleanup(): Promise<void> {
  await owner.query('DELETE FROM knowledge_entries WHERE title LIKE $1', [`${PREFIX}%`]);
  await owner.query(
    'DELETE FROM vault.document_chunks WHERE document_id IN (SELECT id FROM vault.documents WHERE document_code = $1)',
    [CODE],
  );
  await owner.query('DELETE FROM vault.documents WHERE document_code = $1', [CODE]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PREFIX}%`]);
}

async function org(slug: string): Promise<number> {
  const r = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PREFIX}${slug}`, `dbtest-corpus-lane-${slug}`],
  );
  return Number(r.rows[0].id);
}

async function knowledgeEntry(organizationId: number | null, vector: string, title: string): Promise<void> {
  await owner.query(
    `INSERT INTO knowledge_entries (entry_type, title, organization_id, embedding)
     VALUES ('guidance', $1, $2, $3::vector)`,
    [`${PREFIX}${title}`, organizationId, vector],
  );
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  orgA = await org('a');
  orgB = await org('b');
  await cleanup();

  // Organization A: one Vault chunk an OpenAI model embedded.
  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'DBTEST-CORPUS-LANE', $2, '510k', 'device', 'FDA', 'Corpus lane AF-1') RETURNING id`,
    [`${PREFIX}program`, orgA],
  );
  const doc = await owner.query(
    `INSERT INTO vault.documents
       (program_id, organization_id, document_code, document_title, document_type,
        version, s3_bucket, s3_key, file_name, file_size, mime_type, content_hash,
        classification, placement_status, processing_status, extracted_text)
     VALUES ($1, $2, $3, 'Embedded before the lane moved', 'OTHER', '1.0', 'local', 'probe/key',
             'before.pdf', 10, 'application/pdf', repeat('c', 64),
             'INTERNAL', 'unfiled', 'INDEXED', 'Batch 23-104 released on 2026-01-12.')
     RETURNING id`,
    [prog.rows[0].id, orgA, CODE],
  );
  const chunk = await owner.query(
    `INSERT INTO vault.document_chunks (document_id, chunk_index, chunk_text, embedding, embedding_model)
     VALUES ($1, 0, 'Batch 23-104 released on 2026-01-12.', $2::vector, 'text-embedding-3-small')
     RETURNING id`,
    [doc.rows[0].id, FOREIGN],
  );
  vaultChunkId = String(chunk.rows[0].id);

  // Organization B: one knowledge entry the self-hosted lane wrote.
  await knowledgeEntry(orgB, PADDED, 'b padded');
  // Platform knowledge (no organization): one an OpenAI model wrote.
  await knowledgeEntry(null, FOREIGN, 'platform foreign');
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

async function check() {
  const { getPool } = await import('../../db/runtime');
  const { findVectorsFromAnotherModel } = await import('../embedding-corpus-policy');
  return findVectorsFromAnotherModel(getPool());
}

describe('findVectorsFromAnotherModel, as the runtime role under RLS', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../db/runtime');
    const { runWithSystemTenantScope } = await import('../../db/tenantStore');
    const r = await runWithSystemTenantScope('embedding-corpus-policy.dbtest', () =>
      getPool().query(
        `SELECT current_user AS who, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('the platform scope cannot see a Vault chunk: reading it alone would report the Vault clean', async () => {
    const { getPool } = await import('../../db/runtime');
    const { runWithSystemTenantScope } = await import('../../db/tenantStore');
    const r = await runWithSystemTenantScope('embedding-corpus-policy.dbtest', () =>
      getPool().query('SELECT count(*)::int AS n FROM vault.document_chunks WHERE id = $1', [vaultChunkId]),
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("finds organization A's Vault chunk from another model, in organization A's own scope", async () => {
    const report = await check();
    expect(report).toMatchObject({ model: 'BAAI/bge-m3', nativeDimensions: 1024 });
    expect(report.examined).toContain('vault.document_chunks');
    const vault = report.findings.find(f => f.table === 'vault.document_chunks');
    expect(vault?.rows).toBeGreaterThanOrEqual(1);
    expect(vault?.scopes).toContain(`organization ${orgA}`);
  }, 60_000);

  it('finds the platform knowledge entry from another model, in the platform scope', async () => {
    const report = await check();
    const knowledge = report.findings.find(f => f.table === 'knowledge_entries');
    expect(knowledge?.scopes).toContain('platform');
  }, 60_000);

  it("does not count the padded vector the self-hosted lane wrote: organization B's corpus is clean", async () => {
    const report = await check();
    const knowledge = report.findings.find(f => f.table === 'knowledge_entries');
    expect(knowledge?.scopes ?? []).not.toContain(`organization ${orgB}`);
  }, 60_000);

  it('and finds organization B as soon as it holds one vector from another model', async () => {
    await knowledgeEntry(orgB, FOREIGN, 'b foreign');
    const report = await check();
    const knowledge = report.findings.find(f => f.table === 'knowledge_entries');
    expect(knowledge?.scopes).toContain(`organization ${orgB}`);
  }, 60_000);
});
