/**
 * investigator-brochure-view-assembler — END-TO-END against in-process PGlite.
 *
 * Proves the GA read path: the v2 InvestigatorBrochure surface's ICH E6(R2) §7
 * section-readiness view is derived from the REAL, org-scoped upstream evidence
 * stores — nonclinical_studies, clinical_ops.studies / clinical_studies,
 * adverse_events / risk_management_plans, cmc_module3_sections — via the real SQL
 * (to_regclass guards + a bulk UNION EXISTS probe) and the deterministic ib-builder
 * gap engine. No blob, no fixture. Locks: per-domain derivation, the OR of candidate
 * stores per domain, soft-delete awareness, strict tenant scope, and the to_regclass
 * guard against an unmigrated store (absent domain, never a 42P01 throw).
 *
 * 2026-11-12 (S12 sweep finding 92): the view is ONE PROJECT's. Until then it was the
 * organisation's, so a project read "ready" on another project's Module 3 rows, and the
 * page showed a percentage with no project open. Locks added: each store is read for
 * the named project only; a store with no project link is not read for a project and
 * is named; a study with no submission is attributed to no project; and the percentage
 * counts only the sections that need project data, so a project with nothing recorded
 * reads 0, not the share of title page, confidentiality statement and table of contents.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Keep the AI gateway import in ib-builder inert (it is never called on this read path).
vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: vi.fn(async () => '') },
  default: { complete: vi.fn(async () => '') },
}));

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as unknown[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleProjectIBSections } from '../investigator-brochure-view-assembler';

const ORG = 7;
const OTHER = 9;
/** Two projects of ORG. */
const PROJECT = '11111111-1111-4111-8111-111111111111';
const SIBLING = '22222222-2222-4222-8222-222222222222';

/** Simplified DDL mirroring the real column contracts the assembler queries (org-id
 *  types, deleted_at, the clinical_ops schema) — FK REFERENCES omitted (idiom: the
 *  market-access pglite test), so no organizations/users tables are needed. */
const DDL = `
CREATE SCHEMA IF NOT EXISTS clinical_ops;
CREATE TABLE submissions (
  id serial PRIMARY KEY, organization_id int NOT NULL, program_id uuid
);
CREATE TABLE nonclinical_studies (
  id serial PRIMARY KEY, organization_id int NOT NULL, submission_id int, study_number text, deleted_at timestamptz
);
CREATE TABLE clinical_ops.studies (
  id serial PRIMARY KEY, org_id text, protocol text
);
CREATE TABLE clinical_studies (
  id serial PRIMARY KEY, organization_id int NOT NULL, program_id uuid, study_id text, deleted_at timestamptz
);
CREATE TABLE adverse_events (
  id text PRIMARY KEY, organization_id text NOT NULL, project_id text, suspect_product text
);
CREATE TABLE risk_management_plans (
  id text PRIMARY KEY, organization_id text NOT NULL, project_id text,
  identified_risks text DEFAULT '[]', potential_risks text DEFAULT '[]'
);
CREATE TABLE cmc_module3_sections (
  id serial PRIMARY KEY, organization_id int NOT NULL, project_id text, section_key text, section_path text
);
`;

/** A submission of the project, for a nonclinical study to belong to. */
async function submissionOf(org: number, project: string): Promise<number> {
  const r = await pglite.query<{ id: number }>(`INSERT INTO submissions (organization_id, program_id) VALUES ($1, $2) RETURNING id`, [org, project]);
  return r.rows[0].id;
}

const byNum = (rows: Array<{ number: string; status: string; gaps: string[]; needsData?: boolean }>, n: string) =>
  rows.find((r) => r.number === n)!;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`
    DELETE FROM nonclinical_studies;
    DELETE FROM submissions;
    DELETE FROM clinical_ops.studies;
    DELETE FROM clinical_studies;
    DELETE FROM adverse_events;
    DELETE FROM risk_management_plans;
    DELETE FROM cmc_module3_sections;
  `);
});

