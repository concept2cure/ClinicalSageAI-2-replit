/**
 * cmc-change-control-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: a CMC change PROPOSED through the service persists in
 * the real cmc_change_controls store and reads back org-scoped, and the read projects
 * through the deterministic SUPAC classifier into the card view (risk / FDA category /
 * SUPAC tier / citation) — no blob, no stored verdict. Also locks required-input
 * validation, soft-delete, and strict tenant scope.
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

import {
  createCmcChange, listCmcChanges, getCmcChange, deleteCmcChange, CmcChangeValidationError,
} from '../cmc-change-control-service';
import { projectCmcChanges, type CmcChangeRow } from '../cmc-change-view';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE cmc_change_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, title text NOT NULL, area text, programs text,
  dosage_form_family text NOT NULL, change_category text NOT NULL,
  scale_change_factor text, excipient_level_change text, site_change_kind text, process_change_kind text,
  touches_critical_step boolean NOT NULL DEFAULT false, affects text,
  has_comparability_data boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'evaluating',
  description text, created_by int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM cmc_change_controls;`); });

describe('cmc-change-control-service', () => {
  it('proposes a change, reads it back, and projects it through the SUPAC classifier', async () => {
    const created = await createCmcChange(ORG, {
      title: 'Bioreactor scale-up 2,000L → 5,000L', area: 'Drug substance', programs: 'BX-099, BX-204',
      dosageFormFamily: 'biologic', changeCategory: 'scale_up', scaleChangeFactor: 'within_10x',
      affects: 'drug_substance', touchesCriticalStep: true, hasComparabilityData: false,
      status: 'evaluating', description: 'DS bioreactor scale-up.', createdBy: 42,
    });
    expect(created.id).toBeTruthy();
    expect(created.organization_id).toBe(ORG);
    expect(created.created_by).toBe(42);

    const rows = await listCmcChanges(ORG);
    expect(rows).toHaveLength(1);
    const view = projectCmcChanges(rows as unknown as CmcChangeRow[])[0] as any;
    // Identity carried through; verdict COMPUTED (shape, not a stored value).
    expect(view.title).toBe('Bioreactor scale-up 2,000L → 5,000L');
    expect(view.area).toBe('Drug substance');
    expect(view.programs).toBe('BX-099, BX-204');
    expect(view.status).toBe('evaluating');
    expect(['high', 'medium', 'low']).toContain(view.risk);
    expect(['annual_report', 'cbe_30', 'cbe_0', 'pas', 'no_filing']).toContain(view.fdaCategory);
    expect(typeof view.supacTier).toBe('string');
    expect(typeof view.citation).toBe('string');
  });

  it('rejects a missing/invalid required classifier input', async () => {
    await expect(createCmcChange(ORG, { title: '', dosageFormFamily: 'biologic', changeCategory: 'scale_up' }))
      .rejects.toBeInstanceOf(CmcChangeValidationError);
    await expect(createCmcChange(ORG, { title: 'x', dosageFormFamily: 'not_a_form', changeCategory: 'scale_up' }))
      .rejects.toBeInstanceOf(CmcChangeValidationError);
    await expect(createCmcChange(ORG, { title: 'x', dosageFormFamily: 'biologic', changeCategory: 'nope' }))
      .rejects.toBeInstanceOf(CmcChangeValidationError);
    expect(await listCmcChanges(ORG)).toEqual([]);
  });

  it('is strictly tenant-scoped and soft-delete aware', async () => {
    const mine = await createCmcChange(ORG, { title: 'Mine', dosageFormFamily: 'biologic', changeCategory: 'specifications' });
    await createCmcChange(OTHER, { title: 'Theirs', dosageFormFamily: 'biologic', changeCategory: 'specifications' });

    expect((await listCmcChanges(ORG)).map((r) => r.title)).toEqual(['Mine']);
    expect(await getCmcChange(OTHER, mine.id)).toBeNull();          // no cross-tenant read

    expect(await deleteCmcChange(ORG, mine.id)).toBe(true);
    expect(await listCmcChanges(ORG)).toEqual([]);                   // soft-deleted excluded
    expect(await getCmcChange(ORG, mine.id)).toBeNull();
  });
});
