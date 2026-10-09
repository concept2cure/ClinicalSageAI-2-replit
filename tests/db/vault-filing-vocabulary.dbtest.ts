/**
 * A filing decision is held to the vocabulary on save (VR-04, row D4).
 *
 * Both writers of a filing, the governed ingest (POST /api/vault/ingest,
 * AnA's filing tool) and the placement service (POST /:id/file, AnA's
 * place_project_document), stored whatever evidence kind and CTD section they
 * were given. 'banana' became a CTD section, 'nonsense' an evidence kind, and
 * the chained audit trail recorded each as a person's decision. Each writer now
 * refuses, naming the vocabulary, before anything is written: no row, no audit
 * row, and for the ingest no stored bytes.
 *
 * Runs as app_service in the tenant's request scope, with RLS enforcing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-vocab ';
const CODE = 'DBTEST-VOCAB';
const PDF = (tag: string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n% ${tag}\n%%EOF\n`, 'utf8');

let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let programId: string;
let documentId: string;

async function inScope<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'tests/db/vault-filing-vocabulary.dbtest.ts' },
    fn,
  );
}

const place = async (args: Record<string, unknown>) => {
  const { placeVaultDocument } = await import('../../server/services/vault/vault-placement.service');
  return inScope(() =>
    placeVaultDocument({ programId, documentId, organizationId: orgId, userId, ...args } as Parameters<typeof placeVaultDocument>[0]),
  );
};

const ingest = async (code: string, extra: Record<string, string>) => {
  const { ingestVaultDocument } = await import('../../server/services/vault/vault-ingest.service');
  return inScope(() =>
    ingestVaultDocument({
      organizationId: orgId,
      userId,
      programId,
      documentCode: code,
      documentTitle: 'Stability summary',
      documentType: 'MODULE_3',
      fileBuffer: PDF(code),
      fileName: 'stability-summary.pdf',
      mimeType: 'application/pdf',
      ...extra,
    }),
  );
};

const docRow = async () =>
  (await owner.query('SELECT folder_id, ctd_section, evidence_kind, placement_status FROM vault.documents WHERE id = $1', [documentId]))
    .rows[0];
const filingAudits = async () =>
  (await owner.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'vault.document.file' AND record_id = $1`, [documentId]))
    .rows[0].n;
async function storedVersionIds(): Promise<Set<string>> {
  const { getStorageProvider } = await import('../../server/services/storage/index');
  return new Set((await getStorageProvider().list(orgId, programId)).map((o) => o.vaultVersionId));
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE action LIKE 'vault.document.%' AND tenant_id = $1`, [orgId]);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, 'dbtest-vocab-tenant')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}tenant`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-vocab@example.test', $1, 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}actor`],
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'DBTEST-VOCAB', $2, 'IND', 'drug', 'FDA', 'Vocabin 5mg') RETURNING id`,
    [`${PROBE}program`, orgId],
  );
  programId = String(prog.rows[0].id);
  const doc = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
       content_hash, s3_bucket, s3_key, file_name, placement_status)
     VALUES ($1, $2, $3, 'Stability summary', 'MODULE_3', '1.0', repeat('c', 64), 'local', 'k', 'stability.pdf', 'unfiled')
     RETURNING id`,
    [programId, orgId, `${CODE}-DOC`],
  );
  documentId = String(doc.rows[0].id);
});

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('the placement service holds a filing to the vocabulary (POST /:id/file, AnA)', () => {
  it.each([
    ['a word that is not a section', { folderId: 'module-3', ctdSection: 'banana' }, 'INVALID_CTD_SECTION'],
    ['a bare module, which is a container', { folderId: 'module-3', ctdSection: '3' }, 'INVALID_CTD_SECTION'],
    ['an evidence kind outside the list', { folderId: 'module-3', evidenceKind: 'nonsense' }, 'INVALID_EVIDENCE_KIND'],
  ])('refuses %s with 422, and writes nothing', async (_what, args, code) => {
    const before = await docRow();
    const out = await place(args);
    expect(out).toMatchObject({ ok: false, status: 422, code });
    expect(await docRow()).toEqual(before);
    expect(await filingAudits()).toBe(0);
  });

  it('files a decision inside the vocabulary, as before', async () => {
    const out = await place({ folderId: 'module-3', ctdSection: '3.2.P.8', evidenceKind: 'cmc' });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(await docRow()).toMatchObject({ folder_id: 'module-3', ctd_section: '3.2.P.8', evidence_kind: 'cmc' });
  });
});

describe('the governed ingest holds a filing to the vocabulary (POST /api/vault/ingest)', () => {
  it.each([
    ['a CTD section that is not one', { folderId: 'module-3', ctdSection: 'banana' }, 'INVALID_CTD_SECTION'],
    ['an evidence kind outside the list', { folderId: 'module-3', evidenceKind: 'nonsense' }, 'INVALID_EVIDENCE_KIND'],
  ])('refuses %s with 400, before any byte is stored', async (_what, extra, code) => {
    const before = await storedVersionIds();
    const out = await ingest(`${CODE}-${code}`, extra);
    expect(out).toMatchObject({ ok: false, status: 400, code });
    expect((await owner.query('SELECT 1 FROM vault.documents WHERE document_code = $1', [`${CODE}-${code}`])).rowCount).toBe(0);
    expect([...(await storedVersionIds())].filter((id) => !before.has(id))).toEqual([]);
  });
});