describe('assembleProjectIBSections: the domains', () => {
  it('derives the BX-204 demo shape for its project: nonclinical + clinical + safety(AE), product absent', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id, study_number) VALUES ($1, $2, 'TX-701')`, [ORG, await submissionOf(ORG, PROJECT)]);
    await pglite.query(`INSERT INTO clinical_studies (organization_id, program_id, study_id) VALUES ($1, $2, 'BX204-301')`, [ORG, PROJECT]);
    await pglite.query(`INSERT INTO adverse_events (id, organization_id, project_id, suspect_product) VALUES ('ICSR-1', $1, $2, 'BX-204')`, [String(ORG), PROJECT]);

    const view = await assembleProjectIBSections(ORG, PROJECT);
    expect(view.provisioned).toBe(true);
    expect(view.availability).toEqual({ product: false, nonclinical: true, clinical: true, safety: true });
    expect(view.sources).toEqual(expect.arrayContaining(['nonclinical_studies', 'clinical_studies', 'adverse_events']));
    expect(view.source).toContain('nonclinical_studies');

    // Real per-section verdicts from the gap engine.
    expect(byNum(view.rows, '0').status).toBe('rendered');   // boilerplate
    expect(byNum(view.rows, '4').status).toBe('rendered');   // Nonclinical — evidence present
    expect(byNum(view.rows, '4.3').status).toBe('rendered'); // Toxicology
    expect(byNum(view.rows, '5').status).toBe('rendered');   // Effects in Humans (clinical + safety)
    expect(byNum(view.rows, '5.1').status).toBe('rendered'); // clinical PK
    // Product domain absent → §2 (product+boilerplate) and §3 (product) honestly missing.
    expect(byNum(view.rows, '2').status).toBe('missing');
    expect(byNum(view.rows, '3').status).toBe('missing');
    expect(byNum(view.rows, '3').gaps.length).toBeGreaterThan(0);
    // Completeness < 100 because the product-dependent required sections are missing.
    expect(view.completeness).toBeGreaterThan(0);
    expect(view.completeness).toBeLessThan(100);
  });

  it('lights up every domain when all four stores hold the project\'s rows (completeness 100)', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id) VALUES ($1, $2)`, [ORG, await submissionOf(ORG, PROJECT)]);
    await pglite.query(`INSERT INTO clinical_studies (organization_id, program_id, study_id) VALUES ($1, $2, 'S1')`, [ORG, PROJECT]);
    await pglite.query(
      `INSERT INTO risk_management_plans (id, organization_id, project_id, identified_risks) VALUES ('rmp-1', $1, $2, '["hepatotoxicity"]')`,
      [String(ORG), PROJECT],
    );
    await pglite.query(`INSERT INTO cmc_module3_sections (organization_id, project_id, section_key) VALUES ($1, $2, '3.2.S.1')`, [ORG, PROJECT]);

    const view = await assembleProjectIBSections(ORG, PROJECT);
    expect(view.availability).toEqual({ product: true, nonclinical: true, clinical: true, safety: true });
    expect(view.sources).toEqual(expect.arrayContaining(['clinical_studies', 'risk_management_plans', 'cmc_module3_sections']));
    expect(byNum(view.rows, '2').status).toBe('rendered');
    expect(byNum(view.rows, '3').status).toBe('rendered');
    expect(view.completeness).toBe(100);
  });

  it('treats an empty-default RMP as no safety evidence (mirrors resolveAvailability)', async () => {
    // identified_risks / potential_risks left at their '[]' defaults → not real risk data.
    await pglite.query(`INSERT INTO risk_management_plans (id, organization_id, project_id) VALUES ('rmp-empty', $1, $2)`, [String(ORG), PROJECT]);
    const view = await assembleProjectIBSections(ORG, PROJECT);
    expect(view.availability.safety).toBe(false);
    expect(view.provisioned).toBe(false);
  });

  it('is soft-delete aware for the deleted_at stores', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id, deleted_at) VALUES ($1, $2, now())`, [ORG, await submissionOf(ORG, PROJECT)]);
    await pglite.query(`INSERT INTO clinical_studies (organization_id, program_id, deleted_at) VALUES ($1, $2, now())`, [ORG, PROJECT]);
    const view = await assembleProjectIBSections(ORG, PROJECT);
    expect(view.availability.nonclinical).toBe(false); // soft-deleted study does not count
    expect(view.availability.clinical).toBe(false);
    expect(byNum(view.rows, '4').status).toBe('missing');
  });

  it('returns the honest all-absent skeleton for a project with no upstream evidence', async () => {
    const view = await assembleProjectIBSections(ORG, PROJECT);
    expect(view.provisioned).toBe(false);
    expect(view.sources).toEqual([]);
    // Provenance is honest 'none' — not a specific store that contributed nothing.
    expect(view.source).toBe('none');
    expect(view.source).not.toBe('nonclinical_studies');
    // Every data-bearing section missing; boilerplate rendered.
    expect(byNum(view.rows, '1').status).toBe('missing');
    expect(byNum(view.rows, '0').status).toBe('rendered');
  });
});

describe('assembleProjectIBSections: one project, one organisation', () => {
  // S12 sweep finding 92. With C2C-101 open the page read 36% on the strength of
  // C2C-201's Module 3 sections: the figure belonged to the organisation, so to no project.
  it('reads one project only: a sibling project\'s evidence does not count', async () => {
    await pglite.query(`INSERT INTO cmc_module3_sections (organization_id, project_id, section_key) VALUES ($1, $2, '3.2.S.1')`, [ORG, SIBLING]);
    await pglite.query(`INSERT INTO clinical_studies (organization_id, program_id, study_id) VALUES ($1, $2, 'S1')`, [ORG, SIBLING]);
    await pglite.query(`INSERT INTO adverse_events (id, organization_id, project_id) VALUES ('ICSR-9', $1, $2)`, [String(ORG), SIBLING]);
    await pglite.query(`INSERT INTO risk_management_plans (id, organization_id, project_id, identified_risks) VALUES ('rmp-9', $1, $2, '["qt"]')`, [String(ORG), SIBLING]);
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id) VALUES ($1, $2)`, [ORG, await submissionOf(ORG, SIBLING)]);

    const mine = await assembleProjectIBSections(ORG, PROJECT);
    expect(mine.availability).toEqual({ product: false, nonclinical: false, clinical: false, safety: false });
    expect(mine.provisioned).toBe(false);
    expect(mine.sources).toEqual([]);
    expect(byNum(mine.rows, '3').status).toBe('missing');
    expect(mine.completeness).toBe(0);

    const theirs = await assembleProjectIBSections(ORG, SIBLING);
    expect(theirs.availability).toEqual({ product: true, nonclinical: true, clinical: true, safety: true });
    expect(theirs.completeness).toBe(100);
  });

  it('attributes a nonclinical study through its submission; a study with no submission belongs to no project', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, study_number) VALUES ($1, 'TX-000')`, [ORG]);
    const unattached = await assembleProjectIBSections(ORG, PROJECT);
    expect(unattached.availability.nonclinical).toBe(false);

    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id, study_number) VALUES ($1, $2, 'TX-701')`, [ORG, await submissionOf(ORG, PROJECT)]);
    expect((await assembleProjectIBSections(ORG, PROJECT)).availability.nonclinical).toBe(true);
    expect((await assembleProjectIBSections(ORG, SIBLING)).availability.nonclinical).toBe(false);
  });

  it('does not read a store that has no project link, and names it', async () => {
    // clinical_ops.studies carries the organisation and nothing that ties a study to a project.
    await pglite.query(`INSERT INTO clinical_ops.studies (org_id, protocol) VALUES ($1, 'BX204-301')`, [String(ORG)]);
    const view = await assembleProjectIBSections(ORG, PROJECT);
    expect(view.availability.clinical).toBe(false);
    expect(view.sources).not.toContain('clinical_ops.studies');
    expect(view.storesWithoutProject).toEqual(['clinical_ops.studies']);
    expect(byNum(view.rows, '5.1').status).toBe('missing');
  });

  it('counts only the sections that need project data: a project with nothing recorded reads 0', async () => {
    const view = await assembleProjectIBSections(ORG, PROJECT);
    // The title page, confidentiality statement and table of contents need no project data.
    for (const n of ['0', '0a', '0b', '7']) expect(byNum(view.rows, n)).toMatchObject({ status: 'rendered', needsData: false });
    for (const n of ['1', '2', '3', '4', '4.1', '5', '5.3', '6']) expect(byNum(view.rows, n).needsData).toBe(true);
    expect(view.completeness).toBe(0);
  });

  it('is strictly tenant-scoped: the same project id under another organisation reads nothing', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id, study_number) VALUES ($1, $2, 'TX-701')`, [ORG, await submissionOf(ORG, PROJECT)]);
    await pglite.query(`INSERT INTO clinical_studies (organization_id, program_id, study_id) VALUES ($1, $2, 'BX204-301')`, [ORG, PROJECT]);
    await pglite.query(`INSERT INTO cmc_module3_sections (organization_id, project_id, section_key) VALUES ($1, $2, '3.2.S.1')`, [ORG, PROJECT]);

    const other = await assembleProjectIBSections(OTHER, PROJECT);
    expect(other.provisioned).toBe(false);
    expect(other.availability).toEqual({ product: false, nonclinical: false, clinical: false, safety: false });
    expect(byNum(other.rows, '4').status).toBe('missing');
    expect(byNum(other.rows, '0').status).toBe('rendered'); // boilerplate still renders
  });

  it('a study does not count through another organisation\'s submission of the same project id', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, submission_id) VALUES ($1, $2)`, [ORG, await submissionOf(OTHER, PROJECT)]);
    expect((await assembleProjectIBSections(ORG, PROJECT)).availability.nonclinical).toBe(false);
  });
});

