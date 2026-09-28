/**
 * A tenant purge is all or nothing, refuses under a legal hold, and is
 * authorized only by a complete export.
 *
 * `purgeTenant` (server/services/tenant/tenant-offboarding.ts) is the one
 * irreversible operation in tenant offboarding. The 2026-09-24 vault
 * re-baseline confirmed three defects in it (docs/evidence/D6-EXPORT-COVERS-PURGE/,
 * "Not done"):
 *
 *   1. Its BEGIN / COMMIT / ROLLBACK ran through `pool.query`, which may take
 *      any connection for any statement. The deletes were not in the
 *      transaction the BEGIN opened, so a failure part-way left the tenant
 *      half-destroyed, with the ROLLBACK undoing nothing.
 *   2. A truncated or partly failed export still produced a receipt, and the
 *      receipt is what authorizes the purge. A customer could be handed an
 *      incomplete return of their data, and it would then be destroyed.
 *   3. No legal hold was consulted. `vault.legal_holds` exists, and a record
 *      under hold must not be destroyed by anyone.
 *
 * On PostgreSQL built by install-fresh + deploy-migrate. The failure-part-way
 * cases hand the purge a pool whose `query()` takes a fresh connection for
 * every statement. pg's Pool permits exactly that, and a busy pool does it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg, { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { purgeTenant } from '../../server/services/tenant/tenant-offboarding';
import { recordExportReceipt } from '../../server/services/tenant-export/tenant-full-export.service';
import { LocalStorageProvider } from '../../server/services/storage/local-provider';
import { resetStorageProvider } from '../../server/services/storage';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ORG = 90601;
const TAG = `purge_${process.pid}_${Date.now().toString(36)}`;
const DIGEST = `${TAG}-digest`;
const ROWS = 'purge_probe_rows';
const REFUSES = 'purge_probe_refuses';

let owner: Pool;

/** pg's Pool contract, taken literally: every query() may land on a new connection. */
function everyStatementOnItsOwnConnection(real: Pool): Pool {
  return {
    async query(text: string, params?: unknown[]) {
      const c = new pg.Client({ connectionString: databaseUrl });
      await c.connect();
      try {
        return await c.query(text, params);
      } finally {
        await c.end();
      }
    },
    connect: () => real.connect(),
  } as unknown as Pool;
}

const purge = (pool: Pool, childTables: string[], digest = DIGEST) =>
  purgeTenant(pool, {
    organizationId: ORG,
    purgedByUserId: 1,
    preconditions: { finalExportDigest: digest },
    childTables,
  });

async function rowsLeft(): Promise<number> {
  return (await owner.query(`SELECT count(*)::int AS n FROM ${ROWS} WHERE organization_id = $1`, [ORG])).rows[0].n;
}
async function status(): Promise<string> {
  return (await owner.query('SELECT status FROM organizations WHERE id = $1', [ORG])).rows[0].status;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(`CREATE TABLE IF NOT EXISTS ${ROWS} (organization_id INTEGER, note TEXT)`);
  await owner.query(`CREATE TABLE IF NOT EXISTS ${REFUSES} (organization_id INTEGER)`);
  // A table whose delete fails: the part-way failure every purge must survive.
  await owner.query(`
    CREATE OR REPLACE FUNCTION purge_probe_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'purge probe refuses'; END $$`);
  await owner.query(`DROP TRIGGER IF EXISTS purge_probe_refuse ON ${REFUSES}`);
  await owner.query(`CREATE TRIGGER purge_probe_refuse BEFORE DELETE ON ${REFUSES} FOR EACH ROW EXECUTE FUNCTION purge_probe_refuse()`);
});

