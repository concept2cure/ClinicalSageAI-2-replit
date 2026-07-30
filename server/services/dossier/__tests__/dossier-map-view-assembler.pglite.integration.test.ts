/**
 * assembleOrgDossierMap — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: real per-section CTD tracking rows (project_sections joined to
 * their parent projects) are rolled up into the DossierMap render contract — one row
 * per module {m,label,pct,tone,sections}, pct a genuine derived readiness (complete =
 * approved/signed/locked), most-advanced-status dedup across projects, archived
 * projects excluded, strict org scope — with no blob and nothing fabricated.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleOrgDossierMap } from '../dossier-map-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE projects (id serial PRIMARY KEY, organization_id int, status text DEFAULT 'active');
CREATE TABLE project_sections (id serial PRIMARY KEY, organization_id int, project_id int, section_code text, module text, title text, status text DEFAULT 'not_started');
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM project_sections; DELETE FROM projects;`); });

async function project(org: number, status = 'active'): Promise<number> {
  const r = await pglite.query(`INSERT INTO projects (organization_id, status) VALUES ($1,$2) RETURNING id`, [org, status]);
  return (r.rows[0] as { id: number }).id;
}
async function section(org: number, projectId: number, code: string, module: string, title: string, status: string): Promise<void> {
  await pglite.query(
    `INSERT INTO project_sections (organization_id, project_id, section_code, module, title, status) VALUES ($1,$2,$3,$4,$5,$6)`,
    [org, projectId, code, module, title, status],
  );
}

describe('assembleOrgDossierMap', () => {
  it('rolls real tracked sections up to the module grain with derived pct/tone', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical Overview', 'approved');
    await section(ORG, p, 'm2.7', 'M2', 'Clinical Summary', 'drafting');
    await section(ORG, p, 'm3.2.S.1', 'M3', 'General Information', 'not_started');

    const rows = await assembleOrgDossierMap(ORG) as any[];
    expect(rows.map((r) => r.m)).toEqual(['2', '3']);         // only tracked modules, ordered

    const m2 = rows[0];
    expect(m2.label).toBe('CTD summaries');
    expect(m2.pct).toBe(50);                                   // 1 of 2 complete — derived
    expect(m2.tone).toBe('warn');                              // partial
    expect(m2.sections).toEqual(['2.5 Clinical Overview', '2.7 Clinical Summary']); // m-stripped, coded order

    const m3 = rows[1];
    expect(m3.pct).toBe(0);
    expect(m3.tone).toBe('idle');
  });

  it('dedups a section tracked in multiple projects, keeping the most-advanced status', async () => {
    const p1 = await project(ORG);
    const p2 = await project(ORG);
    await section(ORG, p1, 'm2.5', 'M2', 'Clinical Overview', 'drafting');
    await section(ORG, p2, 'm2.5', 'M2', 'Clinical Overview', 'signed');   // more advanced wins

    const rows = await assembleOrgDossierMap(ORG) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].sections).toEqual(['2.5 Clinical Overview']);           // one chip, not two
    expect(rows[0].pct).toBe(100);                                          // signed counts complete
    expect(rows[0].tone).toBe('ok');
  });

  it('excludes sections of archived (soft-deleted) projects', async () => {
    const live = await project(ORG);
    const archived = await project(ORG, 'archived');
    await section(ORG, live, 'm2.5', 'M2', 'Clinical Overview', 'approved');
    await section(ORG, archived, 'm4.2.1', 'M4', 'Pharmacology', 'approved');

    const rows = await assembleOrgDossierMap(ORG) as any[];
    expect(rows.map((r) => r.m)).toEqual(['2']);               // archived project's M4 gone
  });

  it('returns [] for an org with no tracked sections, and never crosses tenants', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical Overview', 'approved');
    expect(await assembleOrgDossierMap(OTHER)).toEqual([]);
  });
});
