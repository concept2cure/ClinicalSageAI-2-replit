/**
 * /api/projects holds to the projects the person can open (F1, 2026-11-13).
 *
 * GET /api/projects selected every `projects` row of the organisation, narrowed only by a client workspace id the
 * caller sends, and answered whole rows. The organisation comes from the verified session, so nothing crossed a
 * tenant. But inside one organisation a member who cannot open a project still read its name, description and
 * settings, and a CRO member working in one sponsor's workspace read the others' by leaving the header off. GET
 * /:projectId, PATCH /:projectId and DELETE /:projectId resolved a project the same way: by organisation alone.
 * The canonical list (GET /api/c2c/projects) admits each project by what the person can open; this list did not.
 *
 * The access policy here is the real one (readCurrentProgramActor, getAccessibleReportProjectIds,
 * canAccessReportProject) on PostgreSQL (PGlite), with no access stub; `projects` is the table the shared schema
 * declares. Two members of one organisation: the private project's owner, and a member who is on no project's team.
 *
 * Evidence: docs/evidence/F1/2026-11-13-projects-list-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  db: null as unknown,
  failWhen: null as RegExp | null,
}));
vi.mock('../../db', () => {
  const query = async (sql: string, params?: unknown[]) => {
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    const result = await h.pg.query(sql, (params ?? []) as unknown[]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, get db() { return h.db; } };
});
vi.mock('../../services/rules-engine', () => ({ emitRuleEvent: vi.fn(async () => undefined) }));

import { projects } from '../../../shared/schema';
import projectsRouter from '../projects-management';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const ORG = 1;
const OTHER_ORG = 2;
const MEMBER = 7; // a writing member of the organisation ('member'), on no project's team
const OWNER = 9; // the private project's owner: the positive control
const SPONSOR_A = 101; // client workspaces of the organisation (a CRO's two sponsors)
const SPONSOR_B = 102;
const OPEN = 10; // sponsor A, open to the organisation
const PRIVATE = 12; // sponsor B, private to its owner
const THEIRS = 50; // another organisation's project
const PROGRAM = '11111111-1111-4111-8111-111111111111';

type Session = { id: number; organizationId?: number; role?: string } | null;
function app(session: Session) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (session) {
      const organizationId = session.organizationId ?? ORG;
      const role = session.role ?? 'member';
      Object.assign(req, { user: { id: String(session.id), userId: String(session.id), organizationId: String(organizationId), role },
        userRole: role, organizationId });
    }
    next();
  });
  a.use('/api/projects', projectsRouter);
  return a;
}
const list = (userId: number, headers: Record<string, string> = {}, query = '') =>
  request(app({ id: userId })).get(`/api/projects${query}`).set(headers);
const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id).sort((a, b) => a - b);
const stored = async (id: number) =>
  (await h.pg.query<{ name: string; status: string }>('SELECT name, status FROM projects WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  h.pg = new PGlite();
  h.db = drizzle(h.pg);
  // `projects` as the shared schema declares it: the handlers select through the Drizzle model.
  const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
  for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), kit.generateDrizzleJson({ projects }))) {
    try { await h.pg.exec(statement); } catch (error) { if (!/FOREIGN KEY|REFERENCES/.test(statement)) throw error; }
  }
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, organization_id integer, project_id integer);
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users (id, name, email) VALUES (${MEMBER}, 'Mina Member', 'mina@cro.test'), (${OWNER}, 'Omar Owner', 'omar@cro.test'), (20, 'Theo Theirs', 'theo@other.test');
    INSERT INTO organization_users VALUES (${ORG}, ${MEMBER}, 'member'), (${ORG}, ${OWNER}, 'member'), (${OTHER_ORG}, 20, 'admin');
  `);
});
afterAll(async () => { await h.pg.close(); });

beforeEach(async () => {
  h.failWhen = null;
  await h.pg.exec(`
    DELETE FROM project_members; DELETE FROM project_visibility_settings; DELETE FROM projects;
    INSERT INTO projects (id, organization_id, client_workspace_id, name, code, description, type, status, owner_id, created_by_id, regulatory_program_id, settings) VALUES
      (${OPEN}, ${ORG}, ${SPONSOR_A}, 'Sponsor A IND', 'A-101', 'Open to the organisation', 'ind', 'active', ${OWNER}, ${OWNER}, '${PROGRAM}', '{}'),
      (${PRIVATE}, ${ORG}, ${SPONSOR_B}, 'Sponsor B acquisition diligence', 'B-900', 'Not announced', 'nda', 'planning', ${OWNER}, ${OWNER}, NULL,
        '{"projectSharing":{"visibility":"private","members":[]}}'),
      (${THEIRS}, ${OTHER_ORG}, 900, 'Another organisation''s project', 'X-1', 'Theirs', 'ind', 'active', 20, 20, NULL, '{}');
    INSERT INTO project_visibility_settings VALUES (${ORG}, ${PRIVATE}, 'private');
    INSERT INTO project_members VALUES (${ORG}, ${PRIVATE}, ${OWNER}, 'owner', 'active');
  `);
});

describe('GET /api/projects lists the projects the person can open', () => {
  it('a member who is not on a private project does not receive it; its owner does', async () => {
    const member = await list(MEMBER).expect(200);
    expect(ids(member.body)).toEqual([OPEN]);
    expect(JSON.stringify(member.body)).not.toContain('Sponsor B acquisition diligence');
    expect(JSON.stringify(member.body)).not.toContain('Not announced');
    expect(ids((await list(OWNER).expect(200)).body)).toEqual([OPEN, PRIVATE]);
  });

  it('the client workspace a caller names only narrows the list; leaving it off, or naming another sponsor\'s, opens nothing more', async () => {
    expect(ids((await list(MEMBER, { 'x-client-workspace-id': String(SPONSOR_B) }).expect(200)).body)).toEqual([]);
    expect(ids((await list(MEMBER, {}, `?clientWorkspaceId=${SPONSOR_B}`).expect(200)).body)).toEqual([]);
    expect(ids((await list(MEMBER, { 'x-client-workspace-id': String(SPONSOR_A) }).expect(200)).body)).toEqual([OPEN]);
    expect(ids((await list(OWNER, { 'x-client-workspace-id': String(SPONSOR_B) }).expect(200)).body)).toEqual([PRIVATE]);
  });

  it('answers the fields its callers read, and no other column of the row', async () => {
    const [row] = (await list(MEMBER).expect(200)).body;
    /* TaskBoard.tsx reads id, name, code and regulatoryProgramId; CollabLauncher.tsx reads those and declares status.
       (CollabLauncher also reads `projectType`, which no row ever carried: the column is `type`. It stays absent.) */
    expect(row).toEqual({ id: OPEN, name: 'Sponsor A IND', code: 'A-101', status: 'active', regulatoryProgramId: PROGRAM });
  });

  it('never lists another organisation\'s project', async () => {
    expect(ids((await list(OWNER).expect(200)).body)).not.toContain(THEIRS);
  });

  it('a session with no user is refused, not answered with a list', async () => {
    const res = await request(app(null)).get('/api/projects');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('when what the person can open cannot be read, that is an error, never an empty list', async () => {
    h.failWhen = /project_members/;
    const res = await list(MEMBER);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'PROJECT_ACCESS_UNAVAILABLE' });
    expect(Array.isArray(res.body)).toBe(false);
  });
});

