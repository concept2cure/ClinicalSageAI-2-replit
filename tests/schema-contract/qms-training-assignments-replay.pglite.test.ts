/**
 * migrations/20261029g_qms_job_roles_and_training_assignments.sql: each
 * organization's job roles, who holds them, and each controlled document's
 * training assignments (P-49, P-50; MR-12 Stage 4; launch rows D2/D5;
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.1, slice 1).
 *
 * Real DDL: qms_documents from its creator (20260511, after 20260524's
 * regulatory_programs, which its labeling tables name), and its (id,
 * organization_id) key qms_documents_id_org_uq, the statement read out of
 * 20261013b itself rather than restated here. Every deploy replays the file
 * (CLAUDE.md Rule 1), so it is applied three times, with rows in the tables
 * between replays, and the catalogue must not move. Then the store's rules:
 *   - an assignment names exactly one job role or one person;
 *   - a live name, member or assignment is unique, and can be added again once
 *     it is soft-removed (the history row stays);
 *   - a role, member or assignment of one organization cannot name another
 *     organization's role or document.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const FILE = 'migrations/20261029g_qms_job_roles_and_training_assignments.sql';
const PROGRAMS = 'migrations/20260524_program_workbench_schema.sql'; // regulatory_programs, which 20260511's labeling tables name
const QMS = 'migrations/20260511_qms_and_labeling.sql';
const SAME_ORG_KEYS = 'migrations/20261013b_qms_inspection_same_org_keys.sql';
const TABLES = ['qms_job_roles', 'qms_job_role_members', 'qms_training_assignments'] as const;

let db: PGlite;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

/** The one statement 20261013b uses to give qms_documents its (id, organization_id) key. */
function documentOrgKeyStatement(): string {
  const match = read(SAME_ORG_KEYS).match(/CREATE UNIQUE INDEX IF NOT EXISTS qms_documents_id_org_uq\s+ON public\.qms_documents \(id, organization_id\);/);
  if (!match) throw new Error(`${SAME_ORG_KEYS} no longer creates qms_documents_id_org_uq as this test expects`);
  return match[0];
}

