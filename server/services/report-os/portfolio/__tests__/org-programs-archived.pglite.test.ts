/**
 * An archived project leaves Reporting (S12 biotech sweep, finding 89; re-checked in the running app 2026-11-12).
 *
 * Archiving a project (POST /api/c2c/projects/:id/archive) sets `regulatory_programs.status = 'archived'` and leaves
 * its anchor `projects` row as it was. Reporting's list of an organization's projects (`fetchOrgPrograms`) excluded
 * only `projects.status = 'archived'`. So an archived project left Projects and stayed in Reporting: in the project
 * picker, in the readiness board and its average, and in the global schedule. A deleted project did the same.
 *
 * Real SQL on PGlite, with the two tables as the columns the read names.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('../../../../db', () => ({ get db() { return state.db; } }));
vi.mock('../../orchestrator', () => ({
  computeInitialRun: vi.fn(async () => ({ providers: [], confidence: 60, blockers: [], criticalBlockers: [], summary: {} })),
}));

const { fetchOrgPortfolioSummary } = await import('../fetch');

const ACTIVE = '11111111-1111-4111-8111-111111111111';
const ARCHIVED = '22222222-2222-4222-8222-222222222222';
const DELETED = '33333333-3333-4333-8333-333333333333';
const OTHER_ORG = '44444444-4444-4444-8444-444444444444';
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, status text NOT NULL DEFAULT 'active', deleted_at timestamp);
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text, code text, therapeutic_area text,
      regulatory_program_id uuid, parent_project_id integer, status text NOT NULL DEFAULT 'active');
    INSERT INTO regulatory_programs (id, organization_id, status, deleted_at) VALUES
      ('${ACTIVE}', 7, 'active', NULL), ('${ARCHIVED}', 7, 'archived', NULL), ('${DELETED}', 7, 'active', now()), ('${OTHER_ORG}', 8, 'active', NULL);
    INSERT INTO projects (id, organization_id, name, code, regulatory_program_id, status) VALUES
      (1, 7, 'Active project', 'ACT-1', '${ACTIVE}', 'active'),
      (2, 7, 'Archived in Projects', 'ARC-2', '${ARCHIVED}', 'active'),
      (3, 7, 'Deleted in Projects', 'DEL-3', '${DELETED}', 'active'),
      (4, 7, 'No program record', 'OLD-4', NULL, 'active'),
      (5, 7, 'Archived anchor', 'ARC-5', NULL, 'archived'),
      (6, 8, 'Another organization', 'OTH-6', '${OTHER_ORG}', 'active');`);
  state.db = drizzle(pg);
}, 120_000);
afterAll(async () => { await pg.close(); });

describe("Reporting's list of an organization's projects", () => {
  it('leaves out a project archived or deleted in Projects, and keeps the rest', async () => {
    const summary = await fetchOrgPortfolioSummary(7);
    const names = (summary?.attentionRanked ?? []).map((m) => m.name).sort();
    expect(names).toEqual(['Active project', 'No program record']);
    expect(summary?.memberCount).toBe(2);
  });

  it('applies the same rule inside the projects a reader may open', async () => {
    const summary = await fetchOrgPortfolioSummary(7, { accessibleProjectIds: [1, 2, 3] });
    expect((summary?.attentionRanked ?? []).map((m) => m.name)).toEqual(['Active project']);
  });

  it('answers nothing, not an empty board, when every project is archived', async () => {
    expect(await fetchOrgPortfolioSummary(7, { accessibleProjectIds: [2, 5] })).toBeNull();
  });
});
