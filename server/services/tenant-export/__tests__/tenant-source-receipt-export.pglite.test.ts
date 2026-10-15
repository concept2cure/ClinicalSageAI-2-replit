/** Actual new migration + canonical complete export; sequential PGlite proof. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fingerprintSourceAdmissionReceiptV2, type SourceAdmissionReceiptV2 } from '../../../../shared/ana/source-admission-receipts.js';
import { discoverTenantTables, exportTenantFull, recordExportReceipt, digestOf } from '../tenant-full-export.service';

let db: PGlite;
const ORG = 42;
const FOREIGN = 43;
const descriptor = (organizationId: number): SourceAdmissionReceiptV2 => ({ version: 2,
  receiptId: `30000000-0000-4000-8000-${String(organizationId).padStart(12, '0')}`, checkpoint: 'host_budget_admitted',
  organizationId, actorId: 7, admittedRole: 'viewer', programId: '10000000-0000-4000-8000-000000000001',
  documentId: '20000000-0000-4000-8000-000000000001', originalSha256: 'a'.repeat(64), extractionSha256: 'b'.repeat(64),
  totalChars: 20, ranges: [{ start: 0, end: 3, sha256: 'c'.repeat(64) }, { start: 15, end: 20, sha256: 'd'.repeat(64) }],
  payloadSha256: 'e'.repeat(64), toolUseId: 'synthetic-tool', threadId: `synthetic-thread-${organizationId}` });
const q = () => ({ query: async (sql: string, params?: unknown[]) => {
  const result = await db.query(sql, params);
  return { ...result, rowCount: result.affectedRows };
} }) as never;
const record = (out: Awaited<ReturnType<typeof exportTenantFull>>) => recordExportReceipt(q(), {
  organizationId: ORG, digest: digestOf(out), tableCount: out.coverage.tablesExported, rowCount: out.coverage.totalRows,
  createdBy: 7, coverage: out.coverage,
});
async function seed(organizationId: number) {
  const d = descriptor(organizationId);
  await db.query(`INSERT INTO public.ana_source_read_receipts
    (id,organization_id,receipt_version,checkpoint,actor_user_id,admitted_role,program_id,document_id,
      original_sha256,extraction_sha256,total_chars,ranges,payload_sha256,tool_use_id,thread_id,receipt_sha256)
    VALUES ($1,$2,2,'host_budget_admitted',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
  [d.receiptId, organizationId, d.actorId, d.admittedRole, d.programId, d.documentId, d.originalSha256, d.extractionSha256,
    d.totalChars, JSON.stringify(d.ranges), d.payloadSha256, d.toolUseId, d.threadId, await fingerprintSourceAdmissionReceiptV2(d)]);
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE TABLE organizations (id integer PRIMARY KEY, slug text, name text, status text);
    INSERT INTO organizations VALUES (42,'synthetic-42','Synthetic tenant','pending_deletion'),(43,'synthetic-43','Foreign fixture','active');
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds (id serial PRIMARY KEY, organization_id integer, lifted_at timestamptz);
    CREATE ROLE app_service NOLOGIN NOSUPERUSER NOBYPASSRLS;
    SELECT set_config('app.current_user_role','app_super_admin',false);`);
  await db.exec(readFileSync('migrations/20261014_ana_source_read_receipts.sql', 'utf8'));
  await db.exec(readFileSync('migrations/20260813b_tenant_export_receipts.sql', 'utf8'));
  await seed(ORG); await seed(FOREIGN);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('source admission receipts in the actual complete tenant export', () => {
  it('discovers the installed integer-tenant ledger through the canonical catalog sweep', async () => {
    expect(await discoverTenantTables(q())).toContainEqual({ schema: 'public', table: 'ana_source_read_receipts', tenantColumn: 'organization_id' });
  });

  it('returns the target tenant immutable metadata and no foreign actor context or source text', async () => {
    const out = await exportTenantFull(q(), ORG);
    const exported = out.tables.find(t => t.table === 'ana_source_read_receipts');
    expect(exported).toMatchObject({ rowCount: 1, truncated: false, tenantColumn: 'organization_id' });
    expect(exported!.rows[0]).toMatchObject({ id: descriptor(ORG).receiptId, organization_id: ORG,
      receipt_version: 2, checkpoint: 'host_budget_admitted', actor_user_id: 7, thread_id: 'synthetic-thread-42',
      ranges: descriptor(ORG).ranges, receipt_sha256: await fingerprintSourceAdmissionReceiptV2(descriptor(ORG)) });
    expect(JSON.stringify(exported)).not.toContain('synthetic-thread-43');
    expect(exported!.rows[0]).not.toHaveProperty('extracted_text');
    expect(exported!.rows[0]).not.toHaveProperty('quoted_text');
    expect(out.coverage.tablesFailed).toEqual([]);
    expect(await record(out)).toMatchObject({ recorded: true, inserted: true });
    expect((await db.query('SELECT digest,row_count FROM tenant_export_receipts WHERE organization_id=$1', [ORG])).rows)
      .toMatchObject([{ digest: digestOf(out), row_count: out.coverage.totalRows }]);
  });

  it('a receipt-store read failure is an export gap and cannot earn a final-export receipt', async () => {
    const failing = { query: (sql: string, params?: unknown[]) => sql.includes('FROM "public"."ana_source_read_receipts"')
      ? Promise.reject(new Error('Synthetic receipt-store read unavailable')) : db.query(sql, params) } as never;
    const out = await exportTenantFull(failing, ORG);
    expect(out.coverage.tablesFailed).toContainEqual({ table: 'ana_source_read_receipts', error: 'Synthetic receipt-store read unavailable' });
    expect(await record(out)).toMatchObject({ recorded: false, inserted: false });
  });
});
