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
    return { rows: r.rows as Array<Record<string, unknown>>, rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { assembleProjectDossierMap, readProjectSectionTracking } from '../dossier-map-view-assembler';

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

  it('withholds a module percentage for an unknown tracked state', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical overview', 'future_status');
    const result = await assembleProjectDossierMap(ORG, p);
    expect(result[0]).toMatchObject({ m: '2', pct: null, tone: null });
  });

  it('does not hide an unknown duplicate behind a complete tracked state', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Clinical overview', 'locked');
    await section(ORG, p, 'm2.5', 'M2', 'Unclassified record', '__proto__');
    const result = await assembleProjectDossierMap(ORG, p);
    expect(result[0]).toMatchObject({ m: '2', pct: null, tone: null });
  });

  it('does not turn incidental digits in module and section text into a CTD module', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'arbitrary4-record', 'garbage4', 'Unmapped record', 'approved');
    await expect(assembleProjectDossierMap(ORG, p)).rejects.toMatchObject({ code: 'SECTION_TRACKING_REVIEW_REQUIRED' });
  });

  it('preserves distinct recorded raw code aliases in the tracking denominator', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm3.2.s.1', 'M3', 'Substance', 'drafting');
    await section(ORG, p, '3.2.S.1', '3', 'Substance approved', 'approved');
    const result = await assembleProjectDossierMap(ORG, p);
    expect(result[0]).toMatchObject({ m: '3', pct: 50, tone: 'warn', sections: ['3.2.S.1 Substance approved', '3.2.s.1 Substance'] });
  });
});

describe('recorded tracking details carried to core', () => {
  it('keeps unmapped rows visible without assigning an incidental or contradictory module', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'record4', 'garbage4', 'Invalid section', 'locked');
    await section(ORG, p, 'm2.5', 'garbage2', 'Invalid module', 'approved');
    await section(ORG, p, 'm3.2.S.1', 'M4', 'Contradictory module', 'signed');
    const result = await readProjectSectionTracking(pool, ORG, p);
    expect(result).toMatchObject({ basis: 'section_tracking', state: 'measured', modules: [], unmapped: [
      { code: 'm2.5', title: 'Invalid module', module: 'garbage2', status: 'approved', reason: 'INVALID_MODULE' },
      { code: 'm3.2.S.1', title: 'Contradictory module', module: 'M4', status: 'signed', reason: 'MODULE_MISMATCH' },
      { code: 'record4', title: 'Invalid section', module: 'garbage4', status: 'locked', reason: 'INVALID_SECTION_CODE' },
    ] });
    await expect(assembleProjectDossierMap(ORG, p)).rejects.toMatchObject({ code: 'SECTION_TRACKING_REVIEW_REQUIRED' });
  });

  it('retains stored code/title/status and unknown duplicate observations while withholding the dependent figure', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Approved old title', 'locked');
    await section(ORG, p, 'm2.5', 'M2', 'New unassessed title', 'future_status');
    const result = await readProjectSectionTracking(pool, ORG, p);
    expect(result).toMatchObject({ modules: [{
      counted: 1, complete: 0, unknownCount: 1, pct: null, tone: null,
      sections: [{ code: 'm2.5', title: 'New unassessed title', status: 'future_status',
        label: '2.5 New unassessed title', observedStatuses: ['future_status', 'locked'] }],
    }] });
  });

  it('chooses equal-rank duplicate states and titles deterministically', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'Z title', 'revision');
    await section(ORG, p, 'm2.5', 'M2', 'B title', 'internal_review');
    await section(ORG, p, 'm2.5', 'M2', 'A title', 'internal_review');
    const result = await readProjectSectionTracking(pool, ORG, p);
    expect(result).toMatchObject({ modules: [{ sections: [{ title: 'A title', status: 'internal_review', observedStatuses: ['internal_review', 'revision'] }] }] });
  });

  it('uses valid section syntax only when the module is absent, keeping regulatory section order', async () => {
    const p = await project(ORG);
    for (const code of ['3.2.R', '3.2.A', '3.2.P', '3.2.S.10', '3.2.S.2']) {
      await section(ORG, p, code, '', code, 'signed');
    }
    const result = await readProjectSectionTracking(pool, ORG, p);
    expect(result).toMatchObject({ modules: [{ m: '3', counted: 5, complete: 5, pct: 100, tone: 'ok', sections: [
      { code: '3.2.S.2' }, { code: '3.2.S.10' }, { code: '3.2.P' }, { code: '3.2.A' }, { code: '3.2.R' },
    ] }] });
  });

  it('keeps null statuses unknown and raw code aliases distinct', async () => {
    const p = await project(ORG);
    await section(ORG, p, 'm2.5', 'M2', 'First stored code', 'signed');
    await pglite.query('INSERT INTO project_sections(organization_id,project_id,section_code,module,title,status) VALUES($1,$2,$3,$4,$5,NULL)', [ORG, p, '2.5', null, 'Second stored code']);
    const result = await readProjectSectionTracking(pool, ORG, p);
    expect(result).toMatchObject({ modules: [{ counted: 2, complete: 1, unknownCount: 1, pct: null, tone: null,
      sections: [{ code: '2.5', status: null, observedStatuses: [null] }, { code: 'm2.5', status: 'signed' }] }] });
  });
});

describe('tracking source states', () => {
  it('does not query when no exact tracking anchor is supplied', async () => {
    const query = vi.fn();
    expect(await readProjectSectionTracking({ query }, ORG, null)).toMatchObject({ basis: 'section_tracking', state: 'unanchored', modules: null, unmapped: null });
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['42P01', '42703'])('keeps missing tracking schema %s distinct from an empty measured store', async code => {
    const query = vi.fn().mockRejectedValue(Object.assign(new Error('schema missing'), { code }));
    expect(await readProjectSectionTracking({ query }, ORG, 41)).toMatchObject({ basis: 'section_tracking', state: 'unavailable', modules: null, unmapped: null });
  });

  it('throws unexpected failures and malformed rows rather than returning an empty or guessed map', async () => {
    const failure = new Error('read failed');
    await expect(readProjectSectionTracking({ query: vi.fn().mockRejectedValue(failure) }, ORG, 41)).rejects.toBe(failure);
    const query = vi.fn().mockResolvedValue({ rows: [{ section_code: 'm2.5', module: 'M2', title: 'Clinical', status: { malformed: true } }] });
    await expect(readProjectSectionTracking({ query }, ORG, 41)).rejects.toThrow('could not be read');
  });
});
