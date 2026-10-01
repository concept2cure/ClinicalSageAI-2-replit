/**
 * Where a Vault version is placed (VR-14a, plan critique 15, rows D2 and D7).
 *
 * A submission leaf names a Vault version by `submission_leaves.document_uuid`.
 * Nothing read it back for the Vault, so a person revising a document could not
 * see which sequences already carry which version. Here, on PostgreSQL as the
 * runtime role with RLS on, with the leaves written by the real writer
 * (`upsertLeaf`) and read through the real versions route:
 *
 *   - each version lists the live leaves that name it, with the submission,
 *     sequence, section and lifecycle operation;
 *   - a removed leaf, and a leaf in a removed sequence, are not placements;
 *   - another organisation's leaf naming this version is not listed, by the
 *     read's own filter as well as by row security, and another organisation
 *     reads none of it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vwhere ';
const CODE = 'DBTEST-VWHERE';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
const ids = { v1: '', v2: '', other: '' };
const seq = { first: 0, second: 0, removed: 0, theirs: 0 };
let submissionId = 0;

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: t.orgId, userRole: role,
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, text: string, fields: Record<string, string>): Promise<string> {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: 'record.txt', contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

/** Place a version as a leaf, through the one leaf writer, in the organisation's scope. */
async function place(t: Tenant, sequenceId: number, documentUuid: string, sectionCode: string, lifecycleOp = 'new'): Promise<number> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { upsertLeaf } = await import('../../server/services/submission-service/submission-service');
  const leaf = await runWithTenantScope(
    { tenantId: String(t.orgId), orgUuid: t.orgUuid, role: 'admin', source: 'request', caller: 'tests/db/vault-where-used.dbtest.ts' },
    () => upsertLeaf(
      { sequenceId, sectionCode, title: `Leaf ${sectionCode}`, lifecycleOp, documentTable: 'vault_documents', documentUuid },
      { organizationId: t.orgId, userId },
    ),
  );
  return Number(leaf.id);
}

const versions = async (t: Tenant, doc: string, as: Tenant = t) =>
  request(await appFor(as)).get(`/api/c2c/project-vault/${t.programId}/documents/${doc}/versions`);

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active' RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vwhere-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Placea 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
}

async function sequence(t: Tenant, subId: number, number: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by)
     VALUES ($1, 'fda', $2, $3, $4) RETURNING id`,
    [subId, number, t.orgId, userId],
  );
  return Number(rows[0].id);
}

async function submission(t: Tenant, title: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, 'ind', 'pharma', 'fda', $2, $3, $4) RETURNING id`,
    [`${PROBE}${title}`, t.orgId, userId, t.programId],
  );
  return Number(rows[0].id);
}

async function cleanup(): Promise<void> {
  const orgs = `(SELECT id FROM organizations WHERE slug LIKE 'dbtest-vwhere-%')`;
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id IN ${orgs}`);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query(`DELETE FROM submission_leaves WHERE organization_id IN ${orgs}`);
  await owner.query(`DELETE FROM ectd_sequences WHERE organization_id IN ${orgs}`);
  await owner.query(`DELETE FROM submissions WHERE organization_id IN ${orgs}`);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-vwhere@example.test', 'Wren Where', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  ids.v1 = await ingest(mine, 'Stability summary, version 1.', { documentCode: `${CODE}-STAB`, documentTitle: 'Stability summary' });
  ids.v2 = await ingest(mine, 'Stability summary, version 2.', { supersedesDocumentId: ids.v1, documentTitle: 'Stability summary' });
  ids.other = await ingest(mine, 'Clinical overview.', { documentCode: `${CODE}-CO`, documentTitle: 'Clinical overview' });

  submissionId = await submission(mine, 'IND 123456');
  seq.first = await sequence(mine, submissionId, '0000');
  seq.second = await sequence(mine, submissionId, '0001');
  seq.removed = await sequence(mine, submissionId, '0002');
  await place(mine, seq.first, ids.v1, '3.2.P.8.1');
  await place(mine, seq.second, ids.v2, '3.2.P.8.1', 'replace');
  // What is not a placement: a removed leaf, and a leaf in a removed sequence.
  const removedLeaf = await place(mine, seq.first, ids.other, '2.5');
  await owner.query('UPDATE submission_leaves SET deleted_at = now() WHERE id = $1', [removedLeaf]);
  await place(mine, seq.removed, ids.v2, '3.2.P.8.3');
  await owner.query('UPDATE ectd_sequences SET deleted_at = now() WHERE id = $1', [seq.removed]);
  // Another organisation's leaf naming this version: the writer refuses it, so a
  // legacy or forged row stands in for one.
  const theirSub = await submission(theirs, 'their IND');
  seq.theirs = await sequence(theirs, theirSub, '0000');
  await owner.query(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_uuid, organization_id, created_by)
     VALUES ($1, '3.2.P.8.1', 'Forged leaf', 'new', 'vault_documents', $2, $3, $4)`,
    [seq.theirs, ids.v1, theirs.orgId, userId],
  );
}, 120_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
  for (const t of [mine, theirs]) {
    if (t) await fs.rm(path.resolve(process.cwd(), 'storage', 'vault', String(t.orgId)), { recursive: true, force: true }).catch(() => {});
  }
});

describe('where a Vault version is placed (VR-14a)', () => {
  it('each version lists the live leaves that name it', async () => {
    const res = await versions(mine, ids.v2);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const byId = new Map(res.body.data.versions.map((v: { id: string }) => [v.id, v]));
    expect((byId.get(ids.v1) as any).placements).toEqual([expect.objectContaining({
      submissionId, submissionTitle: `${PROBE}IND 123456`, applicationType: 'ind',
      sequenceId: seq.first, sequenceNumber: '0000', region: 'fda', sequenceStatus: 'draft',
      sectionCode: '3.2.P.8.1', leafTitle: 'Leaf 3.2.P.8.1', operation: 'new',
    })]);
    expect((byId.get(ids.v2) as any).placements).toEqual([expect.objectContaining({
      sequenceId: seq.second, sequenceNumber: '0001', sectionCode: '3.2.P.8.1', operation: 'replace',
    })]);
  });

  it('a removed leaf is not a placement', async () => {
    const res = await versions(mine, ids.other);
    expect(res.status).toBe(200);
    expect(res.body.data.versions[0].placements).toEqual([]);
  });

  it("another organisation's leaf naming this version is not listed, and another organisation reads nothing", async () => {
    const res = await versions(mine, ids.v1);
    const v1 = res.body.data.versions.find((v: { id: string }) => v.id === ids.v1);
    expect(v1.placements.map((p: { sequenceId: number }) => p.sequenceId)).toEqual([seq.first]);
    expect((await versions(mine, ids.v1, theirs)).status).toBe(404);
  });

  it("the read's own organisation filter holds without row security", async () => {
    // As the table owner, whom row security does not bind: only the SQL's own
    // organisation filter keeps the other organisation's leaf out.
    const { readVaultPlacements } = await import('../../server/services/vault/vault-where-used');
    const found = await readVaultPlacements(owner, mine.orgId, [ids.v1]);
    expect(found.get(ids.v1)?.map((p) => p.sequenceId)).toEqual([seq.first]);
  });
});
