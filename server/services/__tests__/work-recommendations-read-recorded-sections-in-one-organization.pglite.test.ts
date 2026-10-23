/**
 * GET /work-queue?projectId= regenerates the user's queue for a project from
 * the project's recorded sections — reading the columns project_sections has —
 * and clears only the caller's organization's derived rows.
 *
 * What the code used to do (until 2026-10-15): generateWorkRecommendations
 * selected `ps.assigned_to_id` and ordered by `ps.sort_order`. project_sections
 * (db/migrations/20260220_ind_section_tracking.sql, its only definition) has
 * `assigned_to` and no `sort_order`, so every regeneration threw and GET
 * /work-queue?projectId= answered 500. Its DELETE of the previous derived rows
 * named no organization: once the read could run, a regeneration in one
 * organization deleted the user's pending rows in every other organization that
 * named the same project id — including a call from Alpha naming Beta's project.
 *
 * Real tables (drizzle definitions; project_sections and user_work_queue from
 * their migrations), on PGlite.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { organizations, projects, users } from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any }));
vi.mock('../../db.js', () => ({
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
}));

import { generateWorkRecommendations } from '../user-intelligence';

const ALPHA = 1;
const BETA = 2;
/** Works for both sponsors. */
const PRIYA = 11;
const BOB = 22;
const ALPHA_PROJECT = 101;
const BETA_PROJECT = 202;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

/** The CREATE TABLE statement for `table` exactly as its migration writes it. */
function migrationDdl(file: string, table: string): string {
  const sql = readFileSync(path.resolve(__dirname, '../../../db/migrations', file), 'utf8');
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- table is a literal table name at each call in this file
  const ddl = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
  if (!ddl) throw new Error(`the CREATE TABLE for ${table} is not in ${file}`);
  return ddl[0];
}

const exec = (sql: string, params: unknown[] = []) => holder.pg.query(sql, params);

async function queue(org: number) {
  return (await exec(
    `SELECT task_title, source, reference_id, project_id, ai_reasoning
       FROM user_work_queue WHERE user_id = $1 AND organization_id = $2 ORDER BY priority, id`,
    [PRIYA, org],
  )).rows as Array<{ task_title: string; source: string; reference_id: string | null; project_id: number; ai_reasoning: string }>;
}

