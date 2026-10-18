/**
 * The IND checklist counts a sponsor-attached Module 1 form only when the
 * uploader attested it is the completed, signed form — and says
 * "attached — not attested" otherwise.
 *
 * What it used to do (report_ind_ivd_irb #15, 2026-10-15): a 1571 / 1572 /
 * 3674 was `done`, and raised readiness %, whenever its attached PDF carried
 * an empty `required_fields_missing`. That array is the forms engine's check
 * over the PROGRAM RECORD (attached-form-check.ts), not over the file: the
 * engine cannot read boxes completed in Acrobat or a signature. Any PDF that
 * passed the scan and was not the platform's own unedited render — an edited,
 * unsigned one included — counted as the sponsor-completed, signed form.
 *
 * rendered_leaf_files is built here from the real migrations (20260903 and
 * 20261008e), so the columns read are the deployed ones.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

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
const UPLOADER = 9;
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, program_id uuid, title text, product_name text, application_type text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, sequence_number text NOT NULL DEFAULT '0000', deleted_at timestamptz);
CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, lifecycle_op text NOT NULL DEFAULT 'new', document_table text, document_id int, document_uuid uuid, document_type text, deleted_at timestamptz);
CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, name text, code text, program_type text, product_name text, target_submission_date timestamptz, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
`;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
  await pglite.exec(read('migrations/20260903_rendered_leaf_files.sql'));
  await pglite.exec(read('migrations/20261008e_rendered_leaf_files_required_fields_missing.sql'));
  await pglite.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Concept2Cure')`, [ORG]);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves; DELETE FROM rendered_leaf_files;`);
});

async function seedInd(): Promise<number> {
  const s = await pglite.query<{ id: number }>(
    `INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,'PLR-606 IND','PLR-606','ind') RETURNING id`,
    [ORG],
  );
  return s.rows[0].id;
}
async function sequence(subId: number, number = '0000'): Promise<number> {
  const q = await pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (organization_id, submission_id, sequence_number) VALUES ($1,$2,$3) RETURNING id`,
    [ORG, subId, number],
  );
  return q.rows[0].id;
}

/** A sponsor-attached form file placed at its Module 1 leaf, as official-upload files it. */
async function attach(
  seqId: number,
  documentType: string,
  opts: { missing?: string[] | null; attested?: boolean } = {},
): Promise<void> {
  const attested = opts.attested ?? false;
  const f = await pglite.query<{ id: number }>(
    `INSERT INTO rendered_leaf_files
       (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from, section_code,
        required_fields_missing, created_by, completed_signed_attested_by, completed_signed_attested_at)
     VALUES ($1, gen_random_uuid()::text, 'sha', 'md5', 'application/pdf', 2048, $2, 'ind_form_sponsor_upload', 'm1.1',
             $3, $4, $5, $6)
     RETURNING id`,
    [ORG, `${documentType}.pdf`, opts.missing === undefined ? [] : opts.missing, UPLOADER,
      attested ? UPLOADER : null, attested ? new Date('2026-10-15T09:00:00Z') : null],
  );
  await pglite.query(
    `INSERT INTO submission_leaves (organization_id, sequence_id, section_code, document_table, document_id, document_type)
     VALUES ($1, $2, 'm1.1', 'rendered_leaf_files', $3, $4)`,
    [ORG, seqId, f.rows[0].id, documentType],
  );
}

type Form = { id: string; done: boolean; attachment: { attested: boolean; requiredFieldsMissing: string[] | null } | null };
async function checklist() {
  const [ind] = (await assembleOrgIndChecklists(ORG)) as Array<{ forms: Form[]; readiness: { overallPercentage: number; forms: { completed: string[] } } }>;
  const form = (id: string) => ind.forms.find((f) => f.id === id)!;
  return { ind, form };
}

describe('a sponsor-attached Module 1 form counts only when the uploader attested it is the completed, signed form', () => {
  it('checked complete but not attested: "attached — not attested", not done, and not counted by readiness', async () => {
    await attach(await sequence(await seedInd()), 'form_1571', { missing: [] });
    const { ind, form } = await checklist();
    expect(form('FDA_1571').done, 'an unattested PDF counts as the signed Form 1571').toBe(false);
    expect(form('FDA_1571').attachment).toEqual({ attested: false, requiredFieldsMissing: [] });
    expect(ind.readiness.forms.completed).not.toContain('FDA_1571');
  });

  it('the same file, attested by the uploader, completes the form and counts toward readiness', async () => {
    await attach(await sequence(await seedInd()), 'form_1571', { missing: [], attested: true });
    const { ind, form } = await checklist();
    expect(form('FDA_1571').done).toBe(true);
    expect(form('FDA_1571').attachment).toEqual({ attested: true, requiredFieldsMissing: [] });
    expect(ind.readiness.forms.completed).toContain('FDA_1571');
  });

  it('an unattested attachment does not raise readiness %; the attested one does', async () => {
    const seq = await sequence(await seedInd());
    const before = (await checklist()).ind.readiness.overallPercentage;
    await attach(seq, 'form_1572', { missing: [] });
    expect((await checklist()).ind.readiness.overallPercentage, 'an unattested attachment raised readiness').toBe(before);
    await pglite.query(
      `UPDATE rendered_leaf_files SET completed_signed_attested_by = $1, completed_signed_attested_at = now()`,
      [UPLOADER],
    );
    expect((await checklist()).ind.readiness.overallPercentage).toBeGreaterThan(before);
  });

  it('attested, but the forms engine found required fields missing or could not check it: still not done', async () => {
    const seq = await sequence(await seedInd());
    await attach(seq, 'form_1572', { missing: ['irb_name'], attested: true });
    await attach(seq, 'form_3674', { missing: null, attested: true });
    const { form } = await checklist();
    expect(form('FDA_1572')).toMatchObject({ done: false, attachment: { attested: true, requiredFieldsMissing: ['irb_name'] } });
    expect(form('FDA_3674')).toMatchObject({ done: false, attachment: { attested: true, requiredFieldsMissing: null } });
  });

  it('a form with no file placed reports no attachment', async () => {
    await sequence(await seedInd());
    const { form } = await checklist();
    expect(form('FDA_1571')).toMatchObject({ done: false, attachment: null });
  });

  it('one attested, complete copy among the form’s attachments completes it, and is the one reported', async () => {
    const sub = await seedInd();
    await attach(await sequence(sub, '0000'), 'form_1571', { missing: [] });
    await attach(await sequence(sub, '0001'), 'form_1571', { missing: [], attested: true });
    const { form } = await checklist();
    expect(form('FDA_1571')).toMatchObject({ done: true, attachment: { attested: true, requiredFieldsMissing: [] } });
  });
});
