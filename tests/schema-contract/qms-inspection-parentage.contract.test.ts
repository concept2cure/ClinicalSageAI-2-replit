import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = 'migrations/20261013b_qms_inspection_same_org_keys.sql';
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const ownProgram = '11111111-1111-4111-8111-111111111111';
const foreignProgram = '22222222-2222-4222-8222-222222222222';

async function fixture(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations (id int PRIMARY KEY);
    CREATE TABLE users (id int PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL REFERENCES organizations(id));
    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (1);
    INSERT INTO regulatory_programs VALUES ('${ownProgram}', 1), ('${foreignProgram}', 2);`);
  await pg.exec(read('migrations/20260511_qms_and_labeling.sql'));
  await pg.exec(read('migrations/20260610_inspection_readiness.sql'));
  await pg.exec(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type)
    VALUES (1,'OWN','Own document','sop'), (2,'FOREIGN','Foreign document','sop');
    INSERT INTO labeling_documents (organization_id, program_id, device_name, doc_kind)
    VALUES (1,'${ownProgram}','Own device','ifu'), (2,'${foreignProgram}','Foreign device','ifu');
    INSERT INTO inspections (organization_id, inspection_type, agency, site_name, created_by)
    VALUES (1,'gmp','fda','Own site',1), (2,'gmp','fda','Foreign site',1);
    INSERT INTO inspection_findings (organization_id, inspection_id, observation_number, description, created_by)
    VALUES (1,1,1,'Own observation',1), (2,2,1,'Foreign observation',1);`);
  return pg;
}

let pg: PGlite;
beforeAll(async () => { pg = await fixture(); }, 60_000);
afterAll(async () => { await pg?.close(); });

const links = [
  { table: 'qms_documents', column: 'superseded_by_id', parent: 'qms_documents', insert: (ref: number | string) => `INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,superseded_by_id) VALUES (1,'SUPER-${ref}','Revision','sop',${ref}) RETURNING id` },
  { table: 'qms_training_records', column: 'document_id', parent: 'qms_documents', insert: (ref: number | string) => `INSERT INTO qms_training_records (organization_id,user_id,document_id,document_version) VALUES (1,1,${ref},'1.0') RETURNING id` },
  { table: 'qms_suppliers', column: 'quality_agreement_id', parent: 'qms_documents', insert: (ref: number | string) => `INSERT INTO qms_suppliers (organization_id,supplier_name,criticality,quality_agreement_id) VALUES (1,'Supplier','major',${ref}) RETURNING id` },
  { table: 'labeling_documents', column: 'program_id', parent: 'regulatory_programs', insert: (ref: number | string) => `INSERT INTO labeling_documents (organization_id,program_id,device_name,doc_kind) VALUES (1,'${ref}','Device','ifu') RETURNING id` },
  { table: 'labeling_translations', column: 'labeling_document_id', parent: 'labeling_documents', insert: (ref: number | string) => `INSERT INTO labeling_translations (organization_id,labeling_document_id,language) VALUES (1,${ref},'de') RETURNING id` },
  { table: 'labeling_symbols', column: 'labeling_document_id', parent: 'labeling_documents', insert: (ref: number | string) => `INSERT INTO labeling_symbols (organization_id,labeling_document_id,symbol_code,symbol_name) VALUES (1,${ref},'5.4.3','Caution') RETURNING id` },
  { table: 'inspection_findings', column: 'inspection_id', parent: 'inspections', insert: (ref: number | string) => `INSERT INTO inspection_findings (organization_id,inspection_id,observation_number,description,created_by) VALUES (1,${ref},2,'Observation',1) RETURNING id` },
  { table: 'finding_responses', column: 'finding_id', parent: 'inspection_findings', insert: (ref: number | string) => `INSERT INTO finding_responses (organization_id,finding_id,response_description,created_by) VALUES (1,${ref},'Response',1) RETURNING id` },
  { table: 'readiness_assessments', column: 'inspection_id', parent: 'inspections', insert: (ref: number | string) => `INSERT INTO readiness_assessments (organization_id,inspection_id,area,created_by) VALUES (1,${ref},'GMP',1) RETURNING id` },
];

