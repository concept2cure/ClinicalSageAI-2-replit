/**
 * GA-D7-13 (2026-11-10): the IND checklist called the placed Investigator's
 * Brochure, Quality Overall Summary and Toxicology Written Summary "Not
 * started". Sequence 0000 had a Vault leaf at exactly those codes; the
 * assembler read only co-authored documents, so a section placed from the
 * Vault read as having no document at all.
 *
 * A section placed by a Vault leaf of this organisation now reads "placed":
 * a document is there, and it is not approved. It never reads approved here,
 * because approving a Vault version is its own gate (leaf-source-resolver's
 * vaultVersionNotTransmittable), so the readiness figure does not move.
 * A leaf naming another organisation's document, or nothing, places nothing.
 *
 * End to end against in-process PGlite, as the assembler's own suite reads it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
vi.mock('../../../db', () => ({
  pool: { query: async (s: string, p?: unknown[]) => ({ rows: (await pglite.query(s, p as unknown[])).rows }) },
  db: {},
}));

import { assembleOrgIndChecklists } from '../ind-checklist-view-assembler';

const ORG = 7;
const OTHER_ORG = 8;
const PROGRAM = '5b000000-0000-4000-8000-000000000001';
const OTHER_PROGRAM = '5b000000-0000-4000-8000-000000000002';
const IB = '5b000000-0000-4000-8000-0000000000b1';
const QOS = '5b000000-0000-4000-8000-0000000000b2';
const FOREIGN = '5b000000-0000-4000-8000-0000000000f1';
const MISSING = '5b000000-0000-4000-8000-0000000000ff';
const DELETED = '5b000000-0000-4000-8000-0000000000d1';
const GONE_PROGRAM = '5b000000-0000-4000-8000-000000000003';
const IN_GONE_PROGRAM = '5b000000-0000-4000-8000-0000000000d2';
const FORM_DOC = '5b000000-0000-4000-8000-0000000000c1';

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text);
    CREATE TABLE submissions (id serial PRIMARY KEY, organization_id int, program_id uuid, title text, product_name text, application_type text, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int, submission_id int, sequence_number text NOT NULL DEFAULT '0000', deleted_at timestamptz);
    CREATE TABLE submission_leaves (id serial PRIMARY KEY, organization_id int, sequence_id int, section_code text, lifecycle_op text NOT NULL DEFAULT 'new', document_table text, document_id int, document_uuid uuid, document_type text, deleted_at timestamptz);
    CREATE TABLE rendered_leaf_files (id serial PRIMARY KEY, organization_id int, rendered_from text, file_name text, sha256 text, section_code text, required_fields_missing text[], completed_signed_attested_by int, completed_signed_attested_at timestamptz);
    CREATE TABLE coauthor_documents (id serial PRIMARY KEY, organization_id int, module_number text, status text, module_name text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, name text, code text, program_type text, product_name text, target_submission_date timestamptz, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid NOT NULL, organization_id int, supersedes_id uuid, document_code text, deleted_at timestamptz);
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure'), (${OTHER_ORG}, 'Elsewhere');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type) VALUES
      ('${PROGRAM}', ${ORG}, 'C2C-101', 'C2C-101', 'IND'),
      ('${OTHER_PROGRAM}', ${OTHER_ORG}, 'X-1', 'X-1', 'IND');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, deleted_at) VALUES
      ('${GONE_PROGRAM}', ${ORG}, 'C2C-OLD', 'C2C-OLD', 'IND', now());
    INSERT INTO vault.documents (id, program_id, organization_id, document_code, deleted_at) VALUES
      ('${IB}', '${PROGRAM}', ${ORG}, 'IB-001', NULL),
      ('${QOS}', '${PROGRAM}', ${ORG}, 'QOS-001', NULL),
      ('${FOREIGN}', '${OTHER_PROGRAM}', ${OTHER_ORG}, 'X-001', NULL),
      ('${DELETED}', '${PROGRAM}', ${ORG}, 'DEL-001', now()),
      ('${IN_GONE_PROGRAM}', '${GONE_PROGRAM}', ${ORG}, 'OLD-001', NULL),
      ('${FORM_DOC}', '${PROGRAM}', ${ORG}, 'F1572-001', NULL);
  `);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves; DELETE FROM coauthor_documents;`);
});

/** One IND submission, sequence 0000, with the given Vault leaves. */
async function place(leaves: Array<[code: string, uuid: string]>): Promise<number> {
  const s = await pglite.query<{ id: number }>(
    `INSERT INTO submissions (organization_id, program_id, title, product_name, application_type) VALUES ($1,$2,'C2C-101','C2C-101','ind') RETURNING id`,
    [ORG, PROGRAM],
  );
  const q = await pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (organization_id, submission_id, sequence_number) VALUES ($1,$2,'0000') RETURNING id`,
    [ORG, s.rows[0].id],
  );
  for (const [code, uuid] of leaves) {
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,document_table,document_uuid) VALUES ($1,$2,$3,'vault_documents',$4)`,
      [ORG, q.rows[0].id, code, uuid],
    );
  }
  return q.rows[0].id;
}

