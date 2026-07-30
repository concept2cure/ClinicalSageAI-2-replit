/**
 * assembleOrgShadowReview — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: reviewer runs persisted in the REAL store (shadow_review_runs +
 * shadow_review_findings) are assembled into exactly the { lens, findings[] } shape the
 * v2 ShadowReview surface renders — latest COMPLETE run per lens, findings severity-
 * ordered and shaped (leaf_ref → leafRef), a reviewed-clean lens kept with [] findings —
 * with no blob, strict org scope, and soft-deletes excluded.
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

import { assembleOrgShadowReview } from '../shadow-review-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE shadow_review_runs (id serial PRIMARY KEY, organization_id int, lens text, status text, created_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE shadow_review_findings (id serial PRIMARY KEY, run_id int, organization_id int, dimension text, severity text, title text, detail text, basis text, recommendation text, leaf_ref text, deleted_at timestamptz);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM shadow_review_runs; DELETE FROM shadow_review_findings;`); });

async function run(org: number, lens: string, status = 'complete'): Promise<number> {
  const r = await pglite.query(
    `INSERT INTO shadow_review_runs (organization_id, lens, status) VALUES ($1,$2,$3) RETURNING id`,
    [org, lens, status],
  );
  return (r.rows[0] as { id: number }).id;
}
async function finding(runId: number, org: number, dimension: string, severity: string, title: string, leafRef: string | null = null): Promise<void> {
  await pglite.query(
    `INSERT INTO shadow_review_findings (run_id, organization_id, dimension, severity, title, detail, basis, recommendation, leaf_ref)
     VALUES ($1,$2,$3,$4,$5,'d','b','fix',$6)`,
    [runId, org, dimension, severity, title, leafRef],
  );
}

describe('assembleOrgShadowReview', () => {
  it('maps the latest complete run per lens, findings shaped + severity-ordered, lens-ordered', async () => {
    const fda = await run(ORG, 'fda_filing');
    await finding(fda, ORG, 'crl', 'minor', 'Minor CRL', '3.2');
    await finding(fda, ORG, 'crl', 'major', 'Major CRL', '2.5.4');
    const ema = await run(ORG, 'ema_d120');
    await finding(ema, ORG, 'crl', 'major', 'EU benefit-risk', '2.5.6');

    const rows = await assembleOrgShadowReview(ORG) as any[];
    // Lens order = catalog order (fda_filing before ema_d120).
    expect(rows.map((r) => r.lens)).toEqual(['fda_filing', 'ema_d120']);
    // Findings severity-ordered: major before minor.
    expect(rows[0].findings.map((f: any) => f.severity)).toEqual(['major', 'minor']);
    expect(rows[0].findings[0]).toMatchObject({ dimension: 'crl', severity: 'major', title: 'Major CRL', leafRef: '2.5.4' });
    // Display keys present incl. null-safe fields.
    for (const k of ['dimension', 'severity', 'title', 'detail', 'basis', 'recommendation', 'leafRef']) {
      expect(rows[0].findings[0]).toHaveProperty(k);
    }
  });

  it('keeps a reviewed-clean lens (complete run, zero findings) as findings: []', async () => {
    await run(ORG, 'pmda');
    const rows = await assembleOrgShadowReview(ORG) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lens: 'pmda', findings: [] });
  });

  it('uses only the latest run per lens and ignores non-complete runs', async () => {
    const old = await run(ORG, 'fda_filing');
    await finding(old, ORG, 'crl', 'major', 'Stale finding');
    const fresh = await run(ORG, 'fda_filing');
    await finding(fresh, ORG, 'rtf', 'minor', 'Fresh finding');
    const running = await run(ORG, 'ema_d120', 'running'); // not complete → excluded
    await finding(running, ORG, 'crl', 'critical', 'In-flight');

    const rows = await assembleOrgShadowReview(ORG) as any[];
    expect(rows.map((r) => r.lens)).toEqual(['fda_filing']);          // ema run not complete
    expect(rows[0].findings.map((f: any) => f.title)).toEqual(['Fresh finding']); // latest run only
  });

  it('returns [] for an org with no runs, and never crosses tenants', async () => {
    const r = await run(ORG, 'fda_filing');
    await finding(r, ORG, 'crl', 'major', 'Ours');
    expect(await assembleOrgShadowReview(OTHER)).toEqual([]);
  });

  it('excludes soft-deleted runs and findings', async () => {
    const r = await run(ORG, 'fda_filing');
    await finding(r, ORG, 'crl', 'major', 'Kept', '2.5');
    await pglite.query(`INSERT INTO shadow_review_findings (run_id, organization_id, dimension, severity, title, deleted_at) VALUES ($1,$2,'rtf','minor','Gone', now())`, [r, ORG]);
    let rows = await assembleOrgShadowReview(ORG) as any[];
    expect(rows[0].findings.map((f: any) => f.title)).toEqual(['Kept']); // deleted finding excluded

    await pglite.query(`UPDATE shadow_review_runs SET deleted_at = now() WHERE id = $1`, [r]);
    expect(await assembleOrgShadowReview(ORG)).toEqual([]);            // deleted run excluded
  });
});
