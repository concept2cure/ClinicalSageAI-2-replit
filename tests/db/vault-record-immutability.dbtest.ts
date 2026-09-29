/**
 * The database refuses any change to a recorded Vault version's identity,
 * bytes or lineage (VR-06, row D5).
 *
 * Nothing below the application stopped `UPDATE vault.documents SET
 * content_hash = 'x'`: the Vault's RLS grants UPDATE to program writers, and the
 * runtime role has full DML on the schema. Every guarantee the Vault gives an
 * inspector (the hash the download is verified against, the version label, the
 * program and tenant, the lineage) rested on every code path behaving.
 * migrations/20260926_vault_documents_record_immutability.sql installs a row
 * trigger that holds whatever the path.
 *
 * Runs as the runtime role (app_service) inside the tenant scope a request
 * opens, through the application's own pool, with RLS on. The column rules are
 * the plan's: frozen, write-once (NULL → value only), the storage-adoption
 * exception, and everything else through its named writer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr06 ';
const CODE = 'DBTEST-VR06';
const PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let programId: string;
let otherProgramId: string;
let doc: string;
let legacy: string;

/** Run SQL as app_service in the organization's request scope. */
async function asRuntime(sql: string, params: unknown[] = []): Promise<{ ok: true; rowCount: number } | { ok: false; message: string }> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'tests/db/vault-record-immutability.dbtest.ts' },
    async () => {
      try {
        const r = await pool.query(sql, params);
        return { ok: true as const, rowCount: r.rowCount ?? 0 };
      } catch (e) {
        return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
      }
    },
  );
}

const update = (id: string, set: string, params: unknown[] = []) =>
  asRuntime(`UPDATE vault.documents SET ${set} WHERE id = $1`, [id, ...params]);

const refused = (r: Awaited<ReturnType<typeof asRuntime>>) => {
  expect(r.ok, 'the change was applied').toBe(false);
  if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
};
const applied = (r: Awaited<ReturnType<typeof asRuntime>>) => {
  expect(r, 'a permitted change was refused').toEqual({ ok: true, rowCount: 1 });
};

async function insertDoc(code: string, storageVersionId: string | null): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
       content_hash, classification, placement_status, processing_status, s3_bucket, s3_key, file_name,
       storage_version_id, storage_provider, supersedes_id, retention_policy)
     VALUES ($1, $2, $3, 'Protocol', 'PROTOCOL', '1.0', $4, 'INTERNAL', 'unfiled', 'INDEXED', 'local', $5, 'protocol.pdf',
       $6, 'local', $7, 'GCP-15Y')
     RETURNING id`,
    [programId, orgId, code, code.padEnd(64, '0').slice(0, 64), `uploads/${code}.pdf`, storageVersionId, PARENT],
  );
  return String(rows[0].id);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, 'dbtest-vr06-tenant')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}tenant`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String((await owner.query('SELECT uuid FROM organizations WHERE id = $1', [orgId])).rows[0].uuid);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
  const prog = async (code: string) =>
    String(
      (
        await owner.query(
          `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
           VALUES ($1, $2, $3, '510k', 'device', 'FDA', 'AeroFlow') RETURNING id`,
          [`${PROBE}${code}`, code, orgId],
        )
      ).rows[0].id,
    );
  programId = await prog('DBTEST-VR06-A');
  otherProgramId = await prog('DBTEST-VR06-B');
  doc = await insertDoc(`${CODE}-DOC`, 'dbtest-vr06-v1');
  legacy = await insertDoc(`${CODE}-LEGACY`, null);
});

afterAll(async () => {
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]).catch(() => {});
  await owner.end().catch(() => {});
});

describe('a recorded Vault version cannot be rewritten (VR-06, D5)', () => {
  it('refuses a change to the recorded hash', async () => {
    refused(await update(doc, `content_hash = 'tampered'`));
  });

  it('refuses a new version label, document code, program or tenant', async () => {
    refused(await update(doc, `version = '2.0'`));
    refused(await update(doc, `document_code = 'renamed'`));
    refused(await update(doc, `program_id = $2`, [otherProgramId]));
    refused(await update(doc, `organization_id = organization_id + 1`));
  });

  it('refuses re-pointing a stored copy, or rewriting lineage or retention', async () => {
    refused(await update(doc, `storage_version_id = 'dbtest-vr06-v2'`));
    refused(await update(doc, `s3_key = 'uploads/other.pdf'`));
    refused(await update(doc, `supersedes_id = $2`, [OTHER]));
    refused(await update(doc, `retention_policy = 'NONE'`));
  });

  it('refuses TRUNCATE', async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      // CASCADE, so the foreign keys that already block a plain TRUNCATE are
      // out of the way and only the guard can refuse it. Always rolled back:
      // without the guard this would empty the table (and its dependants) for
      // every suite sharing this database.
      const r = await client.query('TRUNCATE vault.documents CASCADE').then(() => 'truncated', (e: Error) => e.message);
      expect(r).toMatch(/IMMUTABILITY_VIOLATION/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('still allows what the named writers do', async () => {
    // Filing, Edit details and processing are the record's mutable state.
    applied(await update(doc, `folder_id = 'qms', placement_status = 'confirmed', updated_at = NOW()`));
    applied(await update(doc, `document_title = 'Clinical protocol', classification = 'CONFIDENTIAL'`));
    applied(await update(doc, `extracted_text = 'text', page_count = 3, processing_status = 'INDEXED'`));
    // Storage adoption: a record with no storage handle takes one, and its
    // key, bucket and provider with it, the hash unchanged.
    applied(await update(legacy, `storage_version_id = 'dbtest-vr06-v9', s3_key = 'org/v9', s3_bucket = 's3', storage_provider = 's3'`));
  });

  it('allows a soft delete, and refuses undoing one', async () => {
    applied(await update(doc, `deleted_at = NOW()`));
    refused(await update(doc, `deleted_at = NULL`));
  });
});
