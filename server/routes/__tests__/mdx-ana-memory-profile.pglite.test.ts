/**
 * What AnA remembers is read for the caller alone: their own relational
 * profile, and their own profile for the project the conversation is held in
 * (D2, fold ana-memory into the conversation, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * GET /api/mdx/ana/memory/profile is the read side of
 * server/services/ana-ri/relational-profile-service.ts, whose
 * loadRelationalOverlay reads two rows into every turn: the user-level profile
 * (project_id IS NULL) and the project-scoped one for the turn's admitted
 * project. The route read the first only. It now reads the second too, for
 * `?project_id=<program UUID or project id>`, after the conversation's own
 * admission (admitAnaProjectScope), so the panel shows what the turn reads and
 * nothing a turn would be refused.
 *
 * Which rows a binding admits is the database's to decide, so this runs on
 * PostgreSQL (PGlite), with the admission's real tables.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  sql: [] as string[],
}));
vi.mock('../../db', () => {
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      h.sql.push(sql);
      return h.pg.query(sql, params as unknown[]);
    },
  };
  return { pool, getPool: () => pool, db: {} };
});

import anaMemoryRouter from '../mdx-ana-memory';
import { buildPrefixMap, NEVER_GATED } from '../../services/entitlements/api-prefix-map';
import { launchScopeApiVerdict } from '../../services/entitlements/launch-scope-api';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const SHUT = '11111111-2222-4333-8444-000000000013';
const FOREIGN = '11111111-2222-4333-8444-000000000021';

function app(user: Record<string, unknown> | null = { id: 7, organizationId: 7 }) {
  const a = express();
  a.use(express.json());
  if (user) a.use((req, _res, next) => { Object.assign(req, { user }); next(); });
  a.use('/api/mdx', anaMemoryRouter);
  return a;
}
const profileReads = () => h.sql.filter((s) => s.includes('ana_relational_profiles'));

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    CREATE TABLE ana_relational_profiles (
      id serial PRIMARY KEY, organization_id integer NOT NULL, user_id integer NOT NULL, project_id integer,
      profile_summary text, tone_calibration jsonb NOT NULL DEFAULT '{}'::jsonb,
      emotional_signals jsonb NOT NULL DEFAULT '[]'::jsonb, acknowledged_mistakes jsonb NOT NULL DEFAULT '[]'::jsonb,
      interaction_count integer NOT NULL DEFAULT 0, last_interaction_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});
beforeEach(async () => {
  await h.pg.exec(`
    TRUNCATE regulatory_programs, projects, organization_users, users, organizations, project_visibility_settings,
      project_members, concept2cure_review_assignments, concept2cure_artifacts, ana_relational_profiles RESTART IDENTITY;
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users VALUES (5,'active'),(6,'active'),(7,'active'),(8,'active');
    INSERT INTO organization_users (organization_id,user_id,role) VALUES (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(8,7,'member');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL),('${SHUT}',7,NULL),('${FOREIGN}',8,NULL);
    INSERT INTO projects VALUES
      (11,7,71,'${PROGRAM}',6,5,'{"projectSharing":{"visibility":"private","members":[{"userId":7,"role":"use","status":"active"},{"userId":8,"role":"use","status":"active"}]}}'),
      (13,7,71,'${SHUT}',6,5,'{"projectSharing":{"visibility":"private","members":[]}}'),
      (21,8,81,'${FOREIGN}',6,5,'{"projectSharing":{"visibility":"org_public","members":[]}}');
    INSERT INTO project_members VALUES (11,7,7,'use','active'),(11,7,8,'use','active');
  `);
  await h.pg.query(
    `INSERT INTO ana_relational_profiles
       (organization_id, user_id, project_id, profile_summary, tone_calibration, acknowledged_mistakes, interaction_count)
     VALUES
       (7, 7, NULL, 'Mine, anywhere', '{"detail":"concise"}', '[{"at":"2026-10-01T00:00:00Z","mistake":"Mine wrong","correction":"Mine right"}]', 12),
       (7, 8, NULL, 'A colleague, anywhere', '{}', '[{"at":"2026-10-01T00:00:00Z","mistake":"Colleague wrong","correction":"Colleague right"}]', 3),
       (8, 7, NULL, 'Mine, in another organization', '{}', '[]', 2),
       (7, 7, 11, 'Mine, for project 11', '{}', '[{"at":"2026-10-02T00:00:00Z","mistake":"Project wrong","correction":"Project right"}]', 4),
       (7, 8, 11, 'A colleague, for project 11', '{}', '[]', 1),
       (7, 7, 13, 'Mine, for a project I can no longer open', '{}', '[]', 1),
       (8, 7, 21, 'Mine, for another organization''s project', '{}', '[]', 1)`,
  );
  h.sql = [];
});
afterAll(async () => { await h.pg?.close(); });

describe('GET /api/mdx/ana/memory/profile — the caller’s own notes, anywhere', () => {
  it('reads the caller’s user-level profile in the session’s organization, and nobody else’s', async () => {
    const res = await request(app()).get('/api/mdx/ana/memory/profile');
    expect(res.status).toBe(200);
    expect(res.body.data.profile_summary).toBe('Mine, anywhere');
    expect(res.body.data.acknowledged_mistakes).toEqual([{ at: '2026-10-01T00:00:00Z', mistake: 'Mine wrong', correction: 'Mine right' }]);
    expect(res.body.data.interaction_count).toBe(12);
    expect(res.body.meta).toEqual({ scope: 'user' });
    expect(JSON.stringify(res.body)).not.toMatch(/colleague|another organization|project 11/i);
  });

  it('names no user from the request: a user id in the query is not read', async () => {
    const res = await request(app()).get('/api/mdx/ana/memory/profile?user_id=8&userId=8');
    expect(res.status).toBe(200);
    expect(res.body.data.profile_summary).toBe('Mine, anywhere');
  });

  it('answers null, not a stand-in, when AnA has formed no notes for the caller', async () => {
    const res = await request(app({ id: 6, organizationId: 7 })).get('/api/mdx/ana/memory/profile');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta).toEqual({ scope: 'user' });
  });

  it('says the store is absent when it is, rather than answering an empty profile', async () => {
    await h.pg.exec('ALTER TABLE ana_relational_profiles RENAME TO ana_relational_profiles_away');
    try {
      const res = await request(app()).get('/api/mdx/ana/memory/profile');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
      expect(res.body.meta).toEqual({ scope: 'user', pendingStore: true });
    } finally {
      await h.pg.exec('ALTER TABLE ana_relational_profiles_away RENAME TO ana_relational_profiles');
    }
  });

  it('refuses without an organization or a user, and reads nothing', async () => {
    expect((await request(app({ id: 7 })).get('/api/mdx/ana/memory/profile')).status).toBe(403);
    expect((await request(app({ organizationId: 7 })).get('/api/mdx/ana/memory/profile')).status).toBe(401);
    expect((await request(app(null)).get('/api/mdx/ana/memory/profile?project_id=11')).status).toBe(403);
    expect(profileReads()).toEqual([]);
  });
});

describe('GET /api/mdx/ana/memory/profile?project_id= — the caller’s own notes for the conversation’s project', () => {
  it.each([PROGRAM, PROGRAM.toUpperCase(), '11'])('reads the caller’s profile for the admitted project through %s', async (ref) => {
    const res = await request(app()).get(`/api/mdx/ana/memory/profile?project_id=${encodeURIComponent(ref)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile_summary).toBe('Mine, for project 11');
    expect(res.body.data.acknowledged_mistakes).toEqual([{ at: '2026-10-02T00:00:00Z', mistake: 'Project wrong', correction: 'Project right' }]);
    expect(res.body.meta).toEqual({ scope: 'project', projectId: 11, projectRef: PROGRAM });
    expect(JSON.stringify(res.body)).not.toMatch(/colleague|anywhere/i);
  });

  it('answers null for a project AnA has kept no notes on for the caller, though a colleague’s exist', async () => {
    await h.pg.query('DELETE FROM ana_relational_profiles WHERE user_id = 7 AND project_id = 11');
    const res = await request(app()).get(`/api/mdx/ana/memory/profile?project_id=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta).toEqual({ scope: 'project', projectId: 11, projectRef: PROGRAM });
  });

  it('refuses a project the caller can no longer open, and does not read their notes for it', async () => {
    const res = await request(app()).get(`/api/mdx/ana/memory/profile?project_id=${SHUT}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    expect(JSON.stringify(res.body)).not.toContain('no longer open');
    expect(profileReads()).toEqual([]);
  });

  it.each([FOREIGN, '21', '999'])('refuses another organization’s or an absent project %s, reading nothing', async (ref) => {
    const res = await request(app()).get(`/api/mdx/ana/memory/profile?project_id=${ref}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ANA_PROJECT_NOT_FOUND');
    expect(profileReads()).toEqual([]);
  });

  it('refuses a malformed project reference rather than reading the caller’s notes anywhere', async () => {
    const res = await request(app()).get('/api/mdx/ana/memory/profile?project_id=not-a-project');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ANA_PROJECT_SCOPE_INVALID');
    expect(profileReads()).toEqual([]);
  });

  it('a project access check that could not run is a 503, never an empty profile', async () => {
    await h.pg.exec('ALTER TABLE organization_users RENAME TO organization_users_away');
    try {
      const res = await request(app()).get(`/api/mdx/ana/memory/profile?project_id=${PROGRAM}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('ANA_PROJECT_ACCESS_UNAVAILABLE');
      expect(res.body.data).toBeUndefined();
      expect(profileReads()).toEqual([]);
    } finally {
      await h.pg.exec('ALTER TABLE organization_users_away RENAME TO organization_users');
    }
  });

  it('says the store is absent for the project read too', async () => {
    await h.pg.exec('ALTER TABLE ana_relational_profiles RENAME TO ana_relational_profiles_away');
    try {
      const res = await request(app()).get(`/api/mdx/ana/memory/profile?project_id=${PROGRAM}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
      expect(res.body.meta).toEqual({ scope: 'project', projectId: 11, projectRef: PROGRAM, pendingStore: true });
    } finally {
      await h.pg.exec('ALTER TABLE ana_relational_profiles_away RENAME TO ana_relational_profiles');
    }
  });
});

describe('launch scope serves the profile read, and nothing else of the retired screen', () => {
  /* The conversation is a launch surface, and claims this one read; production
     refuses an out-of-scope path, so without the claim the panel's read would
     be refused (ci:launch-scope-api). The atom list, verify and supersede are
     the retired screen's alone and stay refused. */
  it.each(['/api/mdx/ana/memory/profile', `/api/mdx/ana/memory/profile?project_id=${PROGRAM}`])('%s is served', (path) => {
    expect(launchScopeApiVerdict(path, buildPrefixMap(), NEVER_GATED)).toBe('launch');
  });
  it.each(['/api/mdx/ana/memory', '/api/mdx/ana/memory/7/verify', '/api/mdx/ana/memory/7/supersede', '/api/mdx/ana/threads'])('%s is not', (path) => {
    expect(launchScopeApiVerdict(path, buildPrefixMap(), NEVER_GATED)).not.toBe('launch');
  });
});
