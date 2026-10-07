/** Actual saved-source getter/verifier SQL over canonical catalog/disposition
 * migrations. Legacy tenant conflicts are deliberate TEST-ONLY seeds.
 * This does not qualify runtime-role RLS or independent connection scheduling. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, PROGRAM, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';

vi.mock('../../../db.js', () => ({ pool: { query: vi.fn() } }));
import { loadDocumentForOrg } from '../document-catalog.service';
import { verifyDraftSourceReferences } from '../../authoring/draft-source-references';

let db: JourneyDb;
beforeAll(async () => {
  db = await createJourneyDb({
    prereqSql: PREREQ + VAULT_DDL,
    migrations: ['migrations/20260905_document_catalog.sql', 'migrations/20261006_document_data_dispositions.sql'],
  });
});
afterAll(async () => { try { assertNoSchemaGaps(db); } finally { await db?.close(); } });

async function source(organizationId: number | null): Promise<{ id: string; hash: string }> {
  const id = randomUUID();
  const hash = createHash('sha256').update(id).digest('hex');
  await db.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,file_name,content_hash,extracted_text,processing_status)
    VALUES ($1,$2,$3,$5,'Recorded study evidence','csr','study.pdf',$4,'Evidence','INDEXED')`,
  [id, PROGRAM, organizationId, hash, `TLF-${id}`]);
  await db.pool.query(`INSERT INTO vault.document_catalog (document_id,content_hash,catalog_status,char_count)
    VALUES ($1,$2,'extracted',8)`, [id, hash]);
  return { id, hash };
}
const references = (documentId: string, hash: string) => [{ documentId, contentHash: hash, span: { start: 0, end: 8, totalChars: 8 } }];

describe('new current-only saved-source admission requires a consistent recorded tenant', () => {
  it.each([
    { label: 'foreign', organizationId: ORG + 1 },
    { label: 'unassigned', organizationId: null },
  ])('refuses a legacy $label recorded tenant despite a matching program and valid catalog', async ({ organizationId }) => {
    const { id, hash } = await source(organizationId);
    const read = await loadDocumentForOrg(id, ORG, { executor: db.pool, programId: PROGRAM, currentOnly: true, includeText: true });
    expect.soft(read).toBeNull();
    await expect.soft(verifyDraftSourceReferences(references(id, hash), db.pool, ORG, PROGRAM)).rejects.toThrow(/could not be verified/);
    expect((await db.pool.query('SELECT organization_id,program_id,content_hash FROM vault.documents WHERE id=$1', [id])).rows)
      .toEqual([{ organization_id: organizationId, program_id: PROGRAM, content_hash: hash }]);
  });

  it('retains exact source verification when the document and program agree on the tenant', async () => {
    const { id, hash } = await source(ORG);
    expect(await loadDocumentForOrg(id, ORG, { executor: db.pool, programId: PROGRAM, currentOnly: true, includeText: true }))
      .toMatchObject({ id, programId: PROGRAM, contentHash: hash, catalog: { status: 'extracted', contentHash: hash } });
    expect(await verifyDraftSourceReferences(references(id, hash), db.pool, ORG, PROGRAM))
      .toEqual([expect.objectContaining({ documentId: id, programId: PROGRAM, contentHash: hash })]);
  });
});
