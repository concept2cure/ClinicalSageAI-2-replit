/**
 * The section routes' tenant boundaries, against a REAL Postgres engine.
 *
 * The stubbed suite next door answers `where()` with the query chain, so it
 * never evaluates a predicate: dropping either the org or the package
 * constraint from `resolvePackageSection` left it entirely green. These cases
 * execute the real SQL over real cross-tenant rows — another org's section
 * addressed through this org's package id, a sibling package's section, and
 * both the numeric and `sec_...` id forms — and check the cascade guard
 * against a mapping row whose own org stamp disagrees with its section's.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const recordGovernedActionFn = vi.fn(async () => ({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' }));
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedActionFn(...(a as [])),
}));

const pg = new PGlite();
const drizzleDb = drizzle(pg);
vi.mock('../server/db', () => ({
  get db() { return drizzleDb; },
  pool: {
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []),
      release: () => {},
    }),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []),
  },
}));

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

function makeApp(orgId = ORG) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    /* A role: every write on this router is role-gated. This harness attached
       none and still passed. */
    (req as any).user = { id: 777, organizationId: orgId, role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  app.use('/api/submission-ops', submissionOpsRouter);
  return app;
}

const DDL = `
CREATE TABLE c2c_submission_packages (
  id SERIAL PRIMARY KEY, package_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'locked', package_family TEXT,
  metadata JSON, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE c2c_package_sections (
  id SERIAL PRIMARY KEY, section_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  package_db_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, section_label TEXT NOT NULL, parent_section_id INTEGER,
  sort_order INTEGER DEFAULT 0,
  metadata JSON, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY, artifact_id TEXT NOT NULL UNIQUE, project_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, ctd_section TEXT
);
CREATE TABLE c2c_artifact_section_map (
  id SERIAL PRIMARY KEY, org_id INTEGER NOT NULL,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  section_db_id INTEGER NOT NULL REFERENCES c2c_package_sections(id) ON DELETE CASCADE,
  document_family TEXT, owner_user_id INTEGER, owner_role TEXT, owner_function TEXT,
  ownership_type TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE c2c_milestones (id SERIAL PRIMARY KEY, org_id INTEGER NOT NULL);
CREATE TABLE c2c_milestone_sections (
  id SERIAL PRIMARY KEY,
  milestone_db_id INTEGER NOT NULL REFERENCES c2c_milestones(id) ON DELETE CASCADE,
  section_db_id INTEGER NOT NULL REFERENCES c2c_package_sections(id) ON DELETE CASCADE
);
CREATE TABLE c2c_readiness_snapshots (
  id SERIAL PRIMARY KEY,
  section_db_id INTEGER REFERENCES c2c_package_sections(id) ON DELETE CASCADE
);
CREATE TABLE c2c_blockers (
  id SERIAL PRIMARY KEY,
  section_db_id INTEGER REFERENCES c2c_package_sections(id) ON DELETE SET NULL
);
`;

const REASON = { reason: 'The section key was mistyped at package creation' };

beforeEach(async () => {
  await pg.exec(`DROP TABLE IF EXISTS c2c_blockers, c2c_readiness_snapshots, c2c_milestone_sections,
    c2c_milestones, c2c_artifact_section_map, concept2cure_artifacts, c2c_package_sections,
    c2c_submission_packages CASCADE;`);
  await pg.exec(DDL);
  await pg.exec(`
    INSERT INTO c2c_submission_packages (id, package_id, org_id, project_id, metadata) VALUES
      (1, 'pkg_ours',    ${ORG},       3, '{"bundle":{"sha256":"aaa"},"preflight":{"errorCount":0}}'::json),
      (2, 'pkg_sibling', ${ORG},       3, '{}'::json),
      (3, 'pkg_theirs',  ${OTHER_ORG}, 3, '{"bundle":{"sha256":"bbb"}}'::json);
    INSERT INTO c2c_package_sections (id, section_id, org_id, package_db_id, section_key, section_label, sort_order) VALUES
      (10, 'sec_ours',    ${ORG},       1, '2.5', 'Clinical Overview', 0),
      (20, 'sec_sibling', ${ORG},       2, '2.5', 'Clinical Overview', 0),
      (30, 'sec_theirs',  ${OTHER_ORG}, 3, '2.5', 'Clinical Overview', 0);
    INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, title, content)
      VALUES (5, 'artifact_a', 3, ${ORG}, 'A', 'text');
  `);
  recordGovernedActionFn.mockClear();
});

afterAll(async () => { await pg.close(); });

const sectionRow = async (id: number) =>
  (await pg.query<any>('SELECT section_key, section_label, sort_order FROM c2c_package_sections WHERE id = $1', [id])).rows[0];
const sectionCount = async () =>
  Number((await pg.query<any>('SELECT count(*)::int AS n FROM c2c_package_sections')).rows[0].n);
const metadataOf = async (id: number) =>
  (await pg.query<any>('SELECT metadata FROM c2c_submission_packages WHERE id = $1', [id])).rows[0].metadata as Record<string, unknown>;

