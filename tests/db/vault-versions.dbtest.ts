/**
 * Every version of a Vault document is visible, and a document is one entry
 * (VR-09, row D2).
 *
 * VR-08 lets a document take its next version. Until VR-09 the Vault read
 * model listed every row as its own document. v1 and v2 of one protocol showed
 * as two documents, were counted twice, and both came up in search. The detail
 * pane said no version history existed. Here, on PostgreSQL as the runtime role
 * with RLS on, through the real ingest and Vault routes:
 *
 *   - the tree has ONE leaf per document, the current version, carrying how
 *     many versions it has, and the document count counts documents;
 *   - GET …/documents/:documentId/versions lists the family newest first, from
 *     any member, with hash, size and uploader; a link the database rules would
 *     not admit is shown as unverified, never drawn as lineage;
 *   - search hides superseded versions unless asked, and its total counts the
 *     same set;
 *   - a document's history spans every version.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vr09 ';
const CODE = 'DBTEST-VR09';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let v1: string;
let v2: string;
let legacy: string;
let otherId: string;

const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function appFor(t: Tenant): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = t.orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, bytes: Buffer, fields: Record<string, string> = {}) {
  let r = request(await appFor(t))
    .post('/api/vault/ingest')
    .field('programId', t.programId)
    .field('documentCode', `${CODE}-DOC`)
    .field('documentTitle', 'Clinical overview')
    .field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach('file', bytes, 'overview.pdf');
}

const get = async (t: Tenant, path: string) => request(await appFor(t)).get(`/api/c2c/project-vault/${t.programId}${path}`);

/** Every upload leaf in the tree, however deep. */
function leaves(node: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(node)) node.forEach((n) => leaves(n, out));
  else if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if (n.src === 'upload') out.push(n);
    if (n.children) leaves(n.children, out);
  }
  return out;
}

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vr09-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Versin 5mg') RETURNING id`,
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
      `DELETE FROM audit_logs WHERE action LIKE 'vault.document.%'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${CODE}%`],
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
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-vr09@example.test', 'Vera Version', 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');

  const first = await ingest(mine, pdf('v1'));
  expect(first.status, JSON.stringify(first.body)).toBe(201);
  v1 = first.body.document.id;
  const next = await ingest(mine, pdf('v2'), { supersedesDocumentId: v1 });
  expect(next.status, JSON.stringify(next.body)).toBe(201);
  v2 = next.body.document.id;

  // A legacy row whose pointer the lineage rules would refuse: it names a
  // version of ANOTHER document. Written past the guard, as old data was.
  const other = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
       content_hash, s3_bucket, s3_key, file_name)
     VALUES ($1, $2, $3, 'Other', 'OTHER', '1.0', $4, 'local', 'k', 'o.pdf') RETURNING id`,
    [mine.programId, mine.orgId, `${CODE}-OTHER`, sha(pdf('other'))],
  );
  otherId = String(other.rows[0].id);
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE vault.documents DISABLE TRIGGER vault_documents_lineage_guard');
    legacy = (await client.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
         content_hash, s3_bucket, s3_key, file_name, supersedes_id)
       VALUES ($1, $2, $3, 'Legacy', 'OTHER', '2.0', $4, 'local', 'k', 'l.pdf', $5) RETURNING id`,
      [mine.programId, mine.orgId, `${CODE}-LEGACY`, sha(pdf('legacy')), other.rows[0].id],
    )).rows[0].id;
    await client.query('ALTER TABLE vault.documents ENABLE TRIGGER vault_documents_lineage_guard');
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('the Vault lists a document once, at its current version (VR-09)', () => {
  it('one leaf for the family, the current version, with its version count', async () => {
    const res = await get(mine, '');
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const family = leaves(res.body.data.tree).filter((l) => [v1, v2].includes(String(l.docId)));
    expect(family).toHaveLength(1);
    expect(family[0]).toMatchObject({ docId: v2, ver: 'v2.0', versionCount: 2 });
  });

  it('counts documents, not versions', async () => {
    const res = await get(mine, '');
    // The family, the other document and the legacy row: three documents, four rows.
    expect(res.body.data.documentCounts.uploads).toBe(3);
    expect(leaves(res.body.data.tree)).toHaveLength(3);
  });
});

