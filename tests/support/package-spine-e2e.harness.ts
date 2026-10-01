/**
 * The package-model spine's end-to-end harness: the schema, the seed and the
 * helpers that drive the REAL assemble route on PGlite against the REAL
 * packager. Shared so the spine's end-to-end suites stay one implementation
 * as they grow (tests/submission-ops-package-spine.pglite.e2e.test.ts).
 *
 * The database is ./package-spine-pglite; a suite mocks '../server/db' onto it
 * (vi.mock cannot live here — it is hoisted only within a test file).
 */
import { expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import submissionOpsRouter from '../../server/routes/submission-ops';
import { recordFiledSequence } from '../../server/services/ectd/package-content-change';
import { pg } from './package-spine-pglite';

export const ORG = 99;
export const PKG = 1;

export function app() {
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

export const DDL = `
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

/** An IND's identifiers in FDA's form (sweep F05, F07b): the six digits FDA
 *  assigned, the nine-digit D-U-N-S number, and the regulatory contact. */
export const REGULATORY = {
  applicationNumber: '123456',
  applicantId: '123456789',
  applicantName: 'Acme Biologics Inc',
  contact: { name: 'Jane Q. Regulatory', phone: '+1 301 555 0100', email: 'regulatory@acme.example' },
};

export async function seed() {
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

export const assemble = (body: Record<string, unknown> = {}) =>
  request(app())
    .post('/api/submission-ops/packages/pkg_e2e/assemble')
    .send({ reason: 'Assemble the locked package for agency transmit', ...body });

export async function storedMetadata(): Promise<Record<string, any>> {
  const { rows } = await pg.query<{ metadata: any }>(`SELECT metadata FROM c2c_submission_packages WHERE id = $1`, [PKG]);
  const m = rows[0].metadata;
  return typeof m === 'string' ? JSON.parse(m) : m;
}

export async function storedBundle() {
  const bundle = (await storedMetadata()).bundle;
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  return { bundle, zip };
}

/** What governed transmit does once the gateway has accepted the bytes. */
export async function fileTheStoredBundle(submissionType: string, transmittalId = 1) {
  const { bundle } = await storedBundle();
  const ok = await recordFiledSequence(PKG, {
    sequence: bundle.sequence,
    // As governed transmit records it: the identity the assembled bundle
    // declares (sweep F04), the caller's term only where it declares none.
    submissionType: bundle.submissionType ?? submissionType,
    ...(bundle.submissionTypeCode ? { submissionTypeCode: bundle.submissionTypeCode } : {}),
    ...(bundle.submissionSubTypeCode ? { submissionSubTypeCode: bundle.submissionSubTypeCode } : {}),
    ...(bundle.submissionId ? { submissionId: bundle.submissionId } : {}),
    sha256: bundle.sha256,
    transmittalId,
    leaves: bundle.leafManifest,
  });
  expect(ok, 'the filed history was written').toEqual({ outcome: 'recorded' });
  return bundle as { sequence: string; sha256: string; leafManifest: any[] };
}

/** An IND follow-up as FDA files it: an amendment to the Original Application
 *  activity sequence 0000 opened (sweep F04). It was 'Efficacy Supplement',
 *  which no IND can file. */
export const IND_AMENDMENT = { submissionType: 'Original Application', submissionSubType: 'Amendment', submissionId: '0000' };

export const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

/** Every href in every backbone resolves to an entry, and every checksum is the
 *  md5 of the bytes shipped under it. A leaf whose href leaves this sequence
 *  (a withdrawal names the sequence that holds the document) is skipped. */
export async function assertInternallyConsistent(zip: JSZip) {
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
