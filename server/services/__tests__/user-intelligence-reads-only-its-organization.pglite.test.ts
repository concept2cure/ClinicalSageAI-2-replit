/**
 * User intelligence reads the user's work in the organization it was loaded
 * for, and nothing from any other organization.
 *
 * What the code used to do (until 2026-10-15): loadWorkQueue and
 * loadRecentActivity resolved a project's name with an unscoped
 * `LEFT JOIN projects p ON p.id = …`. POST /work-queue/add stores whatever
 * projectId its body names, so a queue item (or an activity row) in one
 * organization that named another organization's project id came back with
 * that project's name — into AnA's "Recommended Next Actions" prompt and the
 * GET /user-intelligence response. The work-session reads selected the user's
 * sessions in every organization, so a consultant who works for two sponsors
 * had one sponsor's current work (its context title, reference and project id)
 * in the other's AnA context; and the session touch every AnA turn makes
 * closed or bumped whichever session was open, in either organization.
 *
 * Real tables (drizzle definitions; the two work tables from their migration),
 * on PGlite.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  activityFeed,
  concept2cureConversations,
  concept2cureMessages,
  moduleSubscriptions,
  organizationUsers,
  organizations,
  projects,
  users,
} from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any }));
vi.mock('../../db.js', () => ({
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
}));

import { loadUserIntelligence, touchWorkSession } from '../user-intelligence';

const ALPHA = 1;
const BETA = 2;
/** A consultant who works for both sponsors. */
const PRIYA = 11;
const BOB = 22;
const ALPHA_PROJECT = 101;
const BETA_PROJECT = 202;
const BETA_SECRET = 'Beta Confidential Program BX-990';
const BETA_SESSION_TITLE = 'BX-990 drug substance — 3.2.S.4 draft';

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

const exec = (sql: string, params: unknown[] = []) => holder.pg.query(sql, params);
const one = async (sql: string, params: unknown[] = []) => (await exec(sql, params)).rows[0] as any;

let betaActiveSession = 0;