describe('assembleProjectIBSections: stores that are not installed', () => {
  it('guards each store with to_regclass — an unmigrated store is an absent domain, not a 42P01', async () => {
    const full = pglite;
    const bare = new PGlite();
    // Only the Module 3 register exists in this database; the other stores are absent.
    await bare.exec(`CREATE TABLE cmc_module3_sections (organization_id int NOT NULL, project_id text)`);
    await bare.query(`INSERT INTO cmc_module3_sections (organization_id, project_id) VALUES ($1, $2)`, [ORG, PROJECT]);
    pglite = bare;
    try {
      const view = await assembleProjectIBSections(ORG, PROJECT);
      expect(view.availability).toEqual({ product: true, nonclinical: false, clinical: false, safety: false });
      expect(view.sources).toEqual(['cmc_module3_sections']);
      expect(view.storesWithoutProject).toEqual([]);
      expect(view.provisioned).toBe(true);
      expect(byNum(view.rows, '3').status).toBe('rendered');
    } finally {
      pglite = full;
      await bare.close();
    }
  });

  it('skips the nonclinical register when the submissions it is attributed through are not installed', async () => {
    const full = pglite;
    const bare = new PGlite();
    await bare.exec(`CREATE TABLE nonclinical_studies (organization_id int NOT NULL, submission_id int, deleted_at timestamptz)`);
    await bare.query(`INSERT INTO nonclinical_studies (organization_id, submission_id) VALUES ($1, 1)`, [ORG]);
    pglite = bare;
    try {
      const view = await assembleProjectIBSections(ORG, PROJECT);
      expect(view.availability.nonclinical).toBe(false);
      expect(view.storesWithoutProject).toEqual(['nonclinical_studies']);
    } finally {
      pglite = full;
      await bare.close();
    }
  });
});