describe('GET, PATCH and DELETE /api/projects/:projectId admit the project the same way', () => {
  it('a project the member cannot open reads as missing; its owner reads it', async () => {
    const refused = await request(app({ id: MEMBER })).get(`/api/projects/${PRIVATE}`);
    expect(refused.status).toBe(404);
    expect(JSON.stringify(refused.body)).not.toContain('Sponsor B');
    expect((await request(app({ id: OWNER })).get(`/api/projects/${PRIVATE}`).expect(200)).body).toMatchObject({ id: PRIVATE, name: 'Sponsor B acquisition diligence' });
    expect((await request(app({ id: MEMBER })).get(`/api/projects/${OPEN}`).expect(200)).body).toMatchObject({ id: OPEN });
  });

  it('another organisation\'s project reads as missing, the same answer', async () => {
    expect((await request(app({ id: OWNER })).get(`/api/projects/${THEIRS}`)).status).toBe(404);
  });

  it('a member who cannot open the project cannot rename it: missing, and nothing is written', async () => {
    const res = await request(app({ id: MEMBER })).patch(`/api/projects/${PRIVATE}`).send({ name: 'Renamed by a stranger', status: 'archived' });
    expect(res.status).toBe(404);
    expect(await stored(PRIVATE)).toEqual({ name: 'Sponsor B acquisition diligence', status: 'planning' });
  });

  it('a member who can read an open project but is not on its team cannot change it; its owner can', async () => {
    const reader = await request(app({ id: MEMBER })).patch(`/api/projects/${OPEN}`).send({ name: 'Renamed by a reader' });
    expect(reader.status).toBe(403);
    expect((await stored(OPEN)).name).toBe('Sponsor A IND');
    const owner = await request(app({ id: OWNER })).patch(`/api/projects/${OPEN}`).send({ name: 'Sponsor A IND (amended)' });
    expect(owner.status, JSON.stringify(owner.body)).toBe(200);
    expect((await stored(OPEN)).name).toBe('Sponsor A IND (amended)');
  });

  it('a member who cannot open the project cannot delete it: missing, and the row remains', async () => {
    const res = await request(app({ id: MEMBER })).delete(`/api/projects/${PRIVATE}`);
    expect(res.status).toBe(404);
    expect(await stored(PRIVATE)).toBeTruthy();
  });

  it('a member who can read an open project but is not on its team cannot delete it', async () => {
    const res = await request(app({ id: MEMBER })).delete(`/api/projects/${OPEN}`);
    expect(res.status).toBe(403);
    expect(await stored(OPEN)).toBeTruthy();
  });
});