beforeAll(async () => {
  holder.pg = new PGlite();
  for (const t of [organizations, users, organizationUsers, projects, moduleSubscriptions, activityFeed,
    concept2cureConversations, concept2cureMessages]) {
    await holder.pg.exec(ddlOf(t as PgTable));
  }
  const migration = readFileSync(
    path.resolve(__dirname, '../../../db/migrations/20260220_user_intelligence_platform.sql'), 'utf8');
  for (const table of ['user_work_sessions', 'user_work_queue']) {
    const ddl = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    if (!ddl) throw new Error(`the CREATE TABLE for ${table} is not in its migration`);
    await holder.pg.exec(ddl[0]);
  }

  await exec(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Alpha Bio', 'alpha'), ($2, 'Beta Pharma', 'beta')`,
    [ALPHA, BETA]);
  await exec(
    `INSERT INTO users (id, email, name, password_hash, preferences) VALUES
       ($1, 'priya@example.test', 'Priya Raman', 'x', '{}'::jsonb),
       ($2, 'bob@beta.test', 'Bob Beta', 'x', '{}'::jsonb)`,
    [PRIYA, BOB]);
  await exec(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $3, 'admin'), ($2, $3, 'viewer'), ($2, $4, 'admin')`,
    [ALPHA, BETA, PRIYA, BOB]);
  await exec(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, owner_id, metadata, updated_at) VALUES
       ($1, $2, 1, 'Alpha Program', 'regulatory', 'active', $5, '{}', NOW()),
       ($3, $4, 2, $6, 'regulatory', 'active', $7, '{}', NOW())`,
    [ALPHA_PROJECT, ALPHA, BETA_PROJECT, BETA, PRIYA, BETA_SECRET, BOB]);

  // In Alpha, Priya queued a task naming Beta's project id: POST /work-queue/add
  // stores the body's projectId as given.
  await exec(
    `INSERT INTO user_work_queue (user_id, organization_id, project_id, task_type, task_title, source, priority) VALUES
       ($1, $2, $3, 'manual', 'Follow up on the stability pull', 'manual', 1),
       ($1, $2, $4, 'manual', 'Draft 3.2.S.4', 'manual', 2)`,
    [PRIYA, ALPHA, BETA_PROJECT, ALPHA_PROJECT]);
  await exec(
    `INSERT INTO activity_feed (activity_id, organization_id, user_id, user_name, activity_type, action,
                                entity_type, entity_id, entity_name, created_at) VALUES
       ('act-foreign', $1, $2, 'Priya Raman', 'project_viewed', 'viewed', 'project', $3, NULL, NOW() - interval '1 hour'),
       ('act-own', $1, $2, 'Priya Raman', 'project_viewed', 'viewed', 'project', $4, NULL, NOW() - interval '2 hours')`,
    [ALPHA, PRIYA, String(BETA_PROJECT), String(ALPHA_PROJECT)]);

  // Priya's own sessions: the one open right now is her Beta work.
  betaActiveSession = (await one(
    `INSERT INTO user_work_sessions (user_id, organization_id, project_id, session_type, context_type,
                                     context_reference, context_title, last_activity_at)
     VALUES ($1, $2, $3, 'active', 'section_drafting', '3.2.S.4', $4, NOW()) RETURNING id`,
    [PRIYA, BETA, BETA_PROJECT, BETA_SESSION_TITLE])).id;
  await exec(
    `INSERT INTO user_work_sessions (user_id, organization_id, project_id, session_type, context_type,
                                     context_title, last_activity_at) VALUES
       ($1, $2, $3, 'completed', 'section_drafting', 'BX-990 impurity profile', NOW() - interval '1 day'),
       ($1, $4, $5, 'completed', 'section_drafting', 'Alpha 3.2.P.5 specifications', NOW() - interval '2 days')`,
    [PRIYA, BETA, BETA_PROJECT, ALPHA, ALPHA_PROJECT]);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

describe("user intelligence for Priya in Alpha reads nothing of Beta's", () => {
  it("a queue item naming another organization's project id does not resolve that project's name", async () => {
    const intel = (await loadUserIntelligence({ userId: PRIYA, organizationId: ALPHA }))!;
    const foreign = intel.workQueue!.find((q) => q.taskTitle === 'Follow up on the stability pull')!;
    const own = intel.workQueue!.find((q) => q.taskTitle === 'Draft 3.2.S.4')!;

    expect(foreign.projectName, "Beta's project name was read into Alpha's work queue").toBeNull();
    expect(own.projectName).toBe('Alpha Program');
  }, 60_000);

  it("an activity row naming another organization's project id does not resolve that project's name", async () => {
    const intel = (await loadUserIntelligence({ userId: PRIYA, organizationId: ALPHA }))!;
    // Newest first: the row naming Beta's project id was recorded an hour ago, Alpha's two.
    const [foreign, own] = intel.recentActivity!;

    expect(intel.recentActivity).toHaveLength(2);
    expect(foreign.projectName, "Beta's project name was read into Alpha's activity").toBeNull();
    expect(own.projectName).toBe('Alpha Program');
  }, 60_000);

  it("the user's work sessions in another organization are not this organization's current or recent work", async () => {
    const intel = (await loadUserIntelligence({ userId: PRIYA, organizationId: ALPHA }))!;

    expect(intel.currentSession, "Priya's open Beta session was Alpha's current work").toBeNull();
    expect(intel.recentSessions!.map((s) => s.contextTitle)).toEqual(['Alpha 3.2.P.5 specifications']);
    expect(intel.unread).toEqual([]);
  }, 60_000);

  it("nothing anywhere in Alpha's intelligence names Beta's project or work", async () => {
    const intel = (await loadUserIntelligence({ userId: PRIYA, organizationId: ALPHA }))!;
    const everything = JSON.stringify(intel);

    expect(everything).not.toContain(BETA_SECRET);
    expect(everything).not.toContain('BX-990');
    expect(intel.projects!.map((p) => p.name)).toEqual(['Alpha Program']);
  }, 60_000);
});

describe("an AnA turn in Alpha leaves the user's Beta session alone", () => {
  it('opens an Alpha session and neither closes nor bumps the Beta one', async () => {
    const sessionId = await touchWorkSession({ userId: PRIYA, organizationId: ALPHA, contextType: 'general' });

    const beta = await one(
      `SELECT session_type, messages_sent, ended_at FROM user_work_sessions WHERE id = $1`, [betaActiveSession]);
    expect(beta, 'an AnA turn in Alpha closed or bumped the Beta session').toMatchObject({
      session_type: 'active',
      messages_sent: 0,
      ended_at: null,
    });
    const opened = await one(`SELECT organization_id, session_type FROM user_work_sessions WHERE id = $1`, [sessionId]);
    expect(opened).toEqual({ organization_id: ALPHA, session_type: 'active' });
  }, 60_000);
});
