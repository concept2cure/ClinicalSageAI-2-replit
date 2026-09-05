/**
 * readPackageContentRows against a REAL Postgres engine (PGlite, in-process).
 *
 * The unit suite pins the SQL as text; this suite executes it over adversarial
 * rows — another org's mapping into this package's section, another org's
 * artifact, another package's sections, an unmapped section, empty content,
 * a cascade-deleted artifact — and asserts the exact rows the assemble route
 * builds in memory, so the two derivations of the fingerprint cannot drift
 * into a spurious refusal (or a spurious match). It also proves the SQL-side
 * digest equals the JS digest byte for byte, which is what lets transmit skip
 * transporting artifact content.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  fingerprintPackageContent,
  readPackageContentRows,
  sha256Hex,
  type PackageContentRow,
} from '../package-content-fingerprint';

const DDL = `
CREATE TABLE c2c_package_sections (
  id SERIAL PRIMARY KEY,
  section_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL,
  package_db_id INTEGER NOT NULL,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY,
  artifact_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  ctd_section TEXT
);
CREATE TABLE c2c_artifact_section_map (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  section_db_id INTEGER NOT NULL REFERENCES c2c_package_sections(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX c2c_artsec_artifact_section_uq ON c2c_artifact_section_map (artifact_id, section_db_id);
`;

const ORG = 99;
const OTHER_ORG = 7;
const PKG = 1;
const OTHER_PKG = 2;
const TRICKY = 'Clinical overview text\nwith "quotes", a tab\t, é and 𝔘nicode beyond the BMP';

let pg: PGlite;
const client = { query: async (sql: string, params: unknown[]) => pg.query(sql, params) as Promise<{ rows: Record<string, unknown>[] }> };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  // Sections: three of this package (one unmapped, out of sort order), one of
  // another package, and one of another org inside this package (the package
  // is tenant-scoped; assemble reads all of its sections, so this one counts).
  await pg.exec(`
    INSERT INTO c2c_package_sections (id, section_id, org_id, package_db_id, section_key, section_label, sort_order) VALUES
      (1, 'sec_1', ${ORG}, ${PKG}, '2.5', 'Clinical Overview', 2),
      (2, 'sec_2', ${ORG}, ${PKG}, 'module3_cmc', 'Module 3', 1),
      (3, 'sec_3', ${ORG}, ${PKG}, 'cover-letter', 'Cover Letter', 0),
      (4, 'sec_4', ${ORG}, ${OTHER_PKG}, '2.5', 'Clinical Overview', 0),
      (5, 'sec_5', ${OTHER_ORG}, ${PKG}, 'labeling', 'Labeling', 3);
    INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, title, content, version, ctd_section) VALUES
      (1, 'artifact_co', 3, ${ORG}, 'Clinical overview', $$${TRICKY}$$, 1, NULL),
      (2, 'artifact_desc', 3, ${ORG}, 'Description', 'Desc', 3, '3.2.P.1'),
      (3, 'artifact_other', 3, ${OTHER_ORG}, 'Other org', 'Other content', 1, NULL),
      (4, 'artifact_empty', 3, ${ORG}, 'Empty', '', 1, NULL);
    INSERT INTO c2c_artifact_section_map (org_id, artifact_id, section_db_id) VALUES
      (${ORG}, 1, 1),        -- ours
      (${ORG}, 2, 2),        -- ours
      (${OTHER_ORG}, 3, 1),  -- another org's mapping into OUR section: excluded
      (${ORG}, 4, 2),        -- ours, empty content
      (${ORG}, 1, 4),        -- our artifact into ANOTHER package: excluded
      (${OTHER_ORG}, 1, 5);  -- another org's mapping into the other-org section: excluded (section stays, unmapped)
  `);
});

afterAll(async () => {
  await pg.close();
});

const expectedRows = (): PackageContentRow[] => [
  { sectionDbId: 1, sectionKey: '2.5', sectionLabel: 'Clinical Overview', artifactDbId: 1, title: 'Clinical overview', version: 1, ctdSection: null, contentSha256: sha256Hex(TRICKY) },
  { sectionDbId: 2, sectionKey: 'module3_cmc', sectionLabel: 'Module 3', artifactDbId: 2, title: 'Description', version: 3, ctdSection: '3.2.P.1', contentSha256: sha256Hex('Desc') },
  { sectionDbId: 2, sectionKey: 'module3_cmc', sectionLabel: 'Module 3', artifactDbId: 4, title: 'Empty', version: 1, ctdSection: null, contentSha256: sha256Hex('') },
  { sectionDbId: 3, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null },
  { sectionDbId: 5, sectionKey: 'labeling', sectionLabel: 'Labeling', artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null },
];

describe('readPackageContentRows on a real engine', () => {
  it('yields exactly the rows assemble builds: this package’s sections, this org’s mappings joined to their artifacts, unmapped sections as null rows, and a database digest equal to the JS digest', async () => {
    const rows = await readPackageContentRows(client, PKG, ORG);
    expect(rows).toEqual(expectedRows());
  });

  it('is indifferent to section sort order but not to a cascade-deleted artifact', async () => {
    const before = fingerprintPackageContent(await readPackageContentRows(client, PKG, ORG));
    await pg.exec('UPDATE c2c_package_sections SET sort_order = 9 WHERE id = 1');
    expect(fingerprintPackageContent(await readPackageContentRows(client, PKG, ORG))).toBe(before);
    await pg.exec('DELETE FROM concept2cure_artifacts WHERE id = 2'); // cascades to its mapping
    const after = await readPackageContentRows(client, PKG, ORG);
    expect(after).toEqual(expectedRows().filter((r) => r.artifactDbId !== 2));
    expect(fingerprintPackageContent(after)).not.toBe(before);
  });

  it('is scoped to the org: another tenant asking about the same package sees only its own mappings', async () => {
    const rows = await readPackageContentRows(client, PKG, OTHER_ORG);
    // The other org's mapping of artifact 3 into section 1 and of artifact 1 into section 5 are ITS content.
    expect(rows.map((r) => [r.sectionDbId, r.artifactDbId])).toEqual([[1, 3], [2, null], [3, null], [5, 1]]);
  });
});
