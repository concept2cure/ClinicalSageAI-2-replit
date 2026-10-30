/**
 * A CSR made from a CSR template is a CSR, whatever its title says (D5,
 * 2026-10-30; the CSR path sweep).
 *
 * The scientific review decides what a document is from its stored identity
 * (csr-scientific-review.ts requiresCsrScientificReview). It read labels only.
 * The IND library's "5.3.5.1 · Clinical Study Reports of Controlled Studies"
 * failed the label rule on the plural, its module "M5" names nothing, and its
 * template id is a UUID no label rule can match. So a CSR drafted from the IND
 * 5.3.5.1 or 5.3.5.2 template, or from the E3 template and then renamed, was
 * approved, signed, frozen, exported and filed to the Vault with no figure ever
 * mapped to a retained table cell. The four built-in CSR templates now make a
 * document a CSR by its stored template id, read from the row itself, and the
 * label accepts the plural.
 */
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertCsrScientificRelease, requiresCsrScientificReview } from '../csr-scientific-review';
import { CSR_TEMPLATE_IDS, labelledCsr } from '../../../../shared/authoring/csr-scientific-review';
import { getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';
import { indTemplateId } from '../ind-authoring-templates';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';

const ORG = 77;
const PROGRAM = '10000000-0000-4000-8000-000000000077';
let pg: PGlite;
const q = { query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
  const result = await pg.query<R>(sql, params as unknown[]);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
} };
const migration = (file: string) => readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8');

const IND_5351 = indTemplateId('section:m5.3.5.1');
const IND_5352 = indTemplateId('section:m5.3.5.2');
const E3_COMPONENT = CSR_TEMPLATE_IDS[3];

async function storedDocument(title: string, templateId: string | null): Promise<string> {
  const id = randomUUID();
  await q.query(`INSERT INTO authoring_documents(id,title,module,locale,version,created_by,tenant_id,template_id)
    VALUES($1,$2,'M5','en',1,'9',$3,$4)`, [id, title, ORG, templateId]);
  return id;
}
/** What a caller that selected only some columns passes: no template_id. */
const narrowRow = (id: string, title: string) => ({ id, title, module: 'M5', client_program_id: PROGRAM });
const required = (id: string, document: Record<string, unknown>) =>
  requiresCsrScientificReview(q, { tenantId: ORG, document, snapshot: { id } });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,name text,status text);
    INSERT INTO organizations VALUES(77,'Lumen Bioscience','active');
    CREATE TABLE users(id integer PRIMARY KEY,email text,status text);
    INSERT INTO users VALUES(8,'reviewer@example.test','active'),(9,'author@example.test','active');
    CREATE TABLE organization_users(user_id integer,organization_id integer,role text);
    INSERT INTO organization_users VALUES(8,77,'reviewer'),(9,77,'author');`);
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  for (const file of ['db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260725_authoring_audit_trail.sql', 'migrations/20260728_authoring_reviews.sql']) await pg.exec(migration(file));
}, 90_000);
afterAll(async () => { await pg.close(); });

describe('the built-in CSR templates', () => {
  it('are exactly the IND 5.3.5.1 and 5.3.5.2 sections, the registry CSR and the E3 component, by the ids the library resolves', async () => {
    const entries = await Promise.all(CSR_TEMPLATE_IDS.map(async id => (await getBuiltinAuthoringTemplate(id))?.entryId));
    expect(entries).toEqual(['section:m5.3.5.1', 'section:m5.3.5.2', 'registry:ICH_CSR', 'component:clinical_study_report']);
    expect([IND_5351, IND_5352]).toEqual(CSR_TEMPLATE_IDS.slice(0, 2));
  });
});

describe('a CSR is recognised by its stored template, not its title', () => {
  it('a document made from the IND 5.3.5.1 template is a CSR', async () => {
    const id = await storedDocument('5.3.5.1 · Clinical Study Reports of Controlled Studies', IND_5351);
    expect(await required(id, { ...narrowRow(id, '5.3.5.1 · Clinical Study Reports of Controlled Studies'), template_id: IND_5351 })).toBe(true);
  });

  it('a document made from the IND 5.3.5.2 template and renamed is a CSR, read from its stored row when the caller does not pass the template', async () => {
    const id = await storedDocument('RePreve Part B results', IND_5352);
    expect(await required(id, narrowRow(id, 'RePreve Part B results'))).toBe(true);
  });

  it('a document made from the E3 template and renamed is a CSR', async () => {
    const id = await storedDocument('LMN-201 RePreve Final Report', E3_COMPONENT);
    expect(await required(id, narrowRow(id, 'LMN-201 RePreve Final Report'))).toBe(true);
  });

  it('another Module 5 template is not (control)', async () => {
    const iss = indTemplateId('section:m5.3.5.3');
    const id = await storedDocument('5.3.5.3 · Reports of Analyses of Data from More than One Study', iss);
    expect(await required(id, { ...narrowRow(id, '5.3.5.3 · Reports of Analyses of Data from More than One Study'), template_id: iss })).toBe(false);
  });

  it('the release gate refuses a template-made CSR with no scientific-review receipt', async () => {
    const id = await storedDocument('RePreve final', IND_5351);
    await expect(assertCsrScientificRelease(q, { organizationId: ORG, doc: narrowRow(id, 'RePreve final'),
      sections: [{ id: randomUUID(), code: '11.4', title: 'Efficacy results', content: '<p>10 of 12 and 4 of 11 participants.</p>' }],
      actor: { id: '41' } })).rejects.toMatchObject({ code: 'CSR_SCIENTIFIC_REVIEW_REQUIRED' });
  });
});

describe('the label', () => {
  it('names a CSR in the singular or the plural', () => {
    for (const label of ['5.3.5.1 · Clinical Study Reports of Controlled Studies', 'Clinical Study Report', 'CSRs for LMN-201', 'LMN-201 CSR']) {
      expect(labelledCsr(label), label).toBe(true);
    }
  });
  it('does not name a nonclinical study report, a protocol or a clinical overview', () => {
    for (const label of ['Nonclinical study report', 'Clinical Study Protocol', '2.5 Clinical Overview', 'Reports of Analyses of Data from More than One Study']) {
      expect(labelledCsr(label), label).toBe(false);
    }
  });
});
