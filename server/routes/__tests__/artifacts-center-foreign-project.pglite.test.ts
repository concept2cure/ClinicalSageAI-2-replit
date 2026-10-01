/**
 * The Artifacts Center never shows another organization's project (PF-03).
 *
 * GET /api/artifacts-center lists the caller's artifacts with their project's
 * code. Its join was `projects p ON p.id = a.project_id`, so an artifact
 * written under another organization's project id (a writer that took the
 * number as given) showed that organization's project code and name. Which
 * row a join admits is the database's to decide, so this runs the real route
 * on real SQL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));
vi.mock('../../db.js', () => ({
  pool: { query: async (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]) },
}));

import createArtifactsCenterRoutes from '../artifacts-center-routes';

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, title text, metadata json, type text, category text,
      version integer, updated_at timestamp DEFAULT now(), project_id integer, content text, organization_id integer
    );
    CREATE TABLE concept2cure_signatures (id serial PRIMARY KEY, artifact_id integer, organization_id integer, status text, artifact_version_id integer);
    CREATE TABLE concept2cure_review_decisions (artifact_id integer, organization_id integer, decision text, version_reviewed integer);
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, version integer);
    INSERT INTO projects VALUES (10, 1, 'OWN-1', 'Own project'), (20, 2, 'THEIRS-9', 'Their secret program');
    INSERT INTO concept2cure_artifacts (artifact_id, title, metadata, type, category, version, project_id, content, organization_id) VALUES
      ('a-own', 'Own doc', '{}', 'document', 'document', 1, 10, 'x', 1),
      ('a-foreign', 'Filed under their id', '{}', 'document', 'document', 1, 20, 'x', 1);
  `);
});
afterAll(async () => {
  await h.pg.close();
});

function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as unknown as { tenantId: number }).tenantId = 1;
    next();
  });
  a.use('/api/artifacts-center', createArtifactsCenterRoutes());
  return a;
}

describe('GET /api/artifacts-center — the project shown is the artifact’s own organization’s', () => {
  it('an own project shows its code', async () => {
    const res = await request(app()).get('/api/artifacts-center');
    expect(res.status).toBe(200);
    const own = (res.body.data as Array<{ id: string; prog: string }>).find((r) => r.id === 'a-own');
    expect(own?.prog).toBe('OWN-1');
  });

  it("an artifact under another organization's project id never shows that project's code or name", async () => {
    const res = await request(app()).get('/api/artifacts-center');
    const foreign = (res.body.data as Array<{ id: string; prog: string }>).find((r) => r.id === 'a-foreign');
    expect(foreign?.prog).toBe('proj_20');
    expect(JSON.stringify(res.body)).not.toMatch(/THEIRS-9|Their secret program/);
  });
});
