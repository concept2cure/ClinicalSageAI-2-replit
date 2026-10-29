/** Native receipt purge + regulated retention: fresh synthetic tenants, all history retained. */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { fingerprintSourceAdmissionReceiptV2, type SourceAdmissionReceiptV2 } from '../../shared/ana/source-admission-receipts';
import { digestOf, exportTenantFull, recordExportReceipt } from '../../server/services/tenant-export/tenant-full-export.service';
import { purgeTenant } from '../../server/services/tenant/tenant-offboarding';
import { runWithSystemTenantScope } from '../../server/db/tenantStore';
import { shouldUseSsl } from '../../server/db/ssl';

const TAG = `receipt-retention-${randomUUID().slice(0, 10)}`;
const PASSWORD = 'Synthetic-receipt-retention-native-proof';
const PROSE = 'Invented controlled procedure: preserve the original record and every correction reason.';
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let actor: number;
let signer: number;
type Tenant = { id: number; programId: string; documentId: string; receiptId: string; digest: string };

async function freshTenant(label: string, active = false): Promise<Tenant> {
  const organization = (await owner.query(`INSERT INTO organizations(name,slug,status,payment_status,
    deletion_requested_at,deletion_requested_by,deletion_reason,purge_eligible_at)
    VALUES($1,$1,$2,'active',now()-interval '40 days',$3,$4,now()-interval '1 day') RETURNING id`,
  [`${TAG}-${label}`, active ? 'active' : 'pending_deletion', actor, 'Invented native offboarding fixture.'])).rows[0];
  const id = Number(organization.id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'admin'),($1,$3,'admin')", [id, actor, signer]);
  return { id, programId: randomUUID(), documentId: randomUUID(), receiptId: randomUUID(), digest: '' };
}

async function exportedReceipt(tenant: Tenant): Promise<void> {
  const descriptor: SourceAdmissionReceiptV2 = { version: 2, checkpoint: 'host_budget_admitted', receiptId: tenant.receiptId,
    organizationId: tenant.id, actorId: actor, admittedRole: 'admin', programId: tenant.programId, documentId: tenant.documentId,
    originalSha256: 'a'.repeat(64), extractionSha256: 'b'.repeat(64), totalChars: 12,
    ranges: [{ start: 0, end: 12, sha256: 'c'.repeat(64) }], payloadSha256: 'd'.repeat(64),
    toolUseId: `${TAG}-synthetic-tool`, threadId: `${TAG}-synthetic-thread` };
  // Invented observational metadata, not a claim that a provider received source text.
  await owner.query(`INSERT INTO ana_source_read_receipts(id,organization_id,receipt_version,checkpoint,actor_user_id,
    admitted_role,program_id,document_id,original_sha256,extraction_sha256,total_chars,ranges,payload_sha256,tool_use_id,thread_id,receipt_sha256)
    VALUES($1,$2,2,'host_budget_admitted',$3,'admin',$4,$5,$6,$7,12,$8::jsonb,$9,$10,$11,$12)`,
  [tenant.receiptId, tenant.id, actor, tenant.programId, tenant.documentId, descriptor.originalSha256, descriptor.extractionSha256,
    JSON.stringify(descriptor.ranges), descriptor.payloadSha256, descriptor.toolUseId, descriptor.threadId,
    await fingerprintSourceAdmissionReceiptV2(descriptor)]);
  const exported = await exportTenantFull(owner, tenant.id);
  expect(exported.coverage.tablesFailed).toEqual([]); expect(exported.coverage.truncatedTables).toEqual([]);
  expect(exported.tables.find(row => row.table === 'ana_source_read_receipts')?.rowCount).toBe(1);
  tenant.digest = digestOf(exported);
  expect(await recordExportReceipt(owner, { organizationId: tenant.id, digest: tenant.digest,
    tableCount: exported.coverage.tablesExported, rowCount: exported.coverage.totalRows, createdBy: actor,
    coverage: exported.coverage })).toMatchObject({ recorded: true, inserted: true });
}

