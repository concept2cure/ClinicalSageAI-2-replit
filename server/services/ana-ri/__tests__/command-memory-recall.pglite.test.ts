import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  query: vi.fn(),
  errors: [] as Array<{ sql: string; code?: string }>,
  results: [] as Array<{ args: unknown[]; rows: Array<Record<string, unknown>> }>,
}));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.query }, getPool: () => ({ query: h.query }), getDb: () => ({}) }));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: h.query }, getPool: () => ({ query: h.query }), getDb: () => ({}) }));

import { analyzeCMSStrategy, assessDiagnosticsValidation, type CommandContext } from '../command-executor';

let pg: PGlite;
const CTX: CommandContext = { userId: 3, organizationId: 7, activeProjectId: 42 };
const ROUTES = [
  { key: 'cms', run: analyzeCMSStrategy, action: 'analyze_cms_strategy', limit: 18, failure: 'CMS strategy analysis failed.', categories: ['cms_strategy', 'reimbursement_strategy', 'coding_coverage', 'payer_evidence', 'health_economics'] },
  { key: 'diagnostics', run: assessDiagnosticsValidation, action: 'assess_diagnostic_validation', limit: 20, failure: 'Diagnostics validation assessment failed.', categories: ['diagnostic_validation', 'ivd_performance', 'analytical_validation', 'clinical_performance', 'companion_diagnostic'] },
];
const INACTIVE = ['pending_review', 'superseded', 'archived', 'rejected', null, 'unknown-status'];

