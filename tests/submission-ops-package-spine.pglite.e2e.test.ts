/**
 * The package-model spine end to end: the REAL assemble route, REAL SQL
 * (PGlite), the REAL packager and the REAL ZIP, plus the REAL filed-history
 * write governed transmit makes after an accepted send — across sequences.
 *
 * Why this exists. The assemble suite next door mocks the packager and the
 * filesystem, so the route's own plan and the bytes the packager wrote are never
 * compared. That is how a follow-up whose submission type the packager could not
 * resolve returned a bare 500 while that suite passed, and it is why the case
 * below could not be seen at all: this container has no Ghostscript, the
 * production image does (Dockerfile.optimized), and the packager converts every
 * leaf to PDF/A when it is present. The conversion changes the bytes — and,
 * because Ghostscript stamps dates and a random document ID, changes them
 * differently on every run. The filed history recorded the md5 of the CONVERTED
 * bytes; the next assembly planned against the md5 of the bytes it rendered,
 * BEFORE conversion. Two stages of one document never compare equal, so in
 * production every follow-up re-filed every unchanged document as `replace`, a
 * sequence in which nothing changed was never refused, and the operator was told
 * "0 left unchanged on file".
 *
 * The production toolchain is simulated by the stand-in Ghostscript in
 * server/services/ectd/__tests__/stand-in-ghostscript.harness.ts.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// BUNDLE_DIR binds when the route module loads, so it is set before any import.
const { bundleDir } = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/pkg-spine-e2e-${process.pid}`;
  process.env.SUBMISSION_BUNDLE_DIR = dir;
  return { bundleDir: dir };
});

vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' })),
}));

const pg = new PGlite();
const drizzleDb = drizzle(pg);
vi.mock('../server/db', () => ({
  get db() { return drizzleDb; },
  pool: {
    connect: async () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []), release: () => {} }),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params ?? []),
  },
}));
// Engines the router imports that this path never calls.
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));

import submissionOpsRouter from '../server/routes/submission-ops';
import { recordFiledSequence } from '../server/services/ectd/package-content-change';
import { installStandInGhostscript, type StandInGhostscript } from '../server/services/ectd/__tests__/stand-in-ghostscript.harness';

const ORG = 99;
const PKG = 1;

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

const DDL = `
CREATE TABLE c2c_submission_packages (
  id SERIAL PRIMARY KEY, package_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL, package_family TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  target_date TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'active', metadata JSON,
  created_by_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE c2c_package_sections (
  id SERIAL PRIMARY KEY, section_id TEXT NOT NULL UNIQUE, org_id INTEGER NOT NULL,
  package_db_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, section_label TEXT NOT NULL, parent_section_id INTEGER,
  sort_order INTEGER DEFAULT 0, metadata JSON,
  created_at TIMESTAMPTZ NOT NULL DEFAULT '2026-01-02T03:04:05Z', updated_at TIMESTAMP DEFAULT '2026-01-02T03:04:05Z'
);
CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY, artifact_id TEXT NOT NULL UNIQUE, project_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, ctd_section TEXT, status TEXT NOT NULL DEFAULT 'draft',
  approved_version_id INTEGER, published_version_id INTEGER,
  updated_at TIMESTAMP NOT NULL DEFAULT '2026-01-02T03:04:05Z'
);
CREATE TABLE c2c_artifact_section_map (
  id SERIAL PRIMARY KEY, org_id INTEGER NOT NULL,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  section_db_id INTEGER NOT NULL REFERENCES c2c_package_sections(id) ON DELETE CASCADE,
  document_family TEXT, owner_user_id INTEGER, owner_role TEXT, owner_function TEXT,
  ownership_type TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);`;

const REGULATORY = { applicationNumber: '123456', applicantId: 'DUNS-123456789', applicantName: 'Acme Biologics Inc' };

async function seed() {
  await pg.exec(`DROP TABLE IF EXISTS c2c_artifact_section_map, concept2cure_artifacts, c2c_package_sections, c2c_submission_packages CASCADE;`);
  await pg.exec(DDL);
  await pg.query(
    `INSERT INTO c2c_submission_packages (id, package_id, org_id, project_id, package_family, title, status, metadata)
     VALUES ($1, 'pkg_e2e', $2, 3, 'ind', 'Compound X IND', 'locked', $3::json)`,
    [PKG, ORG, JSON.stringify({ regulatory: REGULATORY })],
  );
  await pg.exec(`
    INSERT INTO c2c_package_sections (id, section_id, org_id, package_db_id, section_key, section_label, sort_order) VALUES
      (11, 'sec_cover', ${ORG}, ${PKG}, 'cover-letter', 'Cover Letter', 0),
      (13, 'sec_co',    ${ORG}, ${PKG}, '2.5',          'Clinical Overview', 1),
      (14, 'sec_desc',  ${ORG}, ${PKG}, '3.2.P.1',      'Description and Composition', 2);
    INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, title, content, version, ctd_section, status, approved_version_id) VALUES
      (1, 'artifact_cover0001', 3, ${ORG}, 'Cover Letter',      'We submit sequence content.', 1, NULL,      'approved', 1),
      (2, 'artifact_co000002',  3, ${ORG}, 'Clinical Overview', 'The overview, version one.',  1, '2.5',     'approved', 1),
      (3, 'artifact_desc0003',  3, ${ORG}, 'Description',       'Composition table.',         1, '3.2.P.1', 'approved', 1);
    INSERT INTO c2c_artifact_section_map (org_id, artifact_id, section_db_id) VALUES
      (${ORG}, 1, 11), (${ORG}, 2, 13), (${ORG}, 3, 14);
  `);
}

const assemble = (body: Record<string, unknown> = {}) =>
  request(app())
    .post('/api/submission-ops/packages/pkg_e2e/assemble')
    .send({ reason: 'Assemble the locked package for agency transmit', ...body });

async function storedMetadata(): Promise<Record<string, any>> {
  const { rows } = await pg.query<{ metadata: any }>(`SELECT metadata FROM c2c_submission_packages WHERE id = $1`, [PKG]);
  const m = rows[0].metadata;
  return typeof m === 'string' ? JSON.parse(m) : m;
}

async function storedBundle() {
  const bundle = (await storedMetadata()).bundle;
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  return { bundle, zip };
}

/** What governed transmit does once the gateway has accepted the bytes. */
async function fileTheStoredBundle(submissionType: string) {
  const { bundle } = await storedBundle();
  const ok = await recordFiledSequence(PKG, {
    sequence: bundle.sequence,
    submissionType,
    sha256: bundle.sha256,
    transmittalId: 1,
    leaves: bundle.leafManifest,
  });
  expect(ok, 'the filed history was written').toBe(true);
}