describe('GET …/documents/:documentId/versions (VR-09)', () => {
  it('lists the family newest first from any member, with hash, size and uploader', async () => {
    for (const member of [v1, v2]) {
      const res = await get(mine, `/documents/${member}/versions`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const versions = res.body.data.versions;
      expect(versions.map((v: { id: string }) => v.id)).toEqual([v2, v1]);
      expect(versions[0]).toMatchObject({ version: '2.0', contentHash: sha(pdf('v2')), uploader: 'Vera Version', current: true, link: 'verified' });
      expect(versions[1]).toMatchObject({ version: '1.0', contentHash: sha(pdf('v1')), current: false, link: 'none' });
      expect(versions[1].fileSize).toBe(pdf('v1').length);
    }
  });

  it('shows a link the lineage rules refuse as unverified, never as lineage', async () => {
    const res = await get(mine, `/documents/${legacy}/versions`);
    expect(res.status).toBe(200);
    expect(res.body.data.versions).toHaveLength(1);
    expect(res.body.data.versions[0]).toMatchObject({ id: legacy, link: 'unverified', current: true });
  });

  it("404s another organization's document, from either side", async () => {
    expect((await get(theirs, `/documents/${v1}/versions`)).status).toBe(404);
    const their = await request(await appFor(theirs)).get(`/api/c2c/project-vault/${mine.programId}/documents/${v1}/versions`);
    expect(their.status).toBe(404);
  });
});

describe('search and history across versions (VR-09)', () => {
  it('search hides a superseded version unless asked, and counts the same set', async () => {
    const plain = await get(mine, '/search?q=overview');
    expect(plain.status).toBe(200);
    const ids = plain.body.data.results.map((r: { id: string }) => r.id);
    expect(ids).toContain(v2);
    expect(ids).not.toContain(v1);
    expect(plain.body.data.total).toBe(plain.body.data.results.length);

    const all = await get(mine, '/search?q=overview&includeSuperseded=true');
    const allIds = all.body.data.results.map((r: { id: string }) => r.id);
    expect(allIds).toEqual(expect.arrayContaining([v1, v2]));
    expect(all.body.data.total).toBe(all.body.data.results.length);
  });

  it("a document's history spans every version", async () => {
    const res = await get(mine, `/documents/${v2}/history`);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const records = new Set(res.body.data.entries.map((e: { recordId?: string; record_id?: string; target?: string }) =>
      String(e.recordId ?? e.record_id ?? e.target ?? '')));
    const joined = [...records].join(' ');
    expect(joined).toContain(v1);
    expect(joined).toContain(v2);
    // Each event names the version it was recorded against.
    const versionsSeen = new Set(res.body.data.entries.map((e: { version?: string | null }) => e.version));
    expect(versionsSeen).toEqual(new Set(['1.0', '2.0']));
  });

  it('downloads an earlier version, hash-verified (control)', async () => {
    const res = await request(await appFor(mine))
      .get(`/api/c2c/project-vault/${mine.programId}/documents/${v1}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(sha(res.body as Buffer)).toBe(sha(pdf('v1')));
  });
});

describe('a check-in agrees with the tree about the current version (VR-09)', () => {
  it('refuses a version a legacy row names, says why, and names nothing about that row', async () => {
    // The tree lists `other` as a current document: the legacy row's link to it is not lineage.
    const tree = await get(mine, '');
    expect(leaves(tree.body.data.tree).find((l) => l.docId === otherId)).toMatchObject({ versionCount: 1 });
    const res = await ingest(mine, pdf('other-v2'), { supersedesDocumentId: otherId });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('VERSION_LINK_CONFLICT');
    expect(res.body.error.message).not.toContain('2.0');
    expect(res.body.error.message).not.toContain(legacy);
  });
});

describe('the data room names the version its file became (VR-16)', () => {
  it("a captured file holding v1.0's bytes reads 'filed as 1.0, superseded by 2.0'", async () => {
    // Captured as the owner: the capture path is not under test here, the
    // data room's read of it is.
    const src = await owner.query(
      `INSERT INTO cre_evidence_sources (organization_id, source_type, title, checksum, client_program_id, metadata)
       VALUES ($1, 'client_document', 'dbtest-vr16 capture', $2, $3::uuid, '{}'::jsonb) RETURNING id`,
      [mine.orgId, sha(pdf('v1')), mine.programId],
    );
    try {
      const res = await get(mine, '');
      expect(res.status).toBe(200);
      const row = res.body.data.dataRoom.sources.find((x: { id: number }) => x.id === Number(src.rows[0].id));
      expect(row).toMatchObject({ stage: 'filed', filedAs: { version: '1.0', supersededBy: '2.0' } });
    } finally {
      await owner.query('DELETE FROM cre_evidence_sources WHERE id = $1', [src.rows[0].id]);
    }
  });
});

