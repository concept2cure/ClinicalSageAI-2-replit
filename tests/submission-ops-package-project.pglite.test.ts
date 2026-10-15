/**
 * POST /api/submission-ops/packages files a package only under a project of
 * the caller's organization (PF-03).
 *
 * The body's projectId was checked for being a number and inserted as given,
 * so a package, its sections and its readiness could sit on another
 * organization's project. The check is projectBelongsToTenant on the route's
 * pool; this runs the real router on real SQL, with the package tables lifted
 * from the migration that creates them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { extractTableDdl } from './golden-journeys/harness';

const pg = new PGlite();
const drizzleDb = drizzle(pg);
vi.mock('../server/db', () => ({
  get db() { return drizzleDb; },
  pool: {
    connect: async () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []), release: () => {} }),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []),
  },
}));
vi.mock('../server/routes/c2c/actions', () => ({ recordGovernedAction: vi.fn() }));
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));
vi.mock('../server/services/ectd/package-leaf-bytes', () => ({ packageLeafBytes: vi.fn() }));

import submissionOpsRouter from '../server/routes/submission-ops';

const ORG = 99;
const OTHER_ORG = 7;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: ORG, role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  a.use('/api/submission-ops', submissionOpsRouter);
  return a;
}

beforeAll(async () => {
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL);
    INSERT INTO organizations VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users VALUES (777);
    INSERT INTO projects VALUES (1, ${ORG}), (2, ${OTHER_ORG});
  `);
  await pg.exec(extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_submission_packages', 'c2c_package_sections']));
  // shared/schema.ts declares c2c_package_sections.updated_at and drizzle-kit
  // push lays it down (install-fresh.mjs, step 2); no migration file adds it.
  await pg.exec('ALTER TABLE c2c_package_sections ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();');
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec('DELETE FROM c2c_package_sections; DELETE FROM c2c_submission_packages;');
});

const body = (projectId: number) => ({
  projectId, packageFamily: 'ind', title: 'IND 0001', sections: [{ key: 'm1', label: 'Module 1' }],
});
const count = async (table: string) => (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

describe('POST /api/submission-ops/packages — the package’s project', () => {
  it('a project of the organization gets the package and its sections', async () => {
    const res = await request(app()).post('/api/submission-ops/packages').send(body(1));
    expect(res.status).toBe(201);
    expect(res.body.data.projectId).toBe(1);
    expect(await count('c2c_submission_packages')).toBe(1);
    expect(await count('c2c_package_sections')).toBe(1);
  });

  it.each([
    ["another organization's project", 2],
    ['a project that does not exist', 404],
  ])('%s is 404 — no package, no section', async (_label, projectId) => {
    const res = await request(app()).post('/api/submission-ops/packages').send(body(projectId));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    expect(await count('c2c_submission_packages')).toBe(0);
    expect(await count('c2c_package_sections')).toBe(0);
  });
});