function tracedPool(statements: string[], failAudit = false): Pool {
  return new Proxy(runtime, { get(target, property) {
    if (property === 'connect') return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, key) {
        if (key === 'query') return (sql: string, params?: unknown[]) => {
          statements.push(sql);
          return failAudit && /INSERT INTO audit_logs/.test(sql) ? connection.query('SELECT 1/0') : connection.query(sql, params);
        };
        const value = Reflect.get(connection, key, connection);
        return typeof value === 'function' ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
const purge = (tenant: Tenant, statements: string[], failAudit = false) => runWithSystemTenantScope(TAG, () =>
  purgeTenant(tracedPool(statements, failAudit), { organizationId: tenant.id, purgedByUserId: actor,
    preconditions: { finalExportDigest: tenant.digest }, childTables: ['ana_source_read_receipts'] }));
async function state(tenant: Tenant) {
  return (await owner.query(`SELECT o.status,(SELECT count(*)::int FROM ana_source_read_receipts WHERE organization_id=o.id) AS receipts,
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=o.id AND action='tenant_purged') AS purge_audits
    FROM organizations o WHERE o.id=$1`, [tenant.id])).rows[0];
}
function refusedBeforeErasure(statements: string[]) {
  expect(statements.some(sql => /FROM public.purge_tenant_source_read_receipts/.test(sql))).toBe(false);
  expect(statements.some(sql => /^DELETE|^UPDATE organizations|INSERT INTO audit_logs/.test(sql))).toBe(false);
  expect(statements).toContain('ROLLBACK'); expect(statements).not.toContain('COMMIT');
}

async function signedProcedure(tenant: Tenant): Promise<void> {
  const workspace = (await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [tenant.id, TAG])).rows[0];
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4,'active')`, [tenant.programId, tenant.id, `${TAG}-${tenant.id}`, actor]);
  await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'program','active',$4,$4,$5,'{}'::json)`, [tenant.id, workspace.id, TAG, actor, tenant.programId]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const invoke = (by: number, method: 'post' | 'patch', path: string, body: object) => request(app)[method](`/api/mdx/qms/documents${path}`)
    .set('Authorization', `Bearer ${jwt.sign({ type: 'access', userId: String(by), organizationId: String(tenant.id), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' })}`).send(body);
  const created = await invoke(actor, 'post', '', { title: `${TAG} controlled procedure`, docType: 'sop', programId: tenant.programId, reason: 'Create invented controlled retention proof.' });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const id = Number(created.body.data.id); tenant.documentId = created.body.data.authoring_document_id;
  // Trusted saved-prose fixture; this does not claim the editor-save API was exercised.
  await owner.query('UPDATE authoring_sections SET content=$2 WHERE doc_id=$1', [tenant.documentId, PROSE]);
  // RR4 (decision D-Q; docs/design/REVIEW_ROUTING_2026-10-23.md §2.7): the signer approves as the organization's designated
  // QMS approver, and sending for review names its route, as mdx-qms-request-rls.dbtest.ts sends it.
  await owner.query('UPDATE organization_users SET qms_approver_designated_at=now(), qms_approver_designated_by=$3 WHERE organization_id=$1 AND user_id=$2', [tenant.id, signer, actor]);
  const route = { reviewers: [], approvers: [signer], approvalDueDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) };
  const sent = await invoke(actor, 'patch', `/${id}`, { status: 'in_review', reason: 'Route saved invented procedure for review.', route });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const signed = await invoke(signer, 'post', `/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: 'Independent actual signature for retained invented procedure.' });
  expect(signed.status, JSON.stringify(signed.body)).toBe(200);
  expect(signed.body.meta.signature.id).toBeGreaterThan(0);
  await owner.query("UPDATE organizations SET status='pending_deletion' WHERE id=$1", [tenant.id]);
}

const priorAuditHmacKey = process.env.AUDIT_HMAC_KEY;
const priorAuditHmacSecret = process.env.AUDIT_HMAC_SECRET;
function restoreAuditKeys(): void {
  if (priorAuditHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY; else process.env.AUDIT_HMAC_KEY = priorAuditHmacKey;
  if (priorAuditHmacSecret === undefined) delete process.env.AUDIT_HMAC_SECRET; else process.env.AUDIT_HMAC_SECRET = priorAuditHmacSecret;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('An independently provisioned runtime role is required.');
  process.env.AUDIT_HMAC_KEY ??= 'synthetic-read-receipt-retention-audit-hmac-key-no-production-use';
  process.env.AUDIT_HMAC_SECRET ??= 'synthetic-read-receipt-retention-tamper-proof-key-no-production-use';
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  const users = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active'),($4,$5,$3,'active') RETURNING id`,
    [`${TAG}-actor@example.invalid`, `${TAG} invented operator`, await bcrypt.hash(PASSWORD, 4), `${TAG}-signer@example.invalid`, `${TAG} invented independent signer`])).rows;
  actor = Number(users[0].id); signer = Number(users[1].id);
  const { getPool } = await import('../../server/db/runtime'); runtime = getPool();
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json()); app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
}, 120_000);
afterAll(async () => { restoreAuditKeys(); await runtime?.end(); await owner?.end(); });