describe('validated QMS and inspection tenant parentage', () => {
  it('reproduces the bare FK loophole before installing the composite guard', async () => {
    await pg.exec('BEGIN');
    await pg.exec(`INSERT INTO qms_training_records (organization_id,user_id,document_id,document_version) VALUES (1,1,2,'1.0')`);
    const foreign = await pg.query<{ parent_organization: number; child_organization: number }>(`SELECT d.organization_id AS parent_organization,t.organization_id AS child_organization
      FROM qms_training_records t JOIN qms_documents d ON d.id=t.document_id`);
    expect(foreign.rows[0]).toEqual({ parent_organization: 2, child_organization: 1 });
    console.info('[negative control] bare document FK admitted organization 1 training under organization 2 document');
    await pg.exec('ROLLBACK');
  });

  it('is reachable after its creators and before the final tenant sweep, and replays twice', async () => {
    const index = C2C_MIGRATION_FILES.indexOf(migration);
    expect(index).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf('migrations/20260511_qms_and_labeling.sql'));
    expect(index).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf('migrations/20260610_inspection_readiness.sql'));
    expect(index).toBeLessThan(C2C_MIGRATION_FILES.indexOf('db/migrations/20260801_tenant_isolation_sweep.sql'));
    await pg.exec(read(migration));
    await pg.exec(read(migration));
    const constraints = await pg.query<{ conname: string; convalidated: boolean }>(`SELECT conname,convalidated FROM pg_constraint WHERE conname LIKE '%qms%_same_org_fk' OR conname LIKE '%inspection%_same_org_fk' OR conname LIKE 'labeling_%_same_org_fk' OR conname='finding_responses_finding_same_org_fk' OR conname='readiness_assessments_inspection_same_org_fk'`);
    expect(constraints.rows).toHaveLength(9);
    expect(constraints.rows.every(row => row.convalidated)).toBe(true);
  }, 60_000);

  it.each(links)('[$table] $column accepts an owned parent and refuses foreign inserts and updates', async link => {
    const own = link.parent === 'regulatory_programs' ? ownProgram : 1;
    const other = link.parent === 'regulatory_programs' ? foreignProgram : 2;
    const inserted = await pg.query<{ id: number }>(link.insert(own));
    const id = inserted.rows[0].id;
    await expect(pg.query(link.insert(other))).rejects.toMatchObject({ code: '23503' });
    await expect(pg.query(`UPDATE ${link.table} SET ${link.column}=$1 WHERE id=$2`, [other, id])).rejects.toMatchObject({ code: '23503' });
    const kept = await pg.query<{ parent: number | string }>(`SELECT ${link.column} AS parent FROM ${link.table} WHERE id=$1`, [id]);
    expect(kept.rows[0].parent).toBe(own);
  }, 60_000);

  it('blocks deployment over historical foreign parentage without deleting or relabeling the records', async () => {
    const legacy = await fixture();
    try {
      await legacy.exec(`INSERT INTO finding_responses (organization_id,finding_id,response_description,created_by) VALUES (1,2,'Legacy response',1)`);
      await expect(legacy.exec(read(migration))).rejects.toThrow(/QMS_TENANT_PARENTAGE_RECONCILIATION_REQUIRED.*finding_responses/);
      await legacy.exec('ROLLBACK');
      const retained = await legacy.query<{ organization_id: number; finding_id: number }>('SELECT organization_id,finding_id FROM finding_responses');
      expect(retained.rows).toEqual([{ organization_id: 1, finding_id: 2 }]);
      const installed = await legacy.query('SELECT conname FROM pg_constraint WHERE conname=\'finding_responses_finding_same_org_fk\'');
      expect(installed.rows).toEqual([]);
    } finally { await legacy.close(); }
  }, 60_000);

  it('validates a matching retained NOT VALID key before claiming all retained parentage is held', async () => {
    const partial = await fixture();
    try {
      await partial.exec(`CREATE UNIQUE INDEX qms_documents_id_org_uq ON qms_documents (id, organization_id);
        ALTER TABLE qms_training_records ADD CONSTRAINT qms_training_records_document_same_org_fk
          FOREIGN KEY (document_id, organization_id) REFERENCES qms_documents (id, organization_id) NOT VALID;`);
      await partial.exec(read(migration));
      const validated = await partial.query<{ convalidated: boolean }>(`SELECT convalidated FROM pg_constraint
        WHERE conname='qms_training_records_document_same_org_fk'`);
      expect(validated.rows[0].convalidated).toBe(true);
    } finally { await partial.close(); }
  }, 60_000);

  it('refuses a same-named key with a different definition without replacing it', async () => {
    const drift = await fixture();
    try {
      await drift.exec(`ALTER TABLE qms_training_records ADD CONSTRAINT qms_training_records_document_same_org_fk CHECK (true)`);
      await expect(drift.exec(read(migration))).rejects.toThrow(/QMS_TENANT_PARENTAGE_CONSTRAINT_MISMATCH/);
      await drift.exec('ROLLBACK');
      const kept = await drift.query<{ contype: string }>(`SELECT contype FROM pg_constraint
        WHERE conname='qms_training_records_document_same_org_fk'`);
      expect(kept.rows[0].contype).toBe('c');
    } finally { await drift.close(); }
  }, 60_000);
});
