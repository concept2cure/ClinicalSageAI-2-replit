/**
 * An IVDR pack prints the records of ITS programme — never the organisation's.
 *
 * ── WHAT THE CODE USED TO DO (before 2026-10-15) ─────────────────────────────
 * buildIvdrPackContent read all four sections by organization alone:
 *
 *   ivdr_classifications         WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1
 *   ivdr_analytical_validations  WHERE organization_id = $1
 *   ivdr_clinical_evidence       WHERE organization_id = $1
 *   ivdr_cdx_workflows           WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1
 *
 * The pack is filed per project, so in an organisation with more than one IVD
 * programme §1 printed the organisation's LATEST classification — another
 * device's name, class and intended purpose, or a soft-deleted one (deleted_at
 * was not filtered) — and §2–§4 listed every device's validation, clinical
 * evidence and CDx rows as this device's. A projectId that named no programme
 * still built a pack. And the `accuracy` column, which holds BIAS in percent
 * (migration 001: `accuracy NUMERIC -- Bias %`; ivdr-routes.ts: `accuracy, //
 * bias %`), printed as "Accuracy 2.1".
 *
 * Runs against the REAL table definitions (migrations/20260508 — the canonical
 * ivdr_classifications creator — and migrations/001 — the module tables) in an
 * in-process PGlite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

import { buildIvdrPackContent, readIvdrPackRecordIds } from '../ivdrPackContent';
import type { ManifestV1 } from '../ivdrPackManifest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIGRATIONS = [
  'migrations/20260508_ivd_diagnostic_surfaces.sql',
  'migrations/001_create_ivdr_tables.sql',
];

/** FK targets the two migrations reference, kept to the columns read here. */
const PREREQUISITES = `
CREATE TABLE organizations (id integer PRIMARY KEY, name text);
CREATE TABLE regulatory_programs (
  id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp
);
INSERT INTO organizations (id, name) VALUES (7, 'Org 7'), (9, 'Org 9');
`;

const ORG = 7;
const PROG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROG_EMPTY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROG_DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROG_OTHER_ORG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

let pg: PGlite;
/** Ids of programme A's live records, for the snapshot assertion. */
const A: { classification?: number; validation?: number; evidence?: number; cdx?: number } = {};
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { rows: r.rows as any[], rowCount: r.rows.length };
  },
} as unknown as Pool;

async function insertId(sql: string, params: unknown[]): Promise<number> {
  const r = await pg.query<{ id: number }>(sql, params);
  return r.rows[0].id;
}