describe('observational receipts cannot bypass regulated tenant retention', () => {
  it('uses the constrained runtime role, configured transport, and append-only ceilings', async () => {
    const identity = await runWithSystemTenantScope(TAG, () => runtime.query(`SELECT current_user AS role,rolsuper AS super,rolbypassrls AS bypass,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
      current_setting('app.rls_enforce',true) AS enforcement,
      has_table_privilege(current_user,'public.ana_source_read_receipts','DELETE') AS can_delete,
      pg_has_role(current_user,'ana_record_purger','MEMBER') AS is_purger
      FROM pg_roles WHERE rolname=current_user`));
    expect(identity.rows[0]).toEqual({ role: 'app_service', super: false, bypass: false,
      tls: shouldUseSsl(process.env.APP_DATABASE_URL), enforcement: 'on', can_delete: false, is_purger: false });
  });

  it('erases only exported observational metadata through its door with one retained same-transaction audit', async () => {
    const tenant = await freshTenant('metadata'); const foreign = await freshTenant('foreign');
    await exportedReceipt(tenant); await exportedReceipt(foreign);
    const sql: string[] = []; const result = await purge(tenant, sql);
    expect(result).toMatchObject({ status: 'purged', sourceReadReceiptErasure: { receipts: 1 }, deletedRows: { ana_source_read_receipts: 1 } });
    expect(await state(tenant)).toMatchObject({ status: 'purged', receipts: 0, purge_audits: 1 });
    expect(await state(foreign)).toMatchObject({ status: 'pending_deletion', receipts: 1, purge_audits: 0 });
    const rows = (await owner.query(`SELECT a.sha256_chain,a.hmac_seal,a.new_values,a.xmin::text=o.xmin::text AS same_transaction
      FROM audit_logs a JOIN organizations o ON o.id=a.tenant_id WHERE a.tenant_id=$1 AND a.action='tenant_purged'`, [tenant.id])).rows;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ same_transaction: true });
    expect(rows[0].sha256_chain).toMatch(/^[a-f0-9]{64}$/); expect(rows[0].hmac_seal).toBeTruthy();
    expect(rows[0].new_values.deletedRows.ana_source_read_receipts).toBe(1);
    const sourceLock = sql.findIndex(value => value.includes('LOCK TABLE vault.document_catalog'));
    expect(sourceLock).toBeGreaterThan(-1);
    expect(sourceLock).toBeLessThan(sql.findIndex(value => /FROM organizations.*FOR UPDATE/s.test(value)));
  });

  it('preserves a genuine signed QMS version, signature, receipts and audit history before any erase call', async () => {
    const tenant = await freshTenant('signed-qms', true); await signedProcedure(tenant); await exportedReceipt(tenant);
    const retained = (await owner.query('SELECT controlled_document,sections,signature_id FROM qms_document_versions WHERE organization_id=$1', [tenant.id])).rows;
    const auditBefore = (await owner.query('SELECT id FROM audit_logs WHERE tenant_id=$1 ORDER BY chain_seq', [tenant.id])).rows;
    const signatures = (await owner.query('SELECT id,signature_hash FROM electronic_signatures WHERE organization_id=$1', [tenant.id])).rows;
    const sql: string[] = [];
    await expect(purge(tenant, sql)).rejects.toMatchObject({ code: 'REGULATED_CONTENT_RETENTION_REVIEW_REQUIRED' });
    refusedBeforeErasure(sql); expect(await state(tenant)).toMatchObject({ status: 'pending_deletion', receipts: 1, purge_audits: 0 });
    expect((await owner.query('SELECT controlled_document,sections,signature_id FROM qms_document_versions WHERE organization_id=$1', [tenant.id])).rows).toEqual(retained);
    expect((await owner.query('SELECT id,signature_hash FROM electronic_signatures WHERE organization_id=$1', [tenant.id])).rows).toEqual(signatures);
    expect((await owner.query('SELECT id FROM audit_logs WHERE tenant_id=$1 ORDER BY chain_seq', [tenant.id])).rows).toEqual(auditBefore);
  });

  it('preserves frozen clinical/submission inputs before observational receipt erasure', async () => {
    const tenant = await freshTenant('frozen-input'); const run = randomUUID();
    await owner.query(`INSERT INTO submission_orchestrator_runs(run_id,organization_id,submission_id,application_number,region,submission_type,started_at,status)
      VALUES($1,$2,$3,'SYNTHETIC','US','IND',now(),'failed')`, [run, tenant.id, TAG]);
    const snapshot = { clinicalSummary: 'Invented private frozen study input.' };
    await owner.query('INSERT INTO submission_orchestrator_inputs(run_id,organization_id,input_snapshot,input_digest) VALUES($1,$2,$3::jsonb,$4)', [run, tenant.id, JSON.stringify(snapshot), digestOf(snapshot)]);
    await exportedReceipt(tenant); const sql: string[] = [];
    await expect(purge(tenant, sql)).rejects.toMatchObject({ code: 'REGULATED_CONTENT_RETENTION_REVIEW_REQUIRED' });
    refusedBeforeErasure(sql); expect(await state(tenant)).toMatchObject({ status: 'pending_deletion', receipts: 1, purge_audits: 0 });
    expect((await owner.query('SELECT input_snapshot FROM submission_orchestrator_inputs WHERE run_id=$1', [run])).rows[0].input_snapshot).toEqual(snapshot);
  });

  it('holds observational receipts under an actual active legal hold', async () => {
    const tenant = await freshTenant('legal-hold');
    await owner.query("INSERT INTO vault.legal_holds(organization_id,reference,reason,scope,program_id,placed_by) VALUES($1,$2,$3,'program',$4,$5)", [tenant.id, TAG, 'Invented active legal hold.', tenant.programId, actor]);
    await exportedReceipt(tenant); const sql: string[] = [];
    await expect(purge(tenant, sql)).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE' });
    refusedBeforeErasure(sql); expect(await state(tenant)).toMatchObject({ status: 'pending_deletion', receipts: 1, purge_audits: 0 });
  });

  it('rolls back actual receipt-door erasure when mandatory audit persistence fails', async () => {
    const tenant = await freshTenant('audit-rollback'); await exportedReceipt(tenant); const sql: string[] = [];
    await expect(purge(tenant, sql, true)).rejects.toThrow();
    expect(sql.some(value => /FROM public.purge_tenant_source_read_receipts/.test(value))).toBe(true);
    expect(sql).toContain('ROLLBACK'); expect(sql).not.toContain('COMMIT');
    expect(await state(tenant)).toMatchObject({ status: 'pending_deletion', receipts: 1, purge_audits: 0 });
  });
});
