/**
 * assembleProjectDossierMap — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: real per-section CTD tracking rows (project_sections joined to
 * their parent projects) are rolled up into the DossierMap render contract — one row
 * per module {m,label,pct,tone,sections}, pct a genuine derived readiness (complete =
 * approved/signed/locked), archived projects excluded, strict org scope — with no blob
 * and nothing fabricated. Crucially it is PROJECT-scoped: readiness is computed from the
 * one requested project only and NEVER contaminated by sections of the org's other
 * projects.
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

import { assembleProjectDossierMap } from '../dossier-map-view-assembler';

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

describe('assembleProjectDossierMap', () => {
  it('rolls real tracked sections up to the module grain with derived pct/tone', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical Overview', 'approved');
    await section(ORG, p, 'm2.7', 'M2', 'Clinical Summary', 'drafting');
    await section(ORG, p, 'm3.2.S.1', 'M3', 'General Information', 'not_started');

    const rows = await assembleProjectDossierMap(ORG, p) as any[];
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

  it('scopes strictly to the requested project — a sibling project never contaminates readiness', async () => {
    // Same org, same section code (m2.5), two DIFFERENT projects at different maturity.
    // The requested project's readiness must reflect ONLY its own status — the more-
    // advanced sibling must not leak in via any org-wide roll-up.
    const target = await project(ORG);
    const sibling = await project(ORG);
    await section(ORG, target, 'm2.5', 'M2', 'Clinical Overview', 'drafting');   // this project
    await section(ORG, sibling, 'm2.5', 'M2', 'Clinical Overview', 'signed');    // other project
    await section(ORG, sibling, 'm4.2.1', 'M4', 'Pharmacology', 'approved');     // other project only

    const rows = await assembleProjectDossierMap(ORG, target) as any[];
    expect(rows.map((r) => r.m)).toEqual(['2']);              // sibling's M4 never appears
    expect(rows[0].sections).toEqual(['2.5 Clinical Overview']);
    expect(rows[0].pct).toBe(0);                              // drafting ≠ complete — NOT the sibling's 'signed'
    expect(rows[0].tone).toBe('idle');                        // would be 'ok' if org-wide contaminated it

    // And the sibling, read on its own id, is fully complete — proving the scope cuts both ways.
    const sibRows = await assembleProjectDossierMap(ORG, sibling) as any[];
    expect(sibRows.map((r) => r.m)).toEqual(['2', '4']);
    expect(sibRows[0].pct).toBe(100);
    expect(sibRows[0].tone).toBe('ok');
  });

  it('dedups a section tracked more than once within the SAME project, keeping the most-advanced status', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical Overview', 'drafting');
    await section(ORG, p, 'm2.5', 'M2', 'Clinical Overview', 'signed');   // more advanced wins

    const rows = await assembleProjectDossierMap(ORG, p) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].sections).toEqual(['2.5 Clinical Overview']);           // one chip, not two
    expect(rows[0].pct).toBe(100);                                          // signed counts complete
    expect(rows[0].tone).toBe('ok');
  });

  it('returns [] for an archived (soft-deleted) project even when it has tracked sections', async () => {
    const archived = await project(ORG, 'archived');
    await section(ORG, archived, 'm4.2.1', 'M4', 'Pharmacology', 'approved');

    expect(await assembleProjectDossierMap(ORG, archived)).toEqual([]);   // archived → nothing
  });

  it('returns [] for a project with no tracked sections, and never crosses tenants', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical Overview', 'approved');
    // Right project id but wrong org → nothing (double-scoped org + project).
    expect(await assembleProjectDossierMap(OTHER, p)).toEqual([]);
    // Empty project id space → nothing.
    expect(await assembleProjectDossierMap(ORG, 999999)).toEqual([]);
  });
});
