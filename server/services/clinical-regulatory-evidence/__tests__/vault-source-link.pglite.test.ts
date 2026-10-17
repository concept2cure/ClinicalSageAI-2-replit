/** F03: execute the new read-only source link SQL against real spine/disposition DDL. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { RECORDED_LINEAGE_STORES_DDL } from '../../document-data-disposition/__tests__/lineage-stores-fixture';
vi.mock('../../../db', () => ({ pool: {} }));
import { resolveEvidenceSourceIdsByVaultDocuments } from '../retrieval-source-link';
let pg: PGlite;
const program = '11111111-1111-4111-8111-111111111111';
const otherProgram = '22222222-2222-4222-8222-222222222222';
const doc = '33333333-3333-4333-8333-333333333333';
const plainDoc = '44444444-4444-4444-8444-444444444444';
const hash = 'a'.repeat(64);
let sourceId: number;
const exec = { query: async <Row = Record<string, unknown>>(sql: string, args?: unknown[]) => pg.query<Row>(sql, args) };
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(RECORDED_LINEAGE_STORES_DDL);
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY);
    INSERT INTO organizations VALUES (7),(8);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY, organization_id integer);
    INSERT INTO regulatory_programs VALUES ('${program}',7),('${otherProgram}',7);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents(id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      document_code text, content_hash text, supersedes_id uuid, deleted_at timestamptz);
    INSERT INTO vault.documents VALUES ('${doc}','${program}',7,'assay','${hash}',NULL,NULL),
      ('${plainDoc}','${program}',7,'unlinked','${'b'.repeat(64)}',NULL,NULL);`);
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'migrations/20260726_cre_source_program_scope.sql', 'migrations/20260829_cre_source_versioning.sql',
    'migrations/20261006_document_data_dispositions.sql']) {
    await pg.exec(readFileSync(file, 'utf8'));
  }
  const result = await pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,checksum,title) VALUES
    (7,$1,'client_document',$2,'Assay source') RETURNING id`, [program, hash]);
  sourceId = result.rows[0].id;
  await pg.query(`INSERT INTO cre_evidence_sources(organization_id,client_program_id,source_type,checksum,title)
    VALUES (7,$1,'client_document',$3,'Other program'),(8,$2,'client_document',$3,'Other organization')`, [otherProgram,program,hash]);
}, 90000);
afterAll(async () => { await pg?.close(); });
describe('Vault source identity to canonical CRE link', () => {
  it('links only the same tenant, program and byte checksum; direct uploads stay unlinked', async () => {
    expect([...await resolveEvidenceSourceIdsByVaultDocuments(7, program, [doc, plainDoc], exec)]).toEqual([[doc,sourceId]]);
    expect((await resolveEvidenceSourceIdsByVaultDocuments(7, otherProgram, [doc], exec)).size).toBe(0);
    expect((await resolveEvidenceSourceIdsByVaultDocuments(8, program, [doc], exec)).size).toBe(0);
  });
  it('does not cite a retired capture or superseded Vault version', async () => {
    await pg.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1',[sourceId]);
    expect((await resolveEvidenceSourceIdsByVaultDocuments(7, program, [doc], exec)).size).toBe(0);
    await pg.query('UPDATE cre_evidence_sources SET is_current=true WHERE id=$1',[sourceId]);
    await pg.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,content_hash,supersedes_id)
      VALUES ('55555555-5555-4555-8555-555555555555',$1,7,'assay',$2,$3)`,[program,'c'.repeat(64),doc]);
    expect((await resolveEvidenceSourceIdsByVaultDocuments(7, program, [doc], exec)).size).toBe(0);
  });
});