async function checklist(): Promise<any> {
  const [ind] = (await assembleOrgIndChecklists(ORG)) as any[];
  return ind;
}

describe('IND checklist — a section placed from the Vault reads as placed', () => {
  it('the placed Investigator\'s Brochure and QOS read "placed", never "not started" and never approved', async () => {
    await place([['m1.14.4.1', IB], ['2.3', QOS]]);
    const ind = await checklist();
    const byCode = Object.fromEntries(ind.sections.map((s: any) => [s.code, s.status]));
    expect(byCode['m1.14.4.1']).toBe('placed');
    expect(byCode['m2.3']).toBe('placed');

    // The readiness verdict still says these are not approved: placed is not done.
    const gaps = Object.fromEntries(ind.readiness.requiredSections.incomplete.map((g: any) => [g.code, g.status]));
    expect(gaps['m1.14.4.1']).toBe('placed');
    expect(ind.readiness.requiredSections.completed).toBe(0);
    expect(ind.readiness.ready).toBe(false);
  });

  it('the module card counts a placed section as in progress, not approved', async () => {
    await place([['m1.14.4.1', IB]]);
    const ind = await checklist();
    const m1 = ind.readiness.moduleProgress.find((m: any) => m.module === 'M1');
    expect(m1.completed).toBe(0);
    expect(m1.inProgress).toBeGreaterThanOrEqual(1);
  });

  it('a leaf naming another organisation\'s document, a missing one or a deleted one places nothing', async () => {
    await place([['m2.6.6', FOREIGN], ['m2.3', MISSING], ['m1.14.4.1', DELETED]]);
    const ind = await checklist();
    expect(ind.sections).toEqual([]);
    const gaps = Object.fromEntries(ind.readiness.requiredSections.incomplete.map((g: any) => [g.code, g.status]));
    expect(gaps['m1.14.4.1']).toBe('not_started');
  });

  it('a co-authored document at the same code still governs when it is less advanced', async () => {
    await place([['m2.3', QOS]]);
    await pglite.query(`INSERT INTO coauthor_documents (id, organization_id, module_number, status, module_name) VALUES (900, $1, '2.3', 'approved', 'QOS')`, [ORG]);
    const seq = await pglite.query<{ id: number }>(`SELECT id FROM ectd_sequences LIMIT 1`);
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,document_table,document_id) VALUES ($1,$2,'m2.3','coauthor_documents',900)`,
      [ORG, seq.rows[0].id],
    );
    const ind = await checklist();
    // One approved co-authored document does not hide a Vault document that is not approved.
    expect(ind.sections.find((s: any) => s.code === 'm2.3').status).toBe('placed');
  });

  it('a document in a deleted programme of this organisation places nothing', async () => {
    await place([['m1.14.4.1', IN_GONE_PROGRAM]]);
    const ind = await checklist();
    expect(ind.sections).toEqual([]);
    const gaps = Object.fromEntries(ind.readiness.requiredSections.incomplete.map((g: any) => [g.code, g.status]));
    expect(gaps['m1.14.4.1']).toBe('not_started');
  });

  it('a Vault leaf at a form code or the forms heading does not read as placed: a form is judged by its own evidence', async () => {
    await place([['1.1.2', FORM_DOC], ['1.1', FORM_DOC]]);
    const ind = await checklist();
    const placed = ind.sections.filter((s: any) => s.status === 'placed').map((s: any) => s.code);
    expect(placed).toEqual([]);
    expect(ind.sections.find((s: any) => s.code === 'm1.1')).toBeUndefined();
    // The 1572 row has no authored document: a Vault leaf there is not one.
    const f1572 = ind.forms.find((f: any) => f.id === 'FDA_1572');
    expect(f1572.authored).toBeNull();
    expect(f1572.done).toBe(false);
  });

  it('with no programme store (42P01) the ownership read knows of no document: the checklist assembles and the section reads not started', async () => {
    // The programme store is what proves a Vault document is this organisation's.
    // (vault.documents itself is read first by the version-lineage read, which
    // is not this lane's file, so its absence is not the case exercised here.)
    await place([['m1.14.4.1', IB]]);
    await pglite.exec(`ALTER TABLE regulatory_programs RENAME TO regulatory_programs_absent`);
    try {
      const ind = await checklist();
      expect(ind).toBeDefined();
      const gaps = Object.fromEntries(ind.readiness.requiredSections.incomplete.map((g: any) => [g.code, g.status]));
      expect(gaps['m1.14.4.1']).toBe('not_started');
    } finally {
      await pglite.exec(`ALTER TABLE regulatory_programs_absent RENAME TO regulatory_programs`);
    }
  });
});