beforeEach(async () => {
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status, deletion_requested_at, purge_eligible_at)
     VALUES ($1, $2, $2, 'pending_deletion', now() - interval '40 days', now() - interval '1 day')
     ON CONFLICT (id) DO UPDATE SET status = 'pending_deletion', purged_at = NULL, purged_by = NULL,
       final_export_digest = NULL, purge_eligible_at = now() - interval '1 day'`,
    [ORG, TAG],
  );
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query(
    `INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by)
     VALUES ($1, $2, 5, 10, NULL)`,
    [ORG, DIGEST],
  );
  await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM vault.documents WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM regulatory_programs WHERE organization_id = $1', [ORG]);
  for (const t of [ROWS, REFUSES]) {
    await owner.query(`ALTER TABLE ${t} DISABLE TRIGGER ALL`);
    await owner.query(`DELETE FROM ${t} WHERE organization_id = $1`, [ORG]);
    await owner.query(`ALTER TABLE ${t} ENABLE TRIGGER ALL`);
    await owner.query(`INSERT INTO ${t} (organization_id) VALUES ($1)`, [ORG]);
  }
});

afterAll(async () => {
  if (!owner) return;
  await owner.query(`DROP TABLE IF EXISTS ${ROWS}`);
  await owner.query(`DROP TABLE IF EXISTS ${REFUSES}`);
  await owner.query('DROP FUNCTION IF EXISTS purge_probe_refuse()');
  await owner.query('DELETE FROM tenant_export_receipts WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM vault.documents WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM regulatory_programs WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM organizations WHERE id = $1', [ORG]);
  await owner.end();
  await fs.rm(path.resolve(process.cwd(), 'storage', 'vault', String(ORG)), { recursive: true, force: true });
});

describe('the purge is one transaction', () => {
  it('leaves the tenant exactly as it was when a table fails part-way', async () => {
    await expect(purge(everyStatementOnItsOwnConnection(owner), [ROWS, REFUSES])).rejects.toThrow(/purge probe refuses/);
    expect(await rowsLeft(), 'a failed purge must destroy nothing').toBe(1);
    expect(await status()).toBe('pending_deletion');
  });

  it('removes every listed table’s rows and marks the tenant purged when nothing fails', async () => {
    await purge(everyStatementOnItsOwnConnection(owner), [ROWS]);
    expect(await rowsLeft()).toBe(0);
    expect(await status()).toBe('purged');
  });

  it('still skips a table this deployment’s schema does not have', async () => {
    await purge(owner, [ROWS, 'purge_probe_no_such_table']);
    expect(await rowsLeft()).toBe(0);
    expect(await status()).toBe('purged');
  });
});

describe('a legal hold stops the purge', () => {
  it('refuses while any hold on the tenant is active, and destroys nothing', async () => {
    await owner.query(
      `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id)
       VALUES ($1, $2, 'litigation hold', 'program', gen_random_uuid())`,
      [ORG, `${TAG}-hold`],
    );
    await expect(purge(owner, [ROWS])).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE' });
    expect(await rowsLeft()).toBe(1);
    expect(await status()).toBe('pending_deletion');
  });

  it('proceeds once the hold is lifted, by someone, for a reason', async () => {
    await owner.query(
      `INSERT INTO vault.legal_holds (organization_id, reference, reason, scope, program_id, lifted_at, lifted_by, lift_reason)
       VALUES ($1, $2, 'litigation hold', 'program', gen_random_uuid(), now(), 1, 'matter closed')`,
      [ORG, `${TAG}-lifted`],
    );
    await purge(owner, [ROWS]);
    expect(await status()).toBe('purged');
  });
});

describe('only a complete export authorizes a purge', () => {
  it('records no receipt for a truncated export, so its digest opens nothing', async () => {
    const digest = `${TAG}-truncated`;
    const outcome = await recordExportReceipt(owner, {
      organizationId: ORG,
      digest,
      tableCount: 5,
      rowCount: 10,
      createdBy: null,
      coverage: { tablesFailed: [], truncatedTables: ['vault.documents'] },
    } as never);
    expect(outcome.recorded, 'an incomplete return must not become purge evidence').toBe(false);
    await expect(purge(owner, [ROWS], digest)).rejects.toMatchObject({ code: 'EXPORT_EVIDENCE_UNVERIFIED' });
    expect(await rowsLeft()).toBe(1);
  });

  it('records no receipt for an export in which a table failed to read', async () => {
    const outcome = await recordExportReceipt(owner, {
      organizationId: ORG,
      digest: `${TAG}-partial`,
      tableCount: 5,
      rowCount: 10,
      createdBy: null,
      coverage: { tablesFailed: [{ table: 'projects', error: 'permission denied' }], truncatedTables: [] },
    } as never);
    expect(outcome.recorded).toBe(false);
  });

  it('records one for a complete export', async () => {
    const outcome = await recordExportReceipt(owner, {
      organizationId: ORG,
      digest: `${TAG}-complete`,
      tableCount: 5,
      rowCount: 10,
      createdBy: null,
      coverage: { tablesFailed: [], truncatedTables: [] },
    } as never);
    expect(outcome.recorded).toBe(true);
  });
});

describe("the purge erases the vault's stored bytes, and only once it has committed", () => {
  const VAULT = ['vault.document_chunks', 'vault.documents', 'regulatory_programs'];
  const BYTES = Buffer.from('%PDF-1.7\npurge fixture\n');
  let versionId: string;

  beforeEach(async () => {
    delete process.env.STORAGE_PROVIDER;
    resetStorageProvider();
    const program = await owner.query(
      `INSERT INTO regulatory_programs
         (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, 'PRG-1', 'ind', 'drug', 'FDA', 'fixture product') RETURNING id`,
      [ORG, `${TAG}-program`],
    );
    const written = await new LocalStorageProvider().put({
      orgId: ORG,
      projectId: program.rows[0].id,
      filename: 'csr.pdf',
      bytes: BYTES,
      mime: 'application/pdf',
    });
    versionId = written.vaultVersionId;
    await owner.query(
      `INSERT INTO vault.documents (program_id, organization_id, content_hash, storage_version_id, storage_provider, status)
       VALUES ($1, $2, $3, $4, 'local', 'completed')`,
      [program.rows[0].id, ORG, createHash('sha256').update(BYTES).digest('hex'), versionId],
    );
  });

  it('deletes each object from the store it was saved in, after the purge commits', async () => {
    const result = await purge(owner, [...VAULT, ROWS]);
    expect(result.storageErasure).toEqual({ objects: 1, deleted: 1, notDeleted: [] });
    expect(await new LocalStorageProvider().get(versionId, ORG), 'the bytes must go with their record').toBeNull();
  });

  it('keeps the bytes, and their record, when the purge fails part-way', async () => {
    await expect(purge(everyStatementOnItsOwnConnection(owner), [...VAULT, ROWS, REFUSES])).rejects.toThrow(
      /purge probe refuses/,
    );
    expect(await new LocalStorageProvider().get(versionId, ORG)).not.toBeNull();
    expect((await owner.query('SELECT count(*)::int AS n FROM vault.documents WHERE organization_id = $1', [ORG])).rows[0].n).toBe(1);
  });

  it('leaves the bytes of records a purge does not remove', async () => {
    const result = await purge(owner, [ROWS]);
    expect(result.storageErasure.objects).toBe(0);
    expect(await new LocalStorageProvider().get(versionId, ORG)).not.toBeNull();
  });
});
