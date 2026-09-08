/**
 * The tenant boundaries of the content-change module, against a REAL Postgres
 * engine (PGlite, in-process).
 *
 * The unit suite's db stub answers `where()` with the chain itself, so it never
 * evaluates a predicate: deleting the section's tenant check left all 38 of its
 * tests passing. That check is half the reason the ungoverned biostatistics
 * insert was migrated onto `mapArtifactToSection`, and the package lookup in
 * `markPackagesContentChangedForArtifact` has the same exposure — a mapping row
 * carrying one org with a section belonging to another is exactly the shape the
 * old insert could write. Both are executed here against real rows.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const recordGovernedActionFn = vi.fn(async () => ({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' }));
vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedActionFn(...(a as [])),
}));

const pg = new PGlite();
const drizzleDb = drizzle(pg);
vi.mock('../../../db', () => ({
  get db() { return drizzleDb; },
  pool: {
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []),
      release: () => {},
    }),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []),
  },
}));

import { mapArtifactToSection, markPackagesContentChangedForArtifact } from '../package-content-change';

const DDL = `
CREATE TABLE c2c_submission_packages (
  id SERIAL PRIMARY KEY, package_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'locked',
  package_family TEXT, metadata JSON, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE c2c_package_sections (
  id SERIAL PRIMARY KEY, section_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  package_db_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, section_label TEXT NOT NULL, sort_order INTEGER DEFAULT 0
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
CREATE UNIQUE INDEX c2c_artsec_artifact_section_uq ON c2c_artifact_section_map (artifact_id, section_db_id);
`;

const ORG = 99;
const OTHER_ORG = 7;
const BUNDLE = `'{"bundle":{"sha256":"aaa","path":"/b.zip"},"preflight":{"errorCount":0}}'::json`;

beforeEach(async () => {
  await pg.exec('DROP TABLE IF EXISTS c2c_artifact_section_map, c2c_package_sections, concept2cure_artifacts, c2c_submission_packages CASCADE;');
  await pg.exec(DDL);
  await pg.exec(`
    -- Two packages of the SAME project id, one per org.
    INSERT INTO c2c_submission_packages (id, package_id, org_id, project_id, metadata) VALUES
      (1, 'pkg_ours', ${ORG}, 3, ${BUNDLE}),
      (2, 'pkg_theirs', ${OTHER_ORG}, 3, ${BUNDLE});
    INSERT INTO c2c_package_sections (id, section_id, org_id, package_db_id, section_key, section_label) VALUES
      (10, 'sec_ours', ${ORG}, 1, '2.5', 'Clinical Overview'),
      (20, 'sec_theirs', ${OTHER_ORG}, 2, '2.5', 'Clinical Overview');
    INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, title, content) VALUES
      (5, 'artifact_ours', 3, ${ORG}, 'Ours', 'text'),
      (6, 'artifact_theirs', 3, ${OTHER_ORG}, 'Theirs', 'text');
  `);
  recordGovernedActionFn.mockClear();
});

afterAll(async () => { await pg.close(); });

const metadataOf = async (id: number) =>
  ((await pg.query<{ metadata: any }>('SELECT metadata FROM c2c_submission_packages WHERE id = $1', [id])).rows[0].metadata) as Record<string, unknown>;
const mappingCount = async () =>
  Number((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM c2c_artifact_section_map')).rows[0].n);

describe('mapArtifactToSection tenant boundaries, on a real engine', () => {
  const base = { orgId: ORG, artifactDbId: 5, actorUserId: 777, reason: 'Map the overview into 2.5' };

  it('maps into a section of THIS org, clearing the stale bundle and its preflight summary in one transaction', async () => {
    const out = await mapArtifactToSection({ ...base, sectionDbId: 10 });
    expect(out).toMatchObject({ ok: true, duplicate: false, packageDbId: 1, staleBundleCleared: true });
    expect(await mappingCount()).toBe(1);
    const md = await metadataOf(1);
    expect(md.bundle).toBeUndefined();
    expect(md.preflight).toBeUndefined();
    expect(md.contentRevision).toBe(1);
  });

  it('REFUSES a section belonging to another org, and writes nothing at all', async () => {
    const out = await mapArtifactToSection({ ...base, sectionDbId: 20 });
    expect(out).toEqual({ ok: false, code: 'SECTION_NOT_FOUND', message: 'Section not found for organization' });
    expect(await mappingCount()).toBe(0);
    // The other tenant's bundle is untouched — it was never a candidate.
    expect((await metadataOf(2)).bundle).toBeDefined();
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('REFUSES an artifact belonging to another org', async () => {
    const out = await mapArtifactToSection({ ...base, artifactDbId: 6, sectionDbId: 10 });
    expect(out).toMatchObject({ ok: false, code: 'ARTIFACT_NOT_FOUND' });
    expect(await mappingCount()).toBe(0);
  });

  it('answers a repeat with the existing row and changes nothing', async () => {
    await mapArtifactToSection({ ...base, sectionDbId: 10 });
    const revisionAfterFirst = (await metadataOf(1)).contentRevision;
    const again = await mapArtifactToSection({ ...base, sectionDbId: 10 });
    expect(again).toMatchObject({ ok: true, duplicate: true, staleBundleCleared: false });
    expect(await mappingCount()).toBe(1);
    expect((await metadataOf(1)).contentRevision).toBe(revisionAfterFirst);
  });
});

describe('markPackagesContentChangedForArtifact tenant boundaries, on a real engine', () => {
  it('follows only mappings whose SECTION belongs to the acting org — a cross-tenant row never clears another tenant’s bundle', async () => {
    // The shape the ungoverned biostatistics insert could write: our org id on a
    // mapping row pointing at another tenant's section.
    await pg.exec(`INSERT INTO c2c_artifact_section_map (org_id, artifact_id, section_db_id) VALUES
      (${ORG}, 5, 10),
      (${ORG}, 5, 20);`);

    const out = await markPackagesContentChangedForArtifact(5, ORG, { userId: 777, cause: 'content' });

    expect(out).toMatchObject({ packagesAffected: 1, bundlesInvalidated: 1, failed: false });
    // Ours is invalidated…
    const ours = await metadataOf(1);
    expect(ours.bundle).toBeUndefined();
    expect(ours.contentRevision).toBe(1);
    // …theirs is untouched, and nothing was filed against their package.
    expect((await metadataOf(2)).bundle).toBeDefined();
    expect(recordGovernedActionFn).toHaveBeenCalledTimes(1);
    expect((recordGovernedActionFn.mock.calls[0] as any[])[1]).toMatchObject({ orgId: ORG, target: 'submission:1' });
  });

  it('an artifact mapped only into another tenant’s section invalidates nothing', async () => {
    await pg.exec(`INSERT INTO c2c_artifact_section_map (org_id, artifact_id, section_db_id) VALUES (${ORG}, 5, 20);`);
    const out = await markPackagesContentChangedForArtifact(5, ORG, { userId: 777, cause: 'placement' });
    expect(out).toMatchObject({ packagesAffected: 0, bundlesInvalidated: 0, failed: false });
    expect((await metadataOf(2)).bundle).toBeDefined();
  });
});
