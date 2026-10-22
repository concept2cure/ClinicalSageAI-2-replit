/**
 * The IND checklist counts an AUTHORED Form 1571 / 1572 / 3674 (a co-author
 * document placed at the form's code) as done only when it is 'signed' and a
 * signature record stands behind it; otherwise the form reports
 * "authored — not signed" and is not done.
 *
 * What it used to do (2026-10-15): COMPLETE was approved | signed | locked, so
 * an approved or locked authored document at m1.1.1 marked Form FDA 1571 done
 * and raised readiness — with no signature on the form — while the upload path
 * requires the uploader's attestation that the file IS the completed, signed
 * form. Consistent with DP-35: a lock or a document approval is not the form's
 * signature.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string, params?: unknown[]) => {
      const r = await pglite.query(sql, params as unknown[]);
      return { rows: r.rows as unknown[], rowCount: (r.rows as unknown[]).length };
    },
  },
  db: {},
}));

import { assembleOrgIndChecklists } from '../ind-checklist-view-assembler';

const ORG = 7;
const SOURCE = '0f8fad5b-d9cb-469f-a165-70867728950e';

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, program_id uuid, title text, product_name text, application_type text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, sequence_number text NOT NULL DEFAULT '0000', deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, lifecycle_op text NOT NULL DEFAULT 'new', document_table text, document_id int, document_uuid uuid, document_type text, deleted_at timestamptz);
CREATE TABLE rendered_leaf_files (id serial PRIMARY KEY, organization_id int, required_fields_missing text[], completed_signed_attested_by int, completed_signed_attested_at timestamptz);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, name text, code text, program_type text, product_name text, target_submission_date timestamptz, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE c2c_document_aliases (canonical_id uuid NOT NULL, store text NOT NULL, native_id text NOT NULL, organization_id int NOT NULL, PRIMARY KEY (store, native_id));
CREATE TABLE authoring_signatures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid NOT NULL, tenant_id int NOT NULL, meaning text NOT NULL);
`;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Concept2Cure')`, [ORG]);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves; DELETE FROM coauthor_documents; DELETE FROM c2c_document_aliases; DELETE FROM authoring_signatures;`);
});

/** One IND with a co-author document at Form 1571's code, in the given status. */
async function authored1571(status: string): Promise<number> {
  const s = await pglite.query<{ id: number }>(
    `INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,'PLR-606 IND','PLR-606','ind') RETURNING id`, [ORG]);
  const q = await pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (organization_id, submission_id) VALUES ($1,$2) RETURNING id`, [ORG, s.rows[0].id]);
  const d = await pglite.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, module_number, status, module_name) VALUES ($1,'m1.1.1',$2,'Form 1571') RETURNING id`, [ORG, status]);
  await pglite.query(
    `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id) VALUES ($1,$2,'m1.1.1','coauthor_documents',$3)`,
    [ORG, q.rows[0].id, d.rows[0].id]);
  return d.rows[0].id;
}

/** The co-author copy's source authoring document, and a signature on it. */
async function signSource(docId: number): Promise<void> {
  await pglite.query(`INSERT INTO c2c_document_aliases VALUES ($1,'coauthor_documents',$2,$3)`, [SOURCE, String(docId), ORG]);
  await pglite.query(`INSERT INTO authoring_signatures (doc_id, tenant_id, meaning) VALUES ($1,$2,'APPROVER')`, [SOURCE, ORG]);
}

type Form = { id: string; done: boolean; authored: { status: string; signed: boolean } | null };
async function form1571() {
  const [ind] = (await assembleOrgIndChecklists(ORG)) as Array<{ forms: Form[]; readiness: { forms: { completed: string[] } } }>;
  return { form: ind.forms.find((f) => f.id === 'FDA_1571')!, ind };
}

describe('an authored IND form counts only when signed with a signature record', () => {
  it.each(['approved', 'locked'])('%s with no signature: not done, reported "authored — not signed"', async (status) => {
    await authored1571(status);
    const { form, ind } = await form1571();
    expect(form.done, `an ${status} authored Form 1571 counted as the signed form`).toBe(false);
    expect(form.authored).toEqual({ status, signed: false });
    expect(ind.readiness.forms.completed).not.toContain('FDA_1571');
  });

  it("an approved document whose source carries an approval signature is still not the form's signature", async () => {
    await signSource(await authored1571('approved'));
    const { form } = await form1571();
    expect(form.done).toBe(false);
  });

  it("'signed' with no signature record is not done", async () => {
    await authored1571('signed');
    const { form } = await form1571();
    expect(form).toMatchObject({ done: false, authored: { status: 'signed', signed: false } });
  });

  it("'signed' with a signature record on its source completes the form", async () => {
    await signSource(await authored1571('signed'));
    const { form, ind } = await form1571();
    expect(form).toMatchObject({ done: true, authored: { status: 'signed', signed: true } });
    expect(ind.readiness.forms.completed).toContain('FDA_1571');
  });

  it('no document at the form: authored is null', async () => {
    await authored1571('draft');
    const [ind] = (await assembleOrgIndChecklists(ORG)) as Array<{ forms: Form[] }>;
    expect(ind.forms.find((f) => f.id === 'FDA_1572')!.authored).toBeNull();
  });
});
