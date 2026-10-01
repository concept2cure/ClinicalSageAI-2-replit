/**
 * Document relationships: the replacement for parentDocumentId (plan critique
 * 15, row D2).
 *
 * VR-05 refused `parentDocumentId` on upload, because it took any UUID
 * unchecked, and nothing replaced it: a Vault document could not name the
 * documents that support it, that it references or that it is based on. Here,
 * on PostgreSQL as the runtime role with RLS on, through the real ingest and
 * the real routes:
 *
 *   - a person relates one version to another of the organisation, in this
 *     project or another, and both ends list it, each in its own words;
 *   - a self relationship, two versions of one document, a duplicate, an
 *     unknown kind, another organisation's document, a viewer and another
 *     organisation's project are refused;
 *   - a related version that has since been superseded says so;
 *   - removing one requires a reason, keeps the row, and cannot be done twice;
 *   - each relate and unrelate is a chained row on both documents' histories;
 *   - the table refuses every other change, DELETE and TRUNCATE, for every
 *     role, and another organisation reads none of it;
 *   - the tenant purge takes an organisation's relationships with its documents.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vrel ';
const CODE = 'DBTEST-VREL';

type Tenant = { orgId: number; orgUuid: string; programId: string; otherProgramId: string };
type Outcome = { ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let gone: Tenant;
const ids = { protocol: '', csr: '', sap: '', sapV2: '', elsewhere: '', theirDoc: '', goneA: '', goneB: '' };

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

async function ingest(t: Tenant, text: string, fields: Record<string, string>, programId = t.programId): Promise<string> {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: 'record.txt', contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

const base = (t: Tenant) => `/api/c2c/project-vault/${t.programId}`;
const relate = async (t: Tenant, from: string, body: Record<string, unknown>, role = 'admin') =>
  request(await appFor(t, role)).post(`${base(t)}/documents/${from}/relationships`).send(body);
const list = async (t: Tenant, doc: string) => request(await appFor(t)).get(`${base(t)}/documents/${doc}/relationships`);
const remove = async (t: Tenant, relId: string, body: Record<string, unknown>) =>
  request(await appFor(t)).post(`${base(t)}/relationships/${relId}/remove`).send(body);
const historyEvents = async (t: Tenant, doc: string): Promise<string[]> => {
  const h = await request(await appFor(t)).get(`${base(t)}/documents/${doc}/history`);
  expect(h.status).toBe(200);
  return h.body.data.entries.map((e: { event: string }) => e.event);
};

async function asRuntime(sql: string, params: unknown[], scope: Tenant | 'system'): Promise<Outcome> {
  const { runWithTenantScope, runWithSystemTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const body = async (): Promise<Outcome> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(sql, params);
      await client.query('COMMIT');
      return { ok: true, rows: r.rows };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      client.release();
    }
  };
  const caller = 'tests/db/vault-document-relationships.dbtest.ts';
  if (scope === 'system') return runWithSystemTenantScope(caller, body);
  return runWithTenantScope({ tenantId: String(scope.orgId), orgUuid: scope.orgUuid, role: 'admin', source: 'request', caller }, body);
}

const refused = (r: Outcome) => {
  expect(r.ok, 'the change was applied').toBe(false);
  if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
};

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active' RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vrel-${slug}`],
  );
  const program = async (suffix: string, name: string) => (await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Relata 5mg') RETURNING id`,
    [`${PROBE}${slug} ${name}`, `${CODE}-${slug.toUpperCase()}${suffix}`, org.rows[0].id],
  )).rows[0].id;
  return {
    orgId: Number(org.rows[0].id),
    orgUuid: String(org.rows[0].uuid),
    programId: String(await program('', 'program')),
    otherProgramId: String(await program('-B', 'second program')),
  };
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id IN (SELECT id FROM organizations WHERE slug LIKE 'dbtest-vrel-%')`);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  // As the table's owner, the one role its delete guard admits.
  await owner.query(`DELETE FROM public.vault_document_relationships WHERE organization_id IN
                       (SELECT id FROM organizations WHERE slug LIKE 'dbtest-vrel-%')`).catch(() => {});
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
  await owner.query(`UPDATE organizations SET status = 'active' WHERE slug LIKE 'dbtest-vrel-%'`).catch(() => {});
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-vrel@example.test', 'Rhea Relate', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  gone = await tenant('gone');
  ids.protocol = await ingest(mine, 'Protocol BX-301.', { documentCode: `${CODE}-PROT`, documentTitle: 'Protocol' });
  ids.csr = await ingest(mine, 'Clinical study report.', { documentCode: `${CODE}-CSR`, documentTitle: 'Clinical study report' });
  ids.sap = await ingest(mine, 'Statistical analysis plan, v1.', { documentCode: `${CODE}-SAP`, documentTitle: 'Statistical analysis plan' });
  ids.sapV2 = await ingest(mine, 'Statistical analysis plan, v2.', { supersedesDocumentId: ids.sap, documentTitle: 'Statistical analysis plan' });
  ids.elsewhere = await ingest(mine, 'Investigator brochure.', { documentCode: `${CODE}-IB`, documentTitle: 'Investigator brochure' }, mine.otherProgramId);
  ids.theirDoc = await ingest(theirs, 'Their protocol.', { documentCode: `${CODE}-THEIRS`, documentTitle: 'Their protocol' });
  ids.goneA = await ingest(gone, 'A record to be purged.', { documentCode: `${CODE}-GA`, documentTitle: 'Purged A' });
  ids.goneB = await ingest(gone, 'Another record to be purged.', { documentCode: `${CODE}-GB`, documentTitle: 'Purged B' });
}, 120_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
  for (const t of [mine, theirs, gone]) {
    if (t) await fs.rm(path.resolve(process.cwd(), 'storage', 'vault', String(t.orgId)), { recursive: true, force: true }).catch(() => {});
  }
});

let csrSupportedByProtocol = '';

describe('relating documents (critique 15)', () => {
  it('relates two versions, and both ends list it in their own words', async () => {
    const res = await relate(mine, ids.csr, { toDocumentId: ids.protocol, type: 'supporting', note: 'The protocol the study ran under.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    csrSupportedByProtocol = res.body.data.id;

    const out = await list(mine, ids.csr);
    expect(out.status).toBe(200);
    expect(out.body.data.relationships).toEqual([expect.objectContaining({
      id: csrSupportedByProtocol, type: 'supporting', direction: 'outgoing', label: 'Supported by',
      note: 'The protocol the study ran under.', createdBy: 'Rhea Relate',
      other: expect.objectContaining({ documentId: ids.protocol, title: 'Protocol', version: '1.0', superseded: false }),
    })]);
    const back = await list(mine, ids.protocol);
    expect(back.body.data.relationships).toEqual([expect.objectContaining({
      id: csrSupportedByProtocol, direction: 'incoming', label: 'Supports',
      other: expect.objectContaining({ documentId: ids.csr, title: 'Clinical study report' }),
    })]);
  });

  it('relates to a version in another project of the organisation, and names that project', async () => {
    const res = await relate(mine, ids.csr, { toDocumentId: ids.elsewhere, type: 'references' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const out = await list(mine, ids.csr);
    expect(out.body.data.relationships).toContainEqual(expect.objectContaining({
      label: 'References',
      other: expect.objectContaining({ documentId: ids.elsewhere, programId: mine.otherProgramId, programName: `${PROBE}mine second program` }),
    }));
  });

  it('says when the related version has since been superseded', async () => {
    const res = await relate(mine, ids.csr, { toDocumentId: ids.sap, type: 'based_on' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const out = await list(mine, ids.csr);
    expect(out.body.data.relationships).toContainEqual(expect.objectContaining({
      label: 'Based on', other: expect.objectContaining({ documentId: ids.sap, superseded: true }),
    }));
  });

  it('refuses a self relationship, two versions of one document, a duplicate and an unknown kind', async () => {
    const self = await relate(mine, ids.csr, { toDocumentId: ids.csr, type: 'references' });
    expect([self.status, self.body.error]).toEqual([400, 'SELF_RELATIONSHIP']);
    const family = await relate(mine, ids.sapV2, { toDocumentId: ids.sap, type: 'based_on' });
    expect([family.status, family.body.error]).toEqual([409, 'SAME_DOCUMENT']);
    const dup = await relate(mine, ids.csr, { toDocumentId: ids.protocol, type: 'supporting' });
    expect([dup.status, dup.body.error]).toEqual([409, 'ALREADY_RELATED']);
    const kind = await relate(mine, ids.csr, { toDocumentId: ids.protocol, type: 'parent' });
    expect([kind.status, kind.body.error]).toEqual([400, 'INVALID_TYPE']);
  });

  it("refuses another organisation's document, a viewer, and another organisation's project", async () => {
    const foreignTarget = await relate(mine, ids.csr, { toDocumentId: ids.theirDoc, type: 'references' });
    expect([foreignTarget.status, foreignTarget.body.error]).toEqual([404, 'TARGET_NOT_FOUND']);
    const viewer = await relate(mine, ids.csr, { toDocumentId: ids.sapV2, type: 'references' }, 'viewer');
    expect(viewer.status).toBe(403);
    const foreignProject = await request(await appFor(theirs))
      .post(`${base(mine)}/documents/${ids.csr}/relationships`).send({ toDocumentId: ids.theirDoc, type: 'references' });
    expect(foreignProject.status).toBe(404);
    const foreignRead = await request(await appFor(theirs)).get(`${base(mine)}/documents/${ids.csr}/relationships`);
    expect(foreignRead.status).toBe(404);
  });

});

describe('removing a relationship, and the record it leaves (critique 15)', () => {
  it('removing one requires a reason, keeps the row, and cannot be done twice', async () => {
    const noReason = await remove(mine, csrSupportedByProtocol, {});
    expect([noReason.status, noReason.body.error]).toEqual([422, 'REASON_REQUIRED']);
    const done = await remove(mine, csrSupportedByProtocol, { reason: 'Related to the wrong protocol amendment.' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const again = await remove(mine, csrSupportedByProtocol, { reason: 'Related to the wrong protocol amendment.' });
    expect([again.status, again.body.error]).toEqual([409, 'ALREADY_REMOVED']);

    const out = await list(mine, ids.csr);
    expect(out.body.data.relationships.map((r: { id: string }) => r.id)).not.toContain(csrSupportedByProtocol);
    const { rows } = await owner.query(
      'SELECT removed_at, removed_by, removal_reason FROM public.vault_document_relationships WHERE id = $1', [csrSupportedByProtocol]);
    expect(rows[0]).toEqual(expect.objectContaining({ removed_by: userId, removal_reason: 'Related to the wrong protocol amendment.' }));
    expect(rows[0].removed_at).toBeTruthy();
  });

  it("each relate and unrelate is a chained row on both documents' histories", async () => {
    expect(await historyEvents(mine, ids.csr)).toEqual(expect.arrayContaining([
      'Related: supported by Protocol v1.0',
      'Relationship removed: supported by Protocol v1.0',
    ]));
    expect(await historyEvents(mine, ids.protocol)).toEqual(expect.arrayContaining([
      'Related: supports Clinical study report v1.0',
      'Relationship removed: supports Clinical study report v1.0',
    ]));
    const { rows } = await owner.query(
      `SELECT record_id, user_id, sha256_chain, chain_seq FROM audit_logs
        WHERE tenant_id = $1 AND action IN ('vault.document.relate', 'vault.document.unrelate')
          AND new_values ->> 'relationshipId' = $2`,
      [mine.orgId, csrSupportedByProtocol],
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.user_id === userId && r.sha256_chain && r.chain_seq != null)).toBe(true);
  });

  it('the table refuses every other change, for every role, and another organisation reads none of it', async () => {
    const live = (await owner.query(
      `SELECT id FROM public.vault_document_relationships WHERE organization_id = $1 AND removed_at IS NULL LIMIT 1`, [mine.orgId])).rows[0].id;
    refused(await asRuntime(`UPDATE public.vault_document_relationships SET relationship_type = 'supporting' WHERE id = $1`, [live], mine));
    refused(await asRuntime(`UPDATE public.vault_document_relationships SET removal_reason = 'rewritten reason' WHERE id = $1`, [csrSupportedByProtocol], mine));
    refused(await asRuntime('DELETE FROM public.vault_document_relationships WHERE id = $1', [live], mine));
    await expect(owner.query(`UPDATE public.vault_document_relationships SET note = 'owner rewrite' WHERE id = $1`, [live]))
      .rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(owner.query('TRUNCATE public.vault_document_relationships')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);

    expect(await asRuntime('SELECT id FROM public.vault_document_relationships WHERE id = $1', [live], theirs)).toEqual({ ok: true, rows: [] });
    expect(await asRuntime('SELECT id FROM public.vault_document_relationships WHERE id = $1', [live], mine)).toEqual({ ok: true, rows: [{ id: live }] });
  });

  it("the tenant purge takes an organisation's relationships with its documents, and no one else's", async () => {
    const res = await relate(gone, ids.goneA, { toDocumentId: ids.goneB, type: 'references' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const count = async (orgId: number) => Number((await owner.query(
      'SELECT count(*)::int AS n FROM public.vault_document_relationships WHERE organization_id = $1', [orgId])).rows[0].n);
    const bystanders = await count(mine.orgId);
    expect(bystanders).toBeGreaterThan(0);

    await owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [gone.orgId]).catch(() => {});
    await owner.query(`UPDATE organizations SET status = 'pending_deletion' WHERE id = $1`, [gone.orgId]);
    try {
      const r = await asRuntime('SELECT count(*)::int AS n FROM public.purge_tenant_vault_records($1)', [gone.orgId], 'system');
      expect(r.ok, r.ok ? '' : r.message).toBe(true);
    } finally {
      await owner.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [gone.orgId]);
    }
    expect(await count(gone.orgId)).toBe(0);
    expect(await count(mine.orgId)).toBe(bystanders);
  });
});
