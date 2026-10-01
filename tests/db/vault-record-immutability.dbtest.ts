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
 *
 * VR-07 (rows D5, D6): nor can a recorded version be deleted. Only the table's
 * owner may DELETE, and the runtime role reaches that only through
 * public.purge_tenant_vault_records, which refuses unless the organization is
 * pending deletion, has no active legal hold, and the caller is in the platform
 * scope the purge route runs in.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr06 ';
const CODE = 'DBTEST-VR06';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let programId: string;
let otherProgramId: string;
let doc: string;
let legacy: string;

type Outcome = { ok: true; rowCount: number; rows: Array<Record<string, unknown>> } | { ok: false; message: string };
/** A request's tenant scope, or the platform scope the purge route runs in. */
type Scope = { org: number; uuid: string } | 'system';

/** Run statements as app_service in one transaction, in a scope; the last one's result is returned. */
async function runtimeTx(statements: Array<[string, unknown[]?]>, scope?: Scope): Promise<Outcome> {
  const { runWithTenantScope, runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const body = async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let last = { rowCount: 0 as number | null, rows: [] as Array<Record<string, unknown>> };
      for (const [sql, params] of statements) last = await client.query(sql, params ?? []);
      await client.query('COMMIT');
      return { ok: true, rowCount: last.rowCount ?? 0, rows: last.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  };
  const caller = 'tests/db/vault-record-immutability.dbtest.ts';
  if (scope === 'system') return runWithSystemTenantScope(caller, body);
  const { org, uuid } = scope ?? { org: orgId, uuid: orgUuid };
  return runWithTenantScope({ tenantId: String(org), orgUuid: uuid, role: 'admin', source: 'request', caller }, body);
}

const asRuntime = (sql: string, params: unknown[] = [], scope?: Scope) => runtimeTx([[sql, params]], scope);

const update = (id: string, set: string, params: unknown[] = []) =>
  asRuntime(`UPDATE vault.documents SET ${set} WHERE id = $1`, [id, ...params]);

const refused = (r: Awaited<ReturnType<typeof asRuntime>>) => {
  expect(r.ok, 'the change was applied').toBe(false);
  if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
};
const applied = (r: Awaited<ReturnType<typeof asRuntime>>) => {
  expect(r.ok ? r.rowCount : r.message, 'a permitted change was refused').toBe(1);
};

/**
 * One version. A predecessor, when named, must be a live version of the same
 * program, code and organization (the VR-08 lineage guard,
 * migrations/20260930_vault_documents_version_lineage.sql). This fixture used
 * to point every row at a UUID that named no document, which that guard now
 * refuses, rightly.
 */
async function insertDoc(
  code: string,
  storageVersionId: string | null,
  program = programId,
  org = orgId,
  opts: { version?: string; supersedes?: string | null } = {},
): Promise<string> {
  const version = opts.version ?? '1.0';
  const seed = version === '1.0' ? code : `${code}-${version}`;
  const { rows } = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
       content_hash, classification, placement_status, processing_status, s3_bucket, s3_key, file_name,
       storage_version_id, storage_provider, supersedes_id, retention_policy)
     VALUES ($1, $2, $3, 'Protocol', 'PROTOCOL', $8, $4, 'INTERNAL', 'unfiled', 'INDEXED', 'local', $5, 'protocol.pdf',
       $6, 'local', $7, 'GCP-15Y')
     RETURNING id`,
    [program, org, code, seed.padEnd(64, '0').slice(0, 64), `uploads/${seed}.pdf`, storageVersionId, opts.supersedes ?? null, version],
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
  // A probe program an interrupted run left behind carries the document each
  // deploy's backfill gives every program (20260529_phase9_backfill.sql).
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  );
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
  // The subject carries a recorded lineage: it succeeds an earlier version.
  const predecessor = await insertDoc(`${CODE}-DOC`, null, programId, orgId, { version: '0' });
  doc = await insertDoc(`${CODE}-DOC`, 'dbtest-vr06-v1', programId, orgId, { supersedes: predecessor });
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
    // Another live version of the same family, with no successor: a pointer the
    // lineage guard would admit, so only the write-once rule refuses it.
    const sibling = await insertDoc(`${CODE}-DOC`, null, programId, orgId, { version: '0.5' });
    refused(await update(doc, `supersedes_id = $2`, [sibling]));
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

describe('a recorded Vault version is deleted only by the tenant purge (VR-07, D5/D6)', () => {
  let purgeOrg: number;
  let purgeUuid: string;
  let purgeDocs: string[];
  let bystander: string;

  const exists = async (id: string) =>
    (await owner.query('SELECT 1 FROM vault.documents WHERE id = $1', [id])).rowCount === 1;
  const setStatus = (status: string) => owner.query('UPDATE organizations SET status = $2 WHERE id = $1', [purgeOrg, status]);
  const purge = (scope: Scope = 'system') =>
    asRuntime('SELECT count(*)::int AS deleted FROM public.purge_tenant_vault_records($1)', [purgeOrg], scope);
  const purgeRefused = (r: Outcome, why: RegExp) => {
    expect(r.ok, 'the purge function deleted').toBe(false);
    if (!r.ok) expect(r.message).toMatch(why);
  };

  beforeAll(async () => {
    const org = await owner.query(
      `INSERT INTO organizations (name, slug, status) VALUES ($1, 'dbtest-vr07-tenant', 'active')
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active' RETURNING id, uuid`,
      [`${PROBE}purged tenant`],
    );
    purgeOrg = Number(org.rows[0].id);
    purgeUuid = String(org.rows[0].uuid);
    await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [purgeOrg]);
    const prog = await owner.query(
      `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
       VALUES ($1, 'DBTEST-VR07', $2, '510k', 'device', 'FDA', 'AeroFlow') RETURNING id`,
      [`${PROBE}DBTEST-VR07`, purgeOrg],
    );
    const program = String(prog.rows[0].id);
    purgeDocs = [
      await insertDoc(`${CODE}-P1`, 'dbtest-vr07-v1', program, purgeOrg),
      await insertDoc(`${CODE}-P2`, null, program, purgeOrg),
    ];
    bystander = await insertDoc(`${CODE}-BYSTANDER`, 'dbtest-vr07-b1');
  });

  afterAll(async () => {
    await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [purgeOrg]).catch(() => {});
    await setStatus('active').catch(() => {});
  });

  it('refuses a DELETE by the runtime role', async () => {
    refused(await asRuntime('DELETE FROM vault.documents WHERE id = $1', [bystander]));
    expect(await exists(bystander)).toBe(true);
  });

  it('has no settable bypass: session settings made before the DELETE change nothing', async () => {
    refused(
      await runtimeTx(
        [
          [`SET LOCAL app.rls_enforce = 'off'`],
          [`SET LOCAL app.current_user_role = 'app_super_admin'`],
          [`SET LOCAL app.allow_vault_delete = 'on'`],
          ['DELETE FROM vault.documents WHERE id = $1', [bystander]],
        ],
      ),
    );
    expect(await exists(bystander)).toBe(true);
  });

  it('the purge function refuses an organization that is not pending deletion', async () => {
    await setStatus('active');
    purgeRefused(await purge(), /VAULT_PURGE_REFUSED: .*not pending deletion/);
    for (const id of purgeDocs) expect(await exists(id)).toBe(true);
  });

  it('refuses while a legal hold on the organization is active', async () => {
    await setStatus('pending_deletion');
    await owner.query(
      `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id)
       SELECT $1, 'LH-VR07', 'dbtest', 'program', id FROM regulatory_programs WHERE code = 'DBTEST-VR07' AND organization_id = $1`,
      [purgeOrg],
    );
    purgeRefused(await purge(), /VAULT_PURGE_REFUSED: .*legal hold/);
    for (const id of purgeDocs) expect(await exists(id)).toBe(true);
    await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [purgeOrg]);
  });

  it('refuses a caller in a tenant scope, even for its own organization', async () => {
    await setStatus('pending_deletion');
    purgeRefused(await purge({ org: purgeOrg, uuid: purgeUuid }), /VAULT_PURGE_REFUSED: .*platform scope/);
    for (const id of purgeDocs) expect(await exists(id)).toBe(true);
  });

  it("deletes that organization's versions, and only those, once pending deletion with no active hold", async () => {
    await setStatus('pending_deletion');
    const r = await purge();
    expect(r.ok ? r.rows[0]?.deleted : r.message).toBe(purgeDocs.length);
    for (const id of purgeDocs) expect(await exists(id)).toBe(false);
    expect(await exists(bystander)).toBe(true);
  });
});