beforeAll(async () => {
  const schema = readFileSync(new URL('../../../../shared/schema.ts', import.meta.url), 'utf8');
  const rest = schema.slice(schema.indexOf('export const projectMemoryEntries = pgTable('));
  const table = rest.slice(0, rest.indexOf('\n);'));
  expect(table).toContain("confidenceScore: real('confidence_score')");
  expect(table).toContain("importanceLevel: text('importance_level')");
  expect(table).toContain("status: text('status').default('active')");
  expect(table).not.toMatch(/(?:real|text)\('(?:confidence|importance)'\)/);
  pg = new PGlite();
  // Reader-facing columns pinned above to the production Drizzle creator.
  await pg.exec(`CREATE TABLE project_memory_entries (
    id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL,
    category text NOT NULL, title text NOT NULL, content text NOT NULL,
    confidence_score real DEFAULT 0.8, importance_level text DEFAULT 'medium',
    status text DEFAULT 'active', created_at timestamp NOT NULL DEFAULT now()
  )`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE project_memory_entries RESTART IDENTITY');
  h.errors = []; h.results = [];
  h.query.mockReset().mockImplementation(async (sql: string, args: unknown[] = []) => {
    try {
      const result = await pg.query<Record<string, unknown>>(sql, args);
      h.results.push({ args, rows: result.rows });
      return { rows: result.rows };
    } catch (error) {
      h.errors.push({ sql, code: (error as { code?: string }).code });
      throw error;
    }
  });
});

type MemoryRow = {
  title: string; category: string; content?: string; projectId?: number; organizationId?: number;
  confidence?: number; importance?: string | null; status?: string | null; createdAt?: string;
};
async function seed(row: MemoryRow) {
  const { title, category, content = `${row.title} body`, projectId = 42, organizationId = 7, confidence = 0.91, importance = 'medium', status = 'active', createdAt = '2026-10-01T00:00:00Z' } = row;
  await pg.query(`INSERT INTO project_memory_entries
    (project_id, organization_id, category, title, content, confidence_score, importance_level, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [projectId, organizationId, category, title, content, confidence, importance, status, createdAt]);
}

describe('public commands recall canonical columns without changing decision math', () => {
  it('preserves the exact CMS coverage, keyword risks, and recommendation result', async () => {
    const rows = [
      { category: 'cms_strategy', title: 'CMS overview', content: 'Gap remains in payer narrative.', importance: 'critical' },
      { category: 'reimbursement_strategy', title: 'Payment route', content: 'Payment assumptions unclear.', importance: 'high' },
      { category: 'coding_coverage', title: 'Coding map', content: 'CPT coding path established.' },
      { category: 'payer_evidence', title: 'Payer matrix', content: 'Coverage evidence aligned.' },
      { category: 'health_economics', title: 'HEOR dossier', content: 'Budget impact aligned.' },
    ];
    for (const row of rows) await seed(row);
    expect(await analyzeCMSStrategy(CTX, {})).toEqual({
      success: true, action: 'analyze_cms_strategy',
      data: {
        projectId: 42, memoryEntryCount: 5,
        categoryCoverage: ROUTES[0].categories.map(category => ({ category, count: 1 })),
        riskSignals: [
          { category: 'cms_strategy', title: 'CMS overview', snippet: 'Gap remains in payer narrative.' },
          { category: 'reimbursement_strategy', title: 'Payment route', snippet: 'Payment assumptions unclear.' },
        ], recommendations: undefined,
      },
      message: 'CMS strategy analyzed using 5 project intelligence entries. 2 reimbursement risk signal(s) flagged.',
    });
    expect(h.errors).toEqual([]);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.results[0].rows[0].confidence).toBeCloseTo(0.91);
    expect(h.results[0].rows[0].importance).toBe('critical');
  });

  it('preserves the existing diagnostics keyword coverage score and component result', async () => {
    const content = ['Validation protocol', 'Sensitivity and specificity', 'Precision and repeatability', 'PPV and NPV', 'Companion diagnostic threshold cutoff'];
    for (const [index, category] of ROUTES[1].categories.entries()) await seed({ category, title: `Diagnostic ${index}`, content: content[index] });
    expect(await assessDiagnosticsValidation(CTX, {})).toEqual({
      success: true, action: 'assess_diagnostic_validation',
      data: { projectId: 42, readinessScore: 100, presentComponents: ['Analytical validation', 'Clinical performance', 'Cutoff / decision threshold', 'Companion diagnostic alignment'], missingComponents: [], memoryEntryCount: 5 },
      message: 'Diagnostics/IVD validation readiness assessed at 100%. 0 component(s) need strengthening.',
    });
    expect(h.errors).toEqual([]);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.results[0].rows[0].confidence).toBeCloseTo(0.91);
    expect(h.results[0].rows[0].importance).toBe('medium');
  });
});

describe('the shared reader preserves severity, category sets, and command limits', () => {
  it.each(ROUTES)('$key orders severity case-insensitively, then newest first, and ranks null/unknown last', async route => {
    const rows = [
      { title: 'Medium', importance: 'medium', createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Unknown new', importance: 'urgent', createdAt: '2026-10-05T00:00:00Z' },
      { title: 'Critical old', importance: 'CRITICAL', createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Null old', importance: null, createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Low', importance: 'low', createdAt: '2026-10-03T00:00:00Z' },
      { title: 'High', importance: 'HiGh', createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Critical new', importance: 'critical', createdAt: '2026-10-02T00:00:00Z' },
    ];
    for (const row of rows) await seed({ category: route.categories[0], ...row });
    expect((await route.run(CTX, {})).success).toBe(true);
    expect(h.results[0].rows.map(row => row.title)).toEqual(['Critical new', 'Critical old', 'High', 'Medium', 'Low', 'Unknown new', 'Null old']);
    expect(h.results[0].rows.at(-1)?.importance).toBeNull();
  });

  it.each(ROUTES)('$key keeps its category array, bound arguments, and $limit-row limit', async route => {
    for (let index = 0; index < route.limit + 3; index++) await seed({ category: route.categories[index % route.categories.length], title: `Allowed ${index}`, importance: 'high' });
    await seed({ category: 'unrelated_category', title: 'Excluded category', importance: 'critical' });
    const result = await route.run(CTX, {});
    expect(result.success).toBe(true);
    expect((result.data as { memoryEntryCount: number }).memoryEntryCount).toBe(route.limit);
    expect(h.results[0].rows).toHaveLength(route.limit);
    expect(h.results[0].args).toEqual([42, 7, ...route.categories, route.limit]);
    expect(h.results[0].rows.map(row => row.title)).not.toContain('Excluded category');
  });
});

describe('active-only command recall excludes quarantined and retired records', () => {
  it.each(ROUTES)('$key ignores inactive/null/unknown status rows in coverage and risk calculations', async route => {
    const category = route.key === 'cms' ? 'coding_coverage' : 'analytical_validation';
    await seed({ title: 'Active evidence', category, content: 'Precision is documented.', importance: 'low' });
    for (const status of INACTIVE) await seed({ category: route.categories[0], title: `Inactive ${String(status)}`, content: 'Gap uncertain sensitivity threshold companion diagnostic', status, importance: 'critical' });
    const result = await route.run(CTX, {});
    expect(result.success).toBe(true);
    expect(h.results[0].rows.map(row => row.title)).toEqual(['Active evidence']);
    expect((result.data as { memoryEntryCount: number }).memoryEntryCount).toBe(1);
    if (route.key === 'cms') expect(result.data).toEqual({
      projectId: 42, memoryEntryCount: 1,
      categoryCoverage: ROUTES[0].categories.map(category => ({ category, count: category === 'coding_coverage' ? 1 : 0 })),
      riskSignals: [],
      recommendations: [
        'Build payer-facing evidence matrix mapping clinical endpoints to coverage criteria.',
        'Develop HEOR/value dossier framing with budget-impact and comparative-value claims.',
      ],
    });
    else expect(result.data).toEqual({ projectId: 42, readinessScore: 25, presentComponents: ['Analytical validation'], missingComponents: ['Clinical performance', 'Cutoff / decision threshold', 'Companion diagnostic alignment'], memoryEntryCount: 1 });
  });

  it.each(ROUTES)('$key retains its healthy empty result for an inactive-only project', async route => {
    const empty = await route.run(CTX, {});
    expect(empty.success).toBe(true);
    expect((empty.data as { memoryEntryCount: number }).memoryEntryCount).toBe(0);
    for (const status of INACTIVE) await seed({ category: route.categories[0], title: `Inactive ${String(status)}`, content: 'Gap sensitivity precision threshold cdx', status });
    expect(await route.run(CTX, {})).toEqual(empty);
    expect(h.results.every(result => result.rows.length === 0)).toBe(true);
  });
});

describe('scope and project selection remain bound to the public command input', () => {
  it.each(ROUTES)('$key excludes other tenants/projects and honors an explicit project override', async route => {
    await seed({ title: 'Own record', category: route.categories[0] });
    await seed({ title: 'Other tenant', category: route.categories[0], organizationId: 8, importance: 'critical' });
    await seed({ title: 'Other project', category: route.categories[0], projectId: 43, importance: 'critical' });
    expect((await route.run(CTX, {})).success).toBe(true);
    expect(h.results[0].rows.map(row => row.title)).toEqual(['Own record']);
    const otherProject = await route.run(CTX, { projectId: 43 });
    expect((otherProject.data as { projectId: number }).projectId).toBe(43);
    expect(h.results[1].rows.map(row => row.title)).toEqual(['Other project']);
    expect(h.results[1].args.slice(0, 2)).toEqual([43, 7]);
  });

  it.each(ROUTES)('$key preserves the missing-project guard without querying', async route => {
    const ctx: CommandContext = { userId: 3, organizationId: 7 };
    expect(await route.run(ctx, {})).toEqual({ success: false, action: route.action, message: 'projectId is required.' });
    expect(h.query).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('$key preserves the nonnumeric-project guard without querying', async route => {
    expect(await route.run(CTX, { projectId: 'not-an-integer' })).toEqual({ success: false, action: route.action, message: 'projectId is required.' });
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('real database failures remain command failures, never successful empty reports', () => {
  it.each(ROUTES)('$key reports a real missing-table error through its existing catch', async route => {
    await pg.exec('ALTER TABLE project_memory_entries RENAME TO memory_temporarily_unavailable');
    try {
      const result = await route.run(CTX, {});
      expect(result).toEqual({ success: false, action: route.action, message: route.failure, error: 'relation "project_memory_entries" does not exist' });
      expect(h.errors.map(error => error.code)).toEqual(['42P01']);
    } finally {
      await pg.exec('ALTER TABLE memory_temporarily_unavailable RENAME TO project_memory_entries');
    }
  });

  it.each(ROUTES)('$key reports a real column error through its existing catch', async route => {
    await pg.exec('ALTER TABLE project_memory_entries RENAME COLUMN content TO content_temporarily_unavailable');
    try {
      const result = await route.run(CTX, {});
      expect(result).toEqual({ success: false, action: route.action, message: route.failure, error: 'column "content" does not exist' });
      expect(h.errors.map(error => error.code)).toEqual(['42703']);
    } finally {
      await pg.exec('ALTER TABLE project_memory_entries RENAME COLUMN content_temporarily_unavailable TO content');
    }
  });
});
