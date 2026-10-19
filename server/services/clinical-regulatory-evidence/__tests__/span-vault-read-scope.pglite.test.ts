/** A retained citation cannot reveal a different tenant's Vault metadata. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pg: PGlite;
const q = { query: async <Row = unknown>(sql: string, params?: unknown[]) => {
  const result = await pg.query<Row>(sql, params);
  return { rows: result.rows, rowCount: result.rows.length };
} };
vi.mock('../../../db', () => ({ pool: { query: (sql: string, params?: unknown[]) => q.query(sql, params) } }));
import { getSelectionOrigins, listDocumentSpans } from '../span-lineage.service';

const ref = { documentTable: 'authoring_sections', documentId: 'scoped-vault-source' };
const own = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY);
    INSERT INTO organizations VALUES(7),(8);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents(id uuid PRIMARY KEY, organization_id integer,
      content_hash text,document_title text,deleted_at timestamptz);`);
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'db/migrations/20260803_document_span_lineage.sql',
    'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql']) await pg.exec(readFileSync(file, 'utf8'));
  await pg.query(`INSERT INTO vault.documents VALUES($1,7,'own-hash','Own retained source',NULL),
    ($2,8,'foreign-hash','PRIVATE FOREIGN TITLE',NULL)`, [own, foreign]);
  // Corrupt retained references deliberately bypass the admission writer so the
  // read's tenant predicate is tested independently of write checks and RLS.
  await pg.query(`INSERT INTO document_span_lineage(organization_id,document_table,document_id,
    char_start,char_end,span_text_sha256,provenance_kind,reference_id,payload_sha256,usage)
    VALUES(7,$1,$2,0,10,repeat('a',64),'vault_document',$3,'own-hash','paraphrased'),
      (7,$1,$2,10,20,repeat('b',64),'vault_document',$4,'foreign-hash','paraphrased')`,
  [ref.documentTable, ref.documentId, own, foreign]);
}, 90_000);
afterAll(async () => { await pg?.close(); });

describe('Vault citation read scope', () => {
  for (const read of ['document', 'selection'] as const) {
    it(`withholds a foreign source title and hash during the ${read} read`, async () => {
      const rows = read === 'document'
        ? await listDocumentSpans(7, ref, q)
        : (await getSelectionOrigins(7, ref, 0, 20)).origins;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ state: 'current', sourceTitle: 'Own retained source' });
      expect(rows[1]).toMatchObject({ state: 'unresolved', sourceTitle: null });
      expect(JSON.stringify(rows)).not.toContain('PRIVATE FOREIGN TITLE');
    });
  }
});