beforeAll(async () => {
  holder.pg = new PGlite();
  for (const t of [organizations, users, projects]) await holder.pg.exec(ddlOf(t as PgTable));
  await holder.pg.exec(migrationDdl('20260220_ind_section_tracking.sql', 'project_sections'));
  await holder.pg.exec(migrationDdl('20260220_user_intelligence_platform.sql', 'user_work_queue'));

  await exec(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Alpha Bio', 'alpha'), ($2, 'Beta Pharma', 'beta')`,
    [ALPHA, BETA]);
  await exec(
    `INSERT INTO users (id, email, name, password_hash, preferences) VALUES
       ($1, 'priya@example.test', 'Priya Raman', 'x', '{}'::jsonb),
       ($2, 'bob@example.test', 'Bob Okafor', 'x', '{}'::jsonb)`,
    [PRIYA, BOB]);
  await exec(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, updated_at) VALUES
       ($1, $2, 1, 'Alpha Program', 'regulatory', 'active', NOW()),
       ($3, $4, 2, 'Beta Program', 'regulatory', 'active', NOW())`,
    [ALPHA_PROJECT, ALPHA, BETA_PROJECT, BETA]);

  // Alpha's sections, as the section tracker records them (module 'M1'…'M5').
  await exec(
    `INSERT INTO project_sections (organization_id, project_id, section_code, module, title, status, assigned_to, deadline) VALUES
       ($1, $2, 'm2.5',   'M2', 'Clinical Overview',    'drafting',        $3,   NOW() - interval '5 days'),
       ($1, $2, 'm3.2.P', 'M3', 'Drug Product',         'internal_review', NULL, NULL),
       ($1, $2, 'm5.3.5', 'M5', 'Efficacy Reports',     'not_started',     NULL, NULL),
       ($1, $2, 'm1.2',   'M1', 'Cover Letter',         'not_started',     $3,   NULL),
       ($1, $2, 'm4.2',   'M4', 'Study Reports',        'not_started',     $4,   NULL),
       ($1, $2, 'm2.4',   'M2', 'Nonclinical Overview', 'approved',        $3,   NULL)`,
    [ALPHA, ALPHA_PROJECT, PRIYA, BOB]);
  // Beta's own section: never Alpha's to read.
  await exec(
    `INSERT INTO project_sections (organization_id, project_id, section_code, module, title, status)
     VALUES ($1, $2, 'm2.7', 'M2', 'BX-990 Clinical Summary', 'not_started')`,
    [BETA, BETA_PROJECT]);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

beforeEach(async () => {
  await exec('DELETE FROM user_work_queue');
  // Priya's pending derived rows in Beta, one naming each project id. POST
  // /work-queue/add stores a body's projectId as given, so a row in one
  // organization can name another organization's project.
  await exec(
    `INSERT INTO user_work_queue (user_id, organization_id, project_id, task_type, task_title, source, status, priority) VALUES
       ($1, $2, $3, 'draft_section', 'Beta: finish 2.7 summary', 'deadline', 'pending', 1),
       ($1, $2, $4, 'draft_section', 'Beta: note on the Alpha program', 'sequence', 'pending', 2)`,
    [PRIYA, BETA, BETA_PROJECT, ALPHA_PROJECT]);
  // An old derived row in Alpha, cleared by the regeneration.
  await exec(
    `INSERT INTO user_work_queue (user_id, organization_id, project_id, task_type, task_title, source, status, priority)
     VALUES ($1, $2, $3, 'draft_section', 'Stale AI suggestion', 'ai', 'pending', 9)`,
    [PRIYA, ALPHA, ALPHA_PROJECT]);
});

describe('generateWorkRecommendations reads the recorded sections', () => {
  it("derives the queue from project_sections' real columns, in module then section-code order", async () => {
    await expect(
      generateWorkRecommendations({ userId: PRIYA, organizationId: ALPHA, projectId: ALPHA_PROJECT }),
      'the regeneration threw (a column project_sections does not have)',
    ).resolves.toBeUndefined();

    const rows = await queue(ALPHA);
    expect(rows.map((r) => [r.task_title, r.source, r.reference_id])).toEqual([
      ['OVERDUE: Complete Clinical Overview', 'deadline', 'm2.5'],
      ['Review: Drug Product', 'review_request', 'm3.2.P'],
      ['Draft: Cover Letter', 'sequence', 'm1.2'],
      ['Draft: Efficacy Reports', 'sequence', 'm5.3.5'],
    ]);
    // The assignee is read: Priya's own section says so, Bob's is not hers.
    expect(rows[2].ai_reasoning).toMatch(/^Not started and assigned to you;/);
    expect(rows[3].ai_reasoning).toMatch(/^Not started and unassigned;/);
    expect(rows.map((r) => r.task_title)).not.toContain('Draft: Study Reports');
    expect(rows.map((r) => r.task_title), 'the old derived row was not cleared').not.toContain('Stale AI suggestion');
  });
});

describe("a regeneration in Alpha leaves the user's queue in Beta alone", () => {
  it('for an Alpha project', async () => {
    await generateWorkRecommendations({ userId: PRIYA, organizationId: ALPHA, projectId: ALPHA_PROJECT });

    expect((await queue(BETA)).map((r) => r.task_title), "Alpha's regeneration deleted Priya's Beta rows").toEqual([
      'Beta: finish 2.7 summary',
      'Beta: note on the Alpha program',
    ]);
  });

  it("for Beta's project id named from Alpha: nothing of Beta's is read, queued or deleted", async () => {
    await generateWorkRecommendations({ userId: PRIYA, organizationId: ALPHA, projectId: BETA_PROJECT });

    expect((await queue(ALPHA)).map((r) => r.task_title)).toEqual(['Stale AI suggestion']);
    expect((await queue(BETA)).map((r) => r.task_title), "a call from Alpha deleted Beta's queue").toEqual([
      'Beta: finish 2.7 summary',
      'Beta: note on the Alpha program',
    ]);
  });
});