async function classification(program: string, device: string, cls: string, at: string, deletedAt: string | null = null) {
  return insertId(
    `INSERT INTO ivdr_classifications
       (organization_id, program_id, device_name, ivdr_class, intended_purpose, rationale, created_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [ORG, program, device, cls, `${device} intended purpose`, `${device} rationale`, at, deletedAt],
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(PREREQUISITES);
  for (const file of MIGRATIONS) await pg.exec(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));

  await pg.query(
    `INSERT INTO regulatory_programs (id, organization_id, deleted_at) VALUES
       ($1, 7, NULL), ($2, 7, NULL), ($3, 7, NULL), ($4, 7, now()), ($5, 9, NULL)`,
    [PROG_A, PROG_B, PROG_EMPTY, PROG_DELETED, PROG_OTHER_ORG],
  );

  // Programme A: its live classification is the OLDEST row in the organisation.
  const a1 = await classification(PROG_A, 'Assay A', 'C', '2026-01-01T00:00:00Z');
  // Programme B: a different device, classified later.
  const b1 = await classification(PROG_B, 'Assay B', 'D', '2026-03-01T00:00:00Z');
  // Programme A again, the NEWEST row of all — but soft-deleted.
  const a2 = await classification(PROG_A, 'Assay A (withdrawn)', 'B', '2026-04-01T00:00:00Z', '2026-04-02T00:00:00Z');

  A.classification = a1;

  const validation = (cls: number, analyte: string, accuracy: number | null) =>
    insertId(
      `INSERT INTO ivdr_analytical_validations
         (organization_id, classification_id, device_name, analyte_name, lod, accuracy)
       VALUES ($1, $2, 'dev', $3, 0.5, $4) RETURNING id`,
      [ORG, cls, analyte, accuracy],
    );
  A.validation = await validation(a1, 'Analyte A', 2.1);
  await validation(b1, 'Analyte B', 9.9);
  await validation(a2, 'Analyte A (withdrawn)', 1.0);

  const evidence = (cls: number, title: string) =>
    insertId(
      `INSERT INTO ivdr_clinical_evidence (organization_id, classification_id, study_title, study_type, sample_size)
       VALUES ($1, $2, $3, 'retrospective', 120) RETURNING id`,
      [ORG, cls, title],
    );
  A.evidence = await evidence(a1, 'Study A');
  await evidence(b1, 'Study B');

  const cdx = (cls: number, drug: string, at: string) =>
    insertId(
      `INSERT INTO ivdr_cdx_workflows (organization_id, classification_id, medicinal_product_name, biomarker, created_at)
       VALUES ($1, $2, $3, 'HER2', $4) RETURNING id`,
      [ORG, cls, drug, at],
    );
  A.cdx = await cdx(a1, 'Drug A', '2026-01-05T00:00:00Z');
  await cdx(b1, 'Drug B', '2026-03-05T00:00:00Z'); // the organisation's newest CDx workflow
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

const MANIFEST = {
  generatedAt: '2026-10-15T00:00:00.000Z',
  binderEvidence: { totalClaims: 0, requiredClaims: 0, approvedClaims: 0, claims: [] },
  hashes: { snapshotHashSha256: 'a'.repeat(64), manifestHashSha256: 'b'.repeat(64) },
} as unknown as ManifestV1;

function build(projectId: string, organizationId = ORG) {
  return buildIvdrPackContent({
    pool,
    organizationId,
    projectId,
    packId: 'pack-1',
    packType: 'IVDR_TECHDOC',
    packVersion: 1,
    manifest: MANIFEST,
  });
}

describe('IVDR pack content is scoped to the pack\'s programme', () => {
  it('§1 prints this programme\'s live classification — not another device\'s, not a deleted one', async () => {
    const content = await build(PROG_A);
    expect(content.readFailures).toEqual([]);
    expect(content.classification?.deviceType).toBe('Assay A');
    expect(content.classification?.riskClass).toBe('C');
    expect(content.classification?.intendedPurpose).toBe('Assay A intended purpose');
    expect(content.classification?.classifiedDate).toBe('2026-01-01');
  });

  it('§2–§4 list only this programme\'s records', async () => {
    const content = await build(PROG_A);
    expect(content.analyticalValidations.map(r => r.parameterName)).toEqual(['Analyte A']);
    expect(content.clinicalEvidence.map(r => r.studyName)).toEqual(['Study A']);
    expect(content.cdx?.companionDrug).toBe('Drug A');
  });

  it('a programme with no records of its own reads as empty, even when the organisation has some', async () => {
    const content = await build(PROG_EMPTY);
    expect(content.readFailures).toEqual([]);
    expect(content.classification).toBeNull();
    expect(content.analyticalValidations).toEqual([]);
    expect(content.clinicalEvidence).toEqual([]);
    expect(content.cdx).toBeNull();
  });

  it('labels the bias column as bias, in percent — not "Accuracy"', async () => {
    const [row] = (await build(PROG_A)).analyticalValidations;
    expect(row.resultSummary).toContain('Bias (%) 2.1');
    expect(row.resultSummary).not.toContain('Accuracy');
  });

  it.each([
    ['a projectId that is not a programme id', 'proj-1'],
    ['an unknown programme', '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'],
    ['a deleted programme', PROG_DELETED],
    ['another organisation\'s programme', PROG_OTHER_ORG],
  ])('refuses the build for %s', async (_label, projectId) => {
    await expect(build(projectId)).rejects.toThrow(/IVDR_NO_PROGRAM/);
  });

  it('the worker\'s snapshot names the same records by id, and refuses the same projects', async () => {
    // ivdr-pack-worker.ts hashes these ids into the pack's snapshot. They came
    // from four organization-wide queries of its own; now from the same reads.
    expect(await readIvdrPackRecordIds(pool, ORG, PROG_A)).toEqual({
      classificationId: A.classification,
      analyticalValidationIds: [A.validation],
      clinicalEvidenceIds: [A.evidence],
      cdxWorkflowId: A.cdx,
      readFailures: [],
    });
    await expect(readIvdrPackRecordIds(pool, ORG, 'proj-1')).rejects.toThrow(/IVDR_NO_PROGRAM/);
    await expect(readIvdrPackRecordIds(pool, ORG, PROG_OTHER_ORG)).rejects.toThrow(/IVDR_NO_PROGRAM/);
  });
});
