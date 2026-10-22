/**
 * The IND checklist's current inventory binds a later Vault version through its
 * recorded lineage, as package-from-core binds it (P-42, 2026-10-22, W5/D7).
 *
 * Before, the checklist keyed the act on the version's own uuid:
 *
 *  - a replace by version 2 read "replace names no current document" and
 *    blocked readiness;
 *  - a version 2 placed as new stood beside version 1;
 *  - a withdrawal naming version 2 found nothing to withdraw.
 *
 * End to end against in-process PGlite, as ind-checklist-view-assembler's own
 * suite reads it.
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
const PROGRAM = '5a000000-0000-4000-8000-000000000001';
const V1 = '5a000000-0000-4000-8000-0000000000a1';
const V2 = '5a000000-0000-4000-8000-0000000000a2';
// Names V1 as its predecessor under another document code: the database guard
// refuses that link, so the family reader does not follow it.
const VX = '5a000000-0000-4000-8000-0000000000af';

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
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure');
    INSERT INTO vault.documents (id, program_id, organization_id, supersedes_id, document_code) VALUES
      ('${V1}', '${PROGRAM}', ${ORG}, NULL,    'AP-001'),
      ('${V2}', '${PROGRAM}', ${ORG}, '${V1}', 'AP-001'),
      ('${VX}', '${PROGRAM}', ${ORG}, '${V1}', 'OTHER-002');
  `);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`DELETE FROM submissions; DELETE FROM ectd_sequences; DELETE FROM submission_leaves;`);
});

/** One IND submission whose sequences place, in order, the given Vault acts (at 3.2.S.4.2 unless coded). */
async function fileActs(acts: Array<[uuid: string, op: string, code?: string]>): Promise<void> {
  const s = await pglite.query<{ id: number }>(
    `INSERT INTO submissions (organization_id, title, product_name, application_type) VALUES ($1,'BX-512','BX-512','ind') RETURNING id`,
    [ORG],
  );
  for (const [i, [uuid, op, code = 'm3.2.S.4.2']] of acts.entries()) {
    const q = await pglite.query<{ id: number }>(
      `INSERT INTO ectd_sequences (organization_id, submission_id, sequence_number) VALUES ($1,$2,$3) RETURNING id`,
      [ORG, s.rows[0].id, String(i).padStart(4, '0')],
    );
    await pglite.query(
      `INSERT INTO submission_leaves (organization_id,sequence_id,section_code,lifecycle_op,document_table,document_uuid) VALUES ($1,$2,$3,$4,'vault_documents',$5)`,
      [ORG, q.rows[0].id, code, op, uuid],
    );
  }
}

async function lifecycleBlockers(): Promise<string[]> {
  const [ind] = await assembleOrgIndChecklists(ORG) as any[];
  return ind.readiness.blockers.filter((b: any) => b.kind === 'lifecycle').map((b: any) => b.message);
}

describe('IND checklist — Vault versions bound through recorded lineage', () => {
  it('a replace by a later version supersedes the current earlier version without a blocker', async () => {
    await fileActs([[V1, 'new'], [V2, 'replace', '3.2.s.4.2']]);
    expect(await lifecycleBlockers()).toEqual([]);
  });

  it('a later version placed as new replaces the current earlier version, so a withdrawal of it leaves nothing current', async () => {
    await fileActs([[V1, 'new'], [V2, 'new'], [V2, 'delete'], [V1, 'delete']]);
    // V1 left the inventory when V2 was placed: withdrawing it again names nothing current.
    expect(await lifecycleBlockers()).toEqual([expect.stringContaining('withdrawal names no current document')]);
  });

  it('a withdrawal naming the later version withdraws the earlier version on record', async () => {
    await fileActs([[V1, 'new'], [V2, 'delete']]);
    expect(await lifecycleBlockers()).toEqual([]);
  });

  it('does not follow a predecessor link the database rules refuse', async () => {
    await fileActs([[V1, 'new'], [VX, 'replace']]);
    expect(await lifecycleBlockers()).toEqual([expect.stringContaining('replace names no current document')]);
  });
});
