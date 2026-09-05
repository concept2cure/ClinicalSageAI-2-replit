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

import { assembleOrgIBSections } from '../investigator-brochure-view-assembler';

const ORG = 7;
const OTHER = 9;

/** Simplified DDL mirroring the real column contracts the assembler queries (org-id
 *  types, deleted_at, the clinical_ops schema) — FK REFERENCES omitted (idiom: the
 *  market-access pglite test), so no organizations/users tables are needed. */
const DDL = `
CREATE SCHEMA IF NOT EXISTS clinical_ops;
CREATE TABLE nonclinical_studies (
  id serial PRIMARY KEY, organization_id int NOT NULL, study_number text, deleted_at timestamptz
);
CREATE TABLE clinical_ops.studies (
  id serial PRIMARY KEY, org_id text, protocol text
);
CREATE TABLE clinical_studies (
  id serial PRIMARY KEY, organization_id int NOT NULL, study_id text, deleted_at timestamptz
);
CREATE TABLE adverse_events (
  id text PRIMARY KEY, organization_id text NOT NULL, suspect_product text
);
CREATE TABLE risk_management_plans (
  id text PRIMARY KEY, organization_id text NOT NULL,
  identified_risks text DEFAULT '[]', potential_risks text DEFAULT '[]'
);
CREATE TABLE cmc_module3_sections (
  id serial PRIMARY KEY, organization_id int NOT NULL, section_key text, section_path text
);
`;

const byNum = (rows: Array<{ number: string; status: string; gaps: string[] }>, n: string) =>
  rows.find((r) => r.number === n)!;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(DDL);
}, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => {
  await pglite.exec(`
    DELETE FROM nonclinical_studies;
    DELETE FROM clinical_ops.studies;
    DELETE FROM clinical_studies;
    DELETE FROM adverse_events;
    DELETE FROM risk_management_plans;
    DELETE FROM cmc_module3_sections;
  `);
});

describe('assembleOrgIBSections', () => {
  it('derives the BX-204 demo shape: nonclinical + clinical(ops) + safety(AE), product absent', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, study_number) VALUES ($1, 'TX-701')`, [ORG]);
    await pglite.query(`INSERT INTO clinical_ops.studies (org_id, protocol) VALUES ($1, 'BX204-301')`, [String(ORG)]);
    await pglite.query(`INSERT INTO adverse_events (id, organization_id, suspect_product) VALUES ('ICSR-1', $1, 'BX-204')`, [String(ORG)]);

    const view = await assembleOrgIBSections(ORG);
    expect(view.provisioned).toBe(true);
    expect(view.availability).toEqual({ product: false, nonclinical: true, clinical: true, safety: true });
    expect(view.sources).toEqual(expect.arrayContaining(['nonclinical_studies', 'clinical_ops.studies', 'adverse_events']));
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

  it('lights up every domain when all four stores hold org rows (completeness 100)', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id) VALUES ($1)`, [ORG]);
    await pglite.query(`INSERT INTO clinical_studies (organization_id, study_id) VALUES ($1, 'S1')`, [ORG]);
    await pglite.query(
      `INSERT INTO risk_management_plans (id, organization_id, identified_risks) VALUES ('rmp-1', $1, '["hepatotoxicity"]')`,
      [String(ORG)],
    );
    await pglite.query(`INSERT INTO cmc_module3_sections (organization_id, section_key) VALUES ($1, '3.2.S.1')`, [ORG]);

    const view = await assembleOrgIBSections(ORG);
    expect(view.availability).toEqual({ product: true, nonclinical: true, clinical: true, safety: true });
    expect(view.sources).toEqual(expect.arrayContaining(['clinical_studies', 'risk_management_plans', 'cmc_module3_sections']));
    expect(byNum(view.rows, '2').status).toBe('rendered');
    expect(byNum(view.rows, '3').status).toBe('rendered');
    expect(view.completeness).toBe(100);
  });

  it('treats an empty-default RMP as no safety evidence (mirrors resolveAvailability)', async () => {
    // identified_risks / potential_risks left at their '[]' defaults → not real risk data.
    await pglite.query(`INSERT INTO risk_management_plans (id, organization_id) VALUES ('rmp-empty', $1)`, [String(ORG)]);
    const view = await assembleOrgIBSections(ORG);
    expect(view.availability.safety).toBe(false);
    expect(view.provisioned).toBe(false);
  });

  it('is soft-delete aware for the deleted_at stores', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, deleted_at) VALUES ($1, now())`, [ORG]);
    const view = await assembleOrgIBSections(ORG);
    expect(view.availability.nonclinical).toBe(false); // soft-deleted study does not count
    expect(byNum(view.rows, '4').status).toBe('missing');
  });

  it('is strictly tenant-scoped', async () => {
    await pglite.query(`INSERT INTO nonclinical_studies (organization_id, study_number) VALUES ($1, 'TX-701')`, [ORG]);
    await pglite.query(`INSERT INTO clinical_ops.studies (org_id, protocol) VALUES ($1, 'BX204-301')`, [String(ORG)]);

    const other = await assembleOrgIBSections(OTHER);
    expect(other.provisioned).toBe(false);
    expect(other.availability).toEqual({ product: false, nonclinical: false, clinical: false, safety: false });
    expect(byNum(other.rows, '4').status).toBe('missing');
    expect(byNum(other.rows, '0').status).toBe('rendered'); // boilerplate still renders
  });

  it('returns the honest all-absent skeleton for an org with no upstream evidence', async () => {
    const view = await assembleOrgIBSections(ORG);
    expect(view.provisioned).toBe(false);
    expect(view.sources).toEqual([]);
    // Provenance is honest 'none' — not a specific store that contributed nothing.
    expect(view.source).toBe('none');
    expect(view.source).not.toBe('nonclinical_studies');
    expect(view.completeness).toBeGreaterThanOrEqual(0);
    // Every data-bearing section missing; boilerplate rendered.
    expect(byNum(view.rows, '1').status).toBe('missing');
    expect(byNum(view.rows, '0').status).toBe('rendered');
  });

  it('guards each store with to_regclass — an unmigrated store is an absent domain, not a 42P01', async () => {
    const full = pglite;
    const bare = new PGlite();
    // Only the nonclinical registry exists in this database; the other five are absent.
    await bare.exec(`CREATE TABLE nonclinical_studies (organization_id int NOT NULL, deleted_at timestamptz)`);
    await bare.query(`INSERT INTO nonclinical_studies (organization_id) VALUES ($1)`, [ORG]);
    pglite = bare;
    try {
      const view = await assembleOrgIBSections(ORG);
      expect(view.availability).toEqual({ product: false, nonclinical: true, clinical: false, safety: false });
      expect(view.sources).toEqual(['nonclinical_studies']);
      expect(view.provisioned).toBe(true);
      expect(byNum(view.rows, '4').status).toBe('rendered');
    } finally {
      pglite = full;
      await bare.close();
    }
  });
});
