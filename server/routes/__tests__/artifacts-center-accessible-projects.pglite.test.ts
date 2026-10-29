/**
 * The Vault's organization view of governed artifacts lists only the projects
 * the caller can open (D2, fold F3 slice C, 2026-10-29).
 *
 * GET /api/artifacts-center was the Artifacts center's gallery: every artifact
 * of the organization, to any member, archived rows included. The gallery
 * retires into the Vault, which reaches this read for its organization view.
 * The project Vault admits a project through the sharing policy
 * (installProjectRouteAccess → requireCurrentProgramAccess →
 * canAccessReportProject), so the organization view lists the projects the
 * same policy admits (getAccessibleReportProjectIds) and nothing else, and
 * leaves archived rows out as the project Vault does.
 *
 * Which rows a bound id list admits is the database's to decide, so the read
 * runs on PostgreSQL. The access policy itself is the report-os module's
 * (tested there); here it is a stub that names which projects are open, so the
 * cases can say exactly what must and must not be listed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  sql: [] as string[],
  accessible: [] as number[],
  actorError: null as Error | null,
  listError: null as Error | null,
  actorCalls: [] as unknown[],
  listCalls: [] as unknown[],
}));
vi.mock('../../db.js', () => ({
  pool: {
    query: async (sql: string, params?: unknown[]) => {
      h.sql.push(sql);
      return h.pg.query(sql, params as unknown[]);
    },
  },
}));
vi.mock('../../services/c2c/current-program-access.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/c2c/current-program-access')>();
  return {
    ...real,
    readCurrentProgramActor: async (_q: unknown, input: unknown) => {
      h.actorCalls.push(input);
      if (h.actorError) throw h.actorError;
      return { userId: 7, role: 'author' };
    },
  };
});
vi.mock('../../services/report-os/project-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async (org: number, actor: unknown) => {
    h.listCalls.push({ org, actor });
    if (h.listError) throw h.listError;
    return h.accessible;
  },
}));

import createArtifactsCenterRoutes from '../artifacts-center-routes';
import { ProgramReadAccessError } from '../../services/c2c/current-program-access';

const P_OPEN = '11111111-1111-4111-8111-111111111111';
const P_SHUT = '22222222-2222-4222-8222-222222222222';
const P_THEIRS = '33333333-3333-4333-8333-333333333333';

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text);
    CREATE FUNCTION public.actor_name(integer) RETURNS TABLE(name text, email text)
      LANGUAGE sql STABLE AS 'SELECT name, email FROM users WHERE id = $1';
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text, regulatory_program_id uuid);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, title text, metadata json, type text, category text,
      version integer, updated_at timestamp DEFAULT now(), project_id integer, content text, organization_id integer,
      ctd_section text, status text DEFAULT 'draft', content_hash text, created_by_id integer
    );
    CREATE TABLE concept2cure_signatures (id serial PRIMARY KEY, artifact_id integer, organization_id integer, status text, artifact_version_id integer);
    CREATE TABLE concept2cure_review_decisions (artifact_id integer, organization_id integer, decision text, version_reviewed integer);
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, version integer);
    INSERT INTO users VALUES (7, 'R. Writer', 'r@x');
    INSERT INTO projects VALUES
      (10, 1, 'OPEN-1', 'A project the caller can open', '${P_OPEN}'),
      (11, 1, 'SHUT-1', 'A project the caller cannot open', '${P_SHUT}'),
      (12, 1, 'LEGACY-1', 'An open project with no program record', NULL),
      (20, 2, 'THEIRS-9', 'Their secret program', '${P_THEIRS}');
    INSERT INTO concept2cure_artifacts (artifact_id, title, metadata, type, category, version, project_id, content, organization_id, status, updated_at, created_by_id) VALUES
      ('a-open',     'Clinical overview',         '{}', 'document', 'document', 2, 10, 'x', 1, 'review',   now() - interval '1 hour', 7),
      ('a-legacy',   'Legacy memo',               '{}', 'document', 'document', 1, 12, 'x', 1, 'draft',    now() - interval '2 hours', 7),
      ('a-shut',     'Private memo',              '{}', 'document', 'document', 1, 11, 'x', 1, 'draft',    now(), 7),
      ('a-archived', 'Withdrawn cover letter',    '{}', 'document', 'document', 1, 10, 'x', 1, 'archived', now(), 7),
      ('a-foreign',  'Filed under their id',      '{}', 'document', 'document', 1, 20, 'x', 1, 'draft',    now(), 7),
      ('a-theirs',   'Their own artifact',        '{}', 'document', 'document', 1, 20, 'x', 2, 'draft',    now(), 7);
  `);
});
afterAll(async () => {
  await h.pg.close();
});
beforeEach(() => {
  h.sql = [];
  h.accessible = [10, 12];
  h.actorError = null;
  h.listError = null;
  h.actorCalls = [];
  h.listCalls = [];
});

function app(user: number | null = 7) {
  const a = express();
  a.use((req, _res, next) => {
    (req as unknown as { tenantId: number }).tenantId = 1;
    if (user !== null) (req as unknown as { user: { id: number } }).user = { id: user };
    next();
  });
  a.use('/api/artifacts-center', createArtifactsCenterRoutes());
  return a;
}

type Row = { id: string; prog: string; status: string; author: string | null };
const ids = (body: { data: Row[] }) => body.data.map((r) => r.id).sort();
const registryReads = () => h.sql.filter((s) => s.includes('FROM concept2cure_artifacts a'));

describe('GET /api/artifacts-center — the projects the caller can open, and only those', () => {
  it('lists every non-archived artifact of each open project, the legacy project with no program record included', async () => {
    const res = await request(app()).get('/api/artifacts-center');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['a-legacy', 'a-open']);
    expect(res.body.meta).toMatchObject({ scope: 'accessible-projects', total: 2, listed: 2, truncated: false });
  });

  it('never lists a project the caller cannot open, an archived row, or a row under another organization’s project', async () => {
    const res = await request(app()).get('/api/artifacts-center');
    const text = JSON.stringify(res.body);
    for (const hidden of ['a-shut', 'Private memo', 'a-archived', 'a-foreign', 'a-theirs', 'THEIRS-9', 'Their secret program']) {
      expect(text).not.toContain(hidden);
    }
  });

  it('names each row’s project as its own organization records it, and its status in the Vault’s words', async () => {
    const res = await request(app()).get('/api/artifacts-center');
    const byId = new Map((res.body.data as Row[]).map((r) => [r.id, r]));
    expect(byId.get('a-open')).toMatchObject({ prog: 'OPEN-1', status: 'review', author: 'R. Writer' });
    expect(byId.get('a-legacy')).toMatchObject({ prog: 'LEGACY-1', status: 'draft' });
  });

  it('asks the sharing policy about this caller in this organization', async () => {
    await request(app()).get('/api/artifacts-center');
    expect(h.actorCalls).toEqual([{ organizationId: 1, userId: 7 }]);
    expect(h.listCalls).toEqual([{ org: 1, actor: { userId: 7, role: 'author' } }]);
  });

  it('with no project open to the caller, lists nothing and reads no registry row', async () => {
    h.accessible = [];
    const res = await request(app()).get('/api/artifacts-center');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ scope: 'accessible-projects', total: 0, truncated: false });
    expect(registryReads()).toEqual([]);
  });

  it('a caller who is not a current member is refused, never shown an empty listing', async () => {
    h.actorError = new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'The actor is not a current active member of this organization.');
    const res = await request(app()).get('/api/artifacts-center');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(res.body.data).toBeUndefined();
    expect(registryReads()).toEqual([]);
  });

  it('an access check that could not run is a 503, never an empty listing', async () => {
    h.listError = new Error('project_members unreadable');
    const res = await request(app()).get('/api/artifacts-center');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: 'PROJECT_ACCESS_UNAVAILABLE' });
    expect(res.body.data).toBeUndefined();
    expect(registryReads()).toEqual([]);
  });

  it('a full window says how many it did not list', async () => {
    await h.pg.exec(`INSERT INTO concept2cure_artifacts (artifact_id, title, metadata, type, category, version, project_id, content, organization_id, status)
      SELECT 'bulk-' || g, 'Bulk ' || g, '{}', 'document', 'document', 1, 10, 'x', 1, 'draft' FROM generate_series(1, 205) g`);
    try {
      const res = await request(app()).get('/api/artifacts-center');
      expect(res.body.data).toHaveLength(200);
      expect(res.body.meta).toMatchObject({ total: 207, listed: 200, truncated: true });
    } finally {
      await h.pg.exec(`DELETE FROM concept2cure_artifacts WHERE artifact_id LIKE 'bulk-%'`);
    }
  });
});
