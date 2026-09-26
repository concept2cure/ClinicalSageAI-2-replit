/**
 * catalog_project_document is a write, and a viewer may not make it.
 *
 * The tool wrote vault.document_catalog — the comprehension record AnA keeps for
 * a document — with no role check, and the table's RLS scopes by program, not
 * by role. So a viewer could replace an editor's record. That record is not
 * private to the viewer: its purpose line is shown in every member's session
 * recall and its summary is returned by every read, so a viewer's text would
 * reach every colleague's AnA. Run as the runtime role with RLS enforced.
 *
 * The fixture is built in rows, not through ingest and a read: a document with
 * its text, its catalog record in the 'extracted' state, and one read receipt
 * covering every character — so coverage and key_data both pass, and the role
 * is the only thing left to refuse.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';

const PREFIX = 'dbtest-catalog-role ';
const CODE = 'DBTEST-CATALOG-ROLE-DOC';
const TEXT = 'Certificate of Analysis. Batch number: 23-104. Assay (HPLC): 99.2 % of label claim.';
const HASH = 'e'.repeat(64);

let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let documentId: string;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX}tenant`, 'dbtest-catalog-role-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-catalog-role@example.test', `${PREFIX}actor`],
  );
  userId = Number(user.rows[0].id);
  await owner.query('DELETE FROM vault.documents WHERE document_code = $1', [CODE]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PREFIX}%`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 'DBTEST-CATROLE', $2, '510k', 'device', 'FDA', 'Role AF-1') RETURNING id`,
    [`${PREFIX}program`, orgId],
  );
  const doc = await owner.query(
    `INSERT INTO vault.documents
       (program_id, organization_id, document_code, document_title, document_type,
        version, s3_bucket, s3_key, file_name, file_size, mime_type, content_hash,
        classification, placement_status, processing_status, extracted_text)
     VALUES ($1, $2, $3, 'Certificate of Analysis', 'OTHER', '1.0', 'local', 'probe/key',
             'coa.txt', $4, 'text/plain', $5, 'INTERNAL', 'unfiled', 'INDEXED', $6)
     RETURNING id`,
    [prog.rows[0].id, orgId, CODE, TEXT.length, HASH, TEXT],
  );
  documentId = String(doc.rows[0].id);
  await owner.query(
    `INSERT INTO vault.document_catalog (document_id, content_hash, catalog_status, char_count)
     VALUES ($1, $2, 'extracted', $3)`,
    [documentId, HASH, TEXT.length],
  );
  await owner.query(
    `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end, read_by)
     VALUES ($1, $2, 0, $3, $4)`,
    [documentId, HASH, TEXT.length, userId],
  );
});

afterAll(async () => {
  await owner.query('DELETE FROM vault.documents WHERE document_code = $1', [CODE]).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PREFIX}%`]).catch(() => {});
  await owner.end().catch(() => {});
});

async function catalogAs(role: string) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const handler = getToolHandler('catalog_project_document');
  if (!handler) throw new Error('catalog_project_document is not registered');
  const raw = await runWithTenantScope(
    { tenantId: String(orgId), orgUuid, role, source: 'request', caller: 'document-catalog-role.dbtest' },
    () =>
      handler(
        {
          document_id: documentId,
          document_kind: 'Certificate of Analysis',
          purpose: 'Release evidence for one clinical batch.',
          summary: 'CoA for batch 23-104: assay 99.2 % of label claim.',
          key_data: { batch: '23-104', assay_pct: 99.2 },
        },
        { organizationId: orgId, userId },
      ),
  );
  return JSON.parse(raw);
}

const catalogRow = async () =>
  (
    await owner.query(
      `SELECT catalog_status, document_kind, purpose, summary, key_data, cataloged_by
         FROM vault.document_catalog WHERE document_id = $1`,
      [documentId],
    )
  ).rows[0];

describe('catalog_project_document — the comprehension record is a write', () => {
  it('refuses a viewer, and the record is untouched', async () => {
    const before = await catalogRow();
    const out = await catalogAs('viewer');
    // The stored record first, so a regression shows what it WROTE.
    expect(await catalogRow()).toEqual(before);
    expect(out.ok, JSON.stringify(out)).toBe(false);
    expect(out.reason).toMatch(/viewer/);
  });

  it('accepts a member — the positive control: nothing else stood in the way', async () => {
    const out = await catalogAs('member');
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect((await catalogRow()).catalog_status).toBe('cataloged');
  });
});
