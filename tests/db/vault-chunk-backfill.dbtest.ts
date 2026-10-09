/**
 * scripts/backfill-vault-chunks.mjs against real PostgreSQL, as the runtime
 * role with RLS enforced — the posture production requires.
 *
 * The script called backfillVaultChunks(orgId) with no tenant scope. Under
 * RLS_ENFORCE=on the pool refuses every query issued outside one, so the one
 * operator tool for indexing a tenant's pre-chunking documents could not run
 * where it is needed. And a scope is not enough by itself: the vault's policies
 * resolve the tenant from its UUID (identity.current_org_id() reads only that),
 * so a scope carrying the integer id alone sees no documents — and the sweep
 * reports "examined 0", which reads as "nothing left to index".
 *
 * backfillVaultChunksForTenant resolves the organization's UUID and runs the
 * sweep in that tenant's scope. Dry-run only here: an applied run embeds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PREFIX = 'dbtest-backfill ';
const CODE = 'DBTEST-BACKFILL-DOC';

let owner: Pool;
let orgId: number;
let documentId: string;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PREFIX}tenant`, 'dbtest-backfill-tenant'],
  );
  orgId = Number(org.rows[0].id);
  await owner.query('DELETE FROM vault.documents WHERE document_code = $1', [CODE]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PREFIX}%`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'DBTEST-BACKFILL', $2, '510k', 'device', 'FDA', 'Backfill AF-1') RETURNING id`,
    [`${PREFIX}program`, orgId],
  );
  const doc = await owner.query(
    `INSERT INTO vault.documents
       (program_id, organization_id, document_code, document_title, document_type,
        version, s3_bucket, s3_key, file_name, file_size, mime_type, content_hash,
        classification, placement_status, processing_status, extracted_text)
     VALUES ($1, $2, $3, 'Pre-chunking upload', 'OTHER', '1.0', 'local', 'probe/key',
             'pre-chunking.pdf', 10, 'application/pdf', repeat('b', 64),
             'INTERNAL', 'unfiled', 'INDEXED', 'Batch 23-104 released on 2026-01-12.')
     RETURNING id`,
    [prog.rows[0].id, orgId, CODE],
  );
  documentId = String(doc.rows[0].id);
});

afterAll(async () => {
  await owner.query('DELETE FROM vault.documents WHERE document_code = $1', [CODE]).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PREFIX}%`]).catch(() => {});
  await owner.end().catch(() => {});
});

describe('the chunk backfill runs in the tenant it indexes', () => {
  it('the call the script made — no tenant scope — is refused under RLS enforcement', async () => {
    const { backfillVaultChunks } = await import('../../server/services/vault/document-chunking-backfill.service');
    await expect(backfillVaultChunks(orgId)).rejects.toThrow();
  });

  it('a scope with the integer id but no UUID sees nothing — and would report nothing to do', async () => {
    const { backfillVaultChunks } = await import('../../server/services/vault/document-chunking-backfill.service');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithTenantScope(
      { tenantId: String(orgId), role: null, source: 'job', caller: 'vault-chunk-backfill.dbtest' },
      () => backfillVaultChunks(orgId),
    );
    expect(r.examined).toBe(0);
  });

  it('backfillVaultChunksForTenant finds the document the tenant owns', async () => {
    const svc = await import('../../server/services/vault/document-chunking-backfill.service');
    const r = await svc.backfillVaultChunksForTenant(orgId, { limit: 50 });
    expect(r.dryRun).toBe(true);
    expect(r.examined).toBeGreaterThanOrEqual(1);
    expect(r.skipped.map((s) => s.documentId)).not.toContain(documentId);
  });

  it('refuses an organization that does not exist, rather than sweeping nothing', async () => {
    const svc = await import('../../server/services/vault/document-chunking-backfill.service');
    await expect(svc.backfillVaultChunksForTenant(2147480000)).rejects.toThrow(/no organization/i);
  });
});
