/**
 * Compare two versions of a Vault document (plan critique 15, row D2).
 *
 * A reviewer had to download two versions and compare them by eye. Here, on
 * PostgreSQL as the runtime role with RLS on, through the real ingest and
 * check-in and the real Vault route:
 *
 *   - v1.0 against v2.0 names each side and returns the changed lines, with
 *     unchanged runs collapsed to a count, and the details that changed;
 *   - the earlier version is always `from`, whichever is asked about;
 *   - a version of another document is refused NOT_SAME_DOCUMENT;
 *   - another organisation's document reads as not found;
 *   - a version with no extracted text gets no text comparison, and the
 *     answer says which version has none.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vcmp ';
const CODE = 'DBTEST-VCMP';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let v1: string;
let v2: string;
let other: string;

const BODY = Array.from({ length: 40 }, (_, i) => `Section ${i + 1}: the stability protocol line ${i + 1}.`);
const textV1 = BODY.join('\n');
const textV2 = BODY.map((l, i) => (i === 19 ? 'Section 20: storage at 25 °C / 60% RH for 36 months.' : l)).concat('Section 41: added in revision 2.').join('\n');

async function appFor(t: Tenant): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: t.orgId, userRole: 'admin',
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, text: string, name: string, fields: Record<string, string>) {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach('file', Buffer.from(text, 'utf8'), { filename: name, contentType: 'text/plain' });
}

const compare = async (t: Tenant, documentId: string, against: string) =>
  request(await appFor(t)).get(`/api/c2c/project-vault/${t.programId}/documents/${documentId}/compare?against=${against}`);

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vcmp-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Comparo 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE tenant_id IN (SELECT id FROM organizations WHERE slug LIKE 'dbtest-vcmp-%')`,
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-vcmp@example.test', 'Cory Comparer', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');

  const first = await ingest(mine, textV1, 'stability-protocol.txt', { documentCode: `${CODE}-DOC`, documentTitle: 'Stability protocol' });
  expect(first.status, JSON.stringify(first.body)).toBe(201);
  v1 = first.body.document.id;
  const next = await ingest(mine, textV2, 'stability-protocol.txt', { supersedesDocumentId: v1, documentTitle: 'Stability protocol, revised' });
  expect(next.status, JSON.stringify(next.body)).toBe(201);
  v2 = next.body.document.id;
  const unrelated = await ingest(mine, 'An unrelated memo.\n', 'memo.txt', { documentCode: `${CODE}-OTHER`, documentTitle: 'Memo' });
  expect(unrelated.status, JSON.stringify(unrelated.body)).toBe(201);
  other = unrelated.body.document.id;
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('compare two versions of a Vault document', () => {
  it('names both sides and returns the changed lines and details, unchanged runs collapsed', async () => {
    const res = await compare(mine, v2, v1);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const d = res.body.data;
    expect([d.from.version, d.to.version]).toEqual(['1.0', '2.0']);
    expect(d.to.current).toBe(true);
    expect(d.sameBytes).toBe(false);
    expect(d.details).toEqual([{ field: 'title', from: 'Stability protocol', to: 'Stability protocol, revised' }]);
    expect(d.text).toMatchObject({ available: true, identical: false, truncated: false, counts: { added: 2, removed: 1, unchanged: 39 } });
    const removed = d.text.hunks.filter((h: { kind: string }) => h.kind === 'removed').flatMap((h: { lines: string[] }) => h.lines);
    const added = d.text.hunks.filter((h: { kind: string }) => h.kind === 'added').flatMap((h: { lines: string[] }) => h.lines);
    expect(removed).toEqual(['Section 20: the stability protocol line 20.']);
    expect(added).toEqual(['Section 20: storage at 25 °C / 60% RH for 36 months.', 'Section 41: added in revision 2.']);
    expect(d.text.hunks.some((h: { kind: string; count?: number }) => h.kind === 'skipped' && (h.count ?? 0) > 0)).toBe(true);
  });

  it('the earlier version is always the one compared from', async () => {
    const res = await compare(mine, v1, v2);
    expect([res.body.data.from.version, res.body.data.to.version]).toEqual(['1.0', '2.0']);
  });

  it("refuses a version of another document, and another organisation's document reads as not found", async () => {
    const wrong = await compare(mine, v2, other);
    expect(wrong.status).toBe(422);
    expect(wrong.body.error).toBe('NOT_SAME_DOCUMENT');
    const foreign = await compare(theirs, v2, v1);
    expect(foreign.status).toBe(404);
  });

  it('a version with no extracted text gets no text comparison, and the answer says which', async () => {
    await owner.query(`UPDATE vault.documents SET extracted_text = NULL WHERE id = $1`, [v1]);
    try {
      const res = await compare(mine, v2, v1);
      expect(res.status).toBe(200);
      expect(res.body.data.text.available).toBe(false);
      expect(res.body.data.text.reason).toMatch(/No text was read from v1\.0/);
      expect(res.body.data.details).toHaveLength(1);
    } finally {
      await owner.query(`UPDATE vault.documents SET extracted_text = $2 WHERE id = $1`, [v1, textV1]);
    }
  });
});