describe('section routes — tenant boundaries on a real engine', () => {
  it('PATCH reaches only a section of the caller’s own package, by numeric id and by sec_ id alike', async () => {
    const ok = await request(makeApp()).patch('/api/submission-ops/packages/1/sections/10').send({ sectionKey: '3.2.P.1', ...REASON });
    expect(ok.status).toBe(200);
    expect((await sectionRow(10)).section_key).toBe('3.2.P.1');
    // The bundle and its preflight summary went with the change.
    const md = await metadataOf(1);
    expect(md.bundle).toBeUndefined();
    expect(md.preflight).toBeUndefined();
    expect(md.contentRevision).toBe(1);

    const byText = await request(makeApp()).patch('/api/submission-ops/packages/pkg_ours/sections/sec_ours').send({ sectionLabel: 'Renamed', ...REASON });
    expect(byText.status).toBe(200);
    expect((await sectionRow(10)).section_label).toBe('Renamed');
  });

  it('REFUSES another org’s section — through their package id, and through OUR package id', async () => {
    const throughTheirs = await request(makeApp()).patch('/api/submission-ops/packages/3/sections/30').send({ sectionKey: 'x', ...REASON });
    expect(throughTheirs.status).toBe(404);
    expect(throughTheirs.body.error).toBe('Package not found');

    const throughOurs = await request(makeApp()).patch('/api/submission-ops/packages/1/sections/30').send({ sectionKey: 'x', ...REASON });
    expect(throughOurs.status).toBe(404);
    expect(throughOurs.body.error).toBe('Section not found');

    expect((await sectionRow(30)).section_key).toBe('2.5');
    expect((await metadataOf(3)).bundle).toBeDefined(); // their bundle untouched
  });

  it('REFUSES a section of a SIBLING package of the same org', async () => {
    const res = await request(makeApp()).patch('/api/submission-ops/packages/1/sections/20').send({ sectionKey: 'x', ...REASON });
    expect(res.status).toBe(404);
    expect((await sectionRow(20)).section_key).toBe('2.5');
  });

  it('DELETE is bounded the same way, and refuses a section a mapping still points at — whatever org the MAPPING row carries', async () => {
    // A mapping row stamped with another org, on our section: the shape the
    // ungoverned insert could write. It must still block the delete.
    await pg.exec(`INSERT INTO c2c_artifact_section_map (org_id, artifact_id, section_db_id) VALUES (${OTHER_ORG}, 5, 10);`);
    const blocked = await request(makeApp()).delete('/api/submission-ops/packages/1/sections/10').send(REASON);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'SECTION_NOT_EMPTY', mappedCount: 1 });
    expect(await sectionCount()).toBe(3);

    await pg.exec('DELETE FROM c2c_artifact_section_map;');
    const theirs = await request(makeApp()).delete('/api/submission-ops/packages/1/sections/30').send(REASON);
    expect(theirs.status).toBe(404);

    const ok = await request(makeApp()).delete('/api/submission-ops/packages/1/sections/10').send(REASON);
    expect(ok.status).toBe(200);
    expect(await sectionCount()).toBe(2);
  });

  it('REFUSES a section a milestone still gates, and names the collateral when it does remove one', async () => {
    await pg.exec(`
      INSERT INTO c2c_milestones (id, org_id) VALUES (1, ${ORG});
      INSERT INTO c2c_milestone_sections (milestone_db_id, section_db_id) VALUES (1, 10);
    `);
    const blocked = await request(makeApp()).delete('/api/submission-ops/packages/1/sections/10').send(REASON);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ milestoneLinks: 1 });
    expect(Number((await pg.query<any>('SELECT count(*)::int AS n FROM c2c_milestone_sections')).rows[0].n)).toBe(1);

    await pg.exec(`DELETE FROM c2c_milestone_sections;
      INSERT INTO c2c_readiness_snapshots (section_db_id) VALUES (10), (10);
      INSERT INTO c2c_blockers (section_db_id) VALUES (10);`);
    const ok = await request(makeApp()).delete('/api/submission-ops/packages/1/sections/10').send(REASON);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ readinessSnapshotsRemoved: 2, blockersUnlinked: 1 });
    // The soft collateral behaved as the audit row says: rows gone, blocker unlinked.
    expect(Number((await pg.query<any>('SELECT count(*)::int AS n FROM c2c_readiness_snapshots')).rows[0].n)).toBe(0);
    expect((await pg.query<any>('SELECT section_db_id FROM c2c_blockers')).rows[0].section_db_id).toBeNull();
  });

  it('POST adds only to the caller’s own package', async () => {
    const theirs = await request(makeApp()).post('/api/submission-ops/packages/3/sections').send({ sectionKey: 'x', sectionLabel: 'X', ...REASON });
    expect(theirs.status).toBe(404);
    expect(await sectionCount()).toBe(3);

    const ours = await request(makeApp()).post('/api/submission-ops/packages/1/sections').send({ sectionKey: '3.2.P.2', sectionLabel: 'Manufacture', sortOrder: 4, ...REASON });
    expect(ours.status).toBe(201);
    expect(await sectionCount()).toBe(4);
    expect((await metadataOf(1)).bundle).toBeUndefined();
  });
});