const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

/** Every href in every backbone resolves to an entry, and every checksum is the
 *  md5 of the bytes shipped under it. A leaf whose href leaves this sequence
 *  (a withdrawal names the sequence that holds the document) is skipped. */
async function assertInternallyConsistent(zip: JSZip) {
  const backbones = Object.keys(zip.files).filter((n) => n === 'index.xml' || /m1\/[a-z]+\/[a-z-]+-regional\.xml$/.test(n));
  expect(backbones).toContain('index.xml');
  let checked = 0;
  for (const b of backbones) {
    const xml = await zip.file(b)!.async('string');
    for (const m of xml.matchAll(/<leaf\b[^>]*>/g)) {
      const el = m[0];
      const href = /xlink:href="([^"]+)"/.exec(el)?.[1];
      const checksum = /checksum="([^"]+)"/.exec(el)?.[1];
      if (!href || href.startsWith('../') || /\.xml(#|$)/.test(href)) continue;
      const entry = path.posix.normalize(path.posix.join(path.posix.dirname(b), href));
      const file = zip.file(entry);
      expect(file, `${b}: ${href} resolves to ${entry}`).toBeTruthy();
      expect(checksum, `${b}: ${href} checksum`).toBe(md5(await file!.async('uint8array')));
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(0);
}

let gs: StandInGhostscript;
const withProductionToolchain = <T,>(fn: () => Promise<T>) => gs.run(fn);
beforeAll(async () => { gs = await installStandInGhostscript(); });
afterAll(async () => {
  await gs?.dispose();
  await fs.rm(bundleDir, { recursive: true, force: true }).catch(() => {});
});
beforeEach(seed);

describe('the package-model spine, end to end on the real packager', () => {
  it('sequence 0000 is internally consistent: every href resolves and every checksum is the md5 of the bytes shipped', async () => {
    const res = await assemble();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { zip, bundle } = await storedBundle();
    await assertInternallyConsistent(zip);
    expect(bundle.leafManifest).toHaveLength(3);
    expect(bundle.leafManifest.every((l: any) => typeof l.leafKey === 'string')).toBe(true);
  });

  it('control, no toolchain: a follow-up in which nothing changed is refused as NOTHING_TO_FILE', async () => {
    expect((await assemble()).status).toBe(200);
    await fileTheStoredBundle('original');
    const res = await assemble({ sequence: '0001', submissionType: 'Efficacy Supplement' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('NOTHING_TO_FILE');
  });

  it('WITH the production PDF/A toolchain: a follow-up in which nothing changed still files nothing', async () => {
    await withProductionToolchain(async () => {
      expect((await assemble()).status).toBe(200);
      const { zip, bundle } = await storedBundle();
      // The stand-in really did convert: the shipped bytes are not the rendered ones.
      expect(bundle.submissionGrade?.pdfaConverted, 'leaves were converted').toBeGreaterThan(0);
      await assertInternallyConsistent(zip);
      await fileTheStoredBundle('original');

      const res = await assemble({ sequence: '0001', submissionType: 'Efficacy Supplement' });
      expect(res.status, `a sequence re-filing ${JSON.stringify(res.body?.data?.bundle?.lifecycle)} unchanged documents`).toBe(409);
      expect(res.body.code).toBe('NOTHING_TO_FILE');
    });
  }, 60_000);

  it('WITH the production PDF/A toolchain: only the edited document ships, as a replace of the leaf on file', async () => {
    await withProductionToolchain(async () => {
      expect((await assemble()).status).toBe(200);
      const { zip: zip0 } = await storedBundle();
      await fileTheStoredBundle('original');

      await pg.query(
        `UPDATE concept2cure_artifacts SET content = 'The overview, version two.', version = 2, approved_version_id = 2,
           updated_at = '2026-02-03T04:05:06Z' WHERE id = 2`,
      );
      const res = await assemble({ sequence: '0001', submissionType: 'Efficacy Supplement' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data.bundle.lifecycle.summary).toMatchObject({ replace: 1, new: 0, unchanged: 2 });

      const { zip: zip1, bundle } = await storedBundle();
      await assertInternallyConsistent(zip1);
      expect(bundle.leafManifest).toHaveLength(1);
      expect(bundle.leafManifest[0]).toMatchObject({ ctdSection: '2.5', operation: 'replace' });
      // Its modified-file names a leaf that sequence 0000's backbone carries.
      const index = await zip1.file('index.xml')!.async('string');
      const pointer = /modified-file="([^"]+)"/.exec(index)?.[1];
      expect(pointer, 'the replace names what it supersedes').toBeTruthy();
      const [file, leafId] = pointer!.split('#');
      const landed = path.posix.normalize(path.posix.join('0001', file));
      expect(landed.startsWith('0000/')).toBe(true);
      const priorBackbone = await zip0.file(landed.slice('0000/'.length))!.async('string');
      expect(priorBackbone, `${pointer} names a leaf 0000 filed`).toContain(`ID="${leafId}"`);
    });
  }, 60_000);
});