const catalogue = async () => ({
  constraints: (await db.query<{ rel: string; conname: string; def: string }>(
    `SELECT conrelid::regclass::text AS rel, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid::regclass::text = ANY($1::text[]) ORDER BY 1, 2`, [TABLES as unknown as string[]])).rows,
  indexes: (await db.query<{ tablename: string; indexname: string; indexdef: string }>(
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE tablename = ANY($1::text[]) ORDER BY 1, 2`,
    [TABLES as unknown as string[]])).rows,
  nodes: (await db.query<{ relname: string; relfilenode: number }>(
    `SELECT relname, relfilenode FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY 1`, [TABLES as unknown as string[]])).rows,
});

const role = (org: number, name: string, by = 5) =>
  db.query<{ id: number }>(`INSERT INTO qms_job_roles (organization_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`, [org, name, by]);
const member = (org: number, roleId: number, userId: number) =>
  db.query<{ id: number }>(`INSERT INTO qms_job_role_members (organization_id, job_role_id, user_id, added_by) VALUES ($1, $2, $3, 5) RETURNING id`,
    [org, roleId, userId]);
const assign = (org: number, documentId: number, subject: { roleId?: number | null; userId?: number | null }) =>
  db.query<{ id: number }>(`INSERT INTO qms_training_assignments (organization_id, document_id, job_role_id, user_id, assigned_by)
    VALUES ($1, $2, $3, $4, 5) RETURNING id`, [org, documentId, subject.roleId ?? null, subject.userId ?? null]);
const doc = async (org: number, number: string) => (await db.query<{ id: number }>(
  `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type) VALUES ($1, $2, 'Invented procedure', 'sop') RETURNING id`,
  [org, number])).rows[0].id;

let docA = 0;
let docB = 0;
let first: Awaited<ReturnType<typeof catalogue>>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
                 INSERT INTO organizations (id, name) VALUES (1, 'one'), (2, 'two');
                 INSERT INTO users (id, name) VALUES (5, 'admin'), (6, 'a'), (7, 'b'), (8, 'c');`);
  await db.exec(read(PROGRAMS));
  await db.exec(read(QMS));
  await db.exec(documentOrgKeyStatement());
  docA = await doc(1, 'SOP-001');
  docB = await doc(2, 'SOP-001');
  await db.exec(read(FILE));
  first = await catalogue();
  // Rows written between deploys, as a live tenant would hold them.
  const qa = (await role(1, 'QA')).rows[0].id;
  await member(1, qa, 6);
  await assign(1, docA, { roleId: qa });
  await db.exec(read(FILE));
  await db.exec(read(FILE));
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('the file is on the deploy path', () => {
  it('is in C2C_MIGRATION_FILES after qms_documents and its same-org key, immediately before the tenant tail', () => {
    const set = C2C_MIGRATION_FILES as unknown[];
    const at = set.indexOf(FILE);
    expect(at, 'listed').toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(set.indexOf(QMS));
    expect(at).toBeGreaterThan(set.indexOf(SAME_ORG_KEYS));
    expect(set[at + 1]).toBe(UUID_TENANT_ISOLATION_NONPUBLIC);
  });
});

describe('replayed on every deploy', () => {
  it('creates the three tables with their named rules, and two more replays over live rows change nothing', async () => {
    expect(await catalogue()).toEqual(first);
    expect(first.constraints.map((c) => `${c.rel}.${c.conname}`)).toEqual(expect.arrayContaining([
      'qms_job_roles.qms_job_roles_name_shape', 'qms_job_roles.qms_job_roles_description_len',
      'qms_job_roles.qms_job_roles_updated_pair', 'qms_job_roles.qms_job_roles_deleted_pair',
      'qms_job_role_members.qms_job_role_members_role_same_org_fk', 'qms_job_role_members.qms_job_role_members_removed_pair',
      'qms_training_assignments.qms_training_assignments_document_same_org_fk',
      'qms_training_assignments.qms_training_assignments_role_same_org_fk',
      'qms_training_assignments.qms_training_assignments_one_subject',
      'qms_training_assignments.qms_training_assignments_removed_pair',
    ]));
    expect(first.indexes.map((i) => i.indexname)).toEqual(expect.arrayContaining([
      'qms_job_roles_id_org_uq', 'qms_job_roles_live_name_uq', 'qms_job_role_members_live_uq', 'qms_job_role_members_user_idx',
      'qms_training_assignments_live_role_uq', 'qms_training_assignments_live_user_uq', 'qms_training_assignments_doc_idx',
      'qms_training_assignments_role_idx', 'qms_training_assignments_user_idx',
    ]));
    for (const t of TABLES) {
      const cols = (await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = 'organization_id'`, [t])).rows;
      expect(cols, `${t} is tenant-keyed as the sweep polices`).toEqual([{ column_name: 'organization_id', data_type: 'integer', is_nullable: 'NO' }]);
    }
    expect((await db.query(`SELECT 1 FROM qms_training_assignments`)).rows, 'the rows written between deploys stand').toHaveLength(1);
  });
});

describe('an assignment names exactly one job role or one person', () => {
  it('refuses neither and both, and accepts each alone', async () => {
    const r = (await role(1, 'Manufacturing')).rows[0].id;
    expect(await code(assign(1, docA, {})), 'neither').toBe('23514');
    expect(await code(assign(1, docA, { roleId: r, userId: 7 })), 'both').toBe('23514');
    expect(await code(assign(1, docA, { roleId: r }))).toBe('ok');
    expect(await code(assign(1, docA, { userId: 7 }))).toBe('ok');
  });
});

describe('a role name is trimmed, 1 to 80 characters, and its pairs are set together', () => {
  it('refuses a blank, untrimmed or over-long name, an over-long description and a half-set pair', async () => {
    for (const [why, name] of [['blank', ''], ['untrimmed', ' QA '], ['81 characters', 'x'.repeat(81)]] as const) {
      expect(await code(role(1, name)), why).toBe('23514');
    }
    expect(await code(db.query(`INSERT INTO qms_job_roles (organization_id, name, description, created_by) VALUES (1, 'Long', $1, 5)`, ['d'.repeat(501)]))).toBe('23514');
    expect(await code(db.query(`INSERT INTO qms_job_roles (organization_id, name, created_by, updated_at) VALUES (1, 'Half', 5, now())`)), 'updated_at without updated_by').toBe('23514');
    expect(await code(db.query(`INSERT INTO qms_job_roles (organization_id, name, created_by, deleted_by) VALUES (1, 'Half', 5, 5)`)), 'deleted_by without deleted_at').toBe('23514');
    const r = (await role(1, 'Pairs')).rows[0].id;
    const m = (await member(1, r, 7)).rows[0].id;
    expect(await code(db.query(`UPDATE qms_job_role_members SET removed_at = now() WHERE id = $1`, [m])), 'removed_at without removed_by').toBe('23514');
    const a = (await assign(1, docA, { userId: 8 })).rows[0].id;
    expect(await code(db.query(`UPDATE qms_training_assignments SET removed_by = 5 WHERE id = $1`, [a])), 'removed_by without removed_at').toBe('23514');
  });
});

describe('live rows are unique, and can be added again once soft-removed', () => {
  it('a role name, case-insensitively, until the role is deleted', async () => {
    const r = (await role(1, 'Clinical Operations')).rows[0].id;
    expect(await code(role(1, 'clinical operations'))).toBe('23505');
    expect(await code(role(2, 'Clinical Operations')), 'another organization keeps its own list').toBe('ok');
    await db.query(`UPDATE qms_job_roles SET deleted_at = now(), deleted_by = 5 WHERE id = $1`, [r]);
    expect(await code(role(1, 'Clinical Operations'))).toBe('ok');
    expect((await db.query(`SELECT 1 FROM qms_job_roles WHERE organization_id = 1 AND lower(name) = 'clinical operations'`)).rows).toHaveLength(2);
  });

  it('a member, until removed', async () => {
    const r = (await role(1, 'Validation')).rows[0].id;
    const m = (await member(1, r, 6)).rows[0].id;
    expect(await code(member(1, r, 6))).toBe('23505');
    await db.query(`UPDATE qms_job_role_members SET removed_at = now(), removed_by = 5 WHERE id = $1`, [m]);
    expect(await code(member(1, r, 6))).toBe('ok');
    expect((await db.query(`SELECT 1 FROM qms_job_role_members WHERE job_role_id = $1`, [r])).rows).toHaveLength(2);
  });

  it('an assignment of a role and of a person, until withdrawn', async () => {
    const r = (await role(1, 'Warehouse')).rows[0].id;
    const byRole = (await assign(1, docA, { roleId: r })).rows[0].id;
    const byName = (await assign(1, docA, { userId: 6 })).rows[0].id;
    expect(await code(assign(1, docA, { roleId: r }))).toBe('23505');
    expect(await code(assign(1, docA, { userId: 6 }))).toBe('23505');
    await db.query(`UPDATE qms_training_assignments SET removed_at = now(), removed_by = 5 WHERE id = ANY($1::int[])`, [[byRole, byName]]);
    expect(await code(assign(1, docA, { roleId: r }))).toBe('ok');
    expect(await code(assign(1, docA, { userId: 6 }))).toBe('ok');
  });
});

describe('nothing names another organization\'s role or document', () => {
  it('refuses a member of a foreign role, and an assignment of a foreign role or a foreign document', async () => {
    const theirs = (await role(2, 'Their QA')).rows[0].id;
    const ours = (await role(1, 'Our QA')).rows[0].id;
    expect(await code(member(1, theirs, 6)), 'member of org 2\'s role recorded under org 1').toBe('23503');
    expect(await code(assign(1, docA, { roleId: theirs })), 'org 2\'s role on org 1\'s document').toBe('23503');
    expect(await code(assign(1, docB, { roleId: ours })), 'org 2\'s document under org 1').toBe('23503');
    expect(await code(assign(2, docB, { roleId: theirs }))).toBe('ok');
  });
});
