import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  query: vi.fn(),
  failClaimsPrimary: false,
  errors: [] as Array<{ sql: string; code?: string }>,
  results: [] as Array<{ sql: string; args: unknown[]; rows: Array<Record<string, unknown>> }>,
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: async () => null }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: async () => '' }));

import { enrichContextForChat } from '../context-enrichment';

let pg: PGlite;
const INPUT = { projectId: 42, project: { status: 'linked', id: 42 } as const, organizationId: 7 };
const ROUTES = [
  { command: 'precedent', category: 'precedent_analysis', heading: 'PROJECT PRECEDENT INTELLIGENCE', limit: 12 },
  { command: 'claims', category: 'claim_evidence_map', heading: 'Evidence & Claims Analysis', limit: 8 },
  { command: 'knowledge', category: 'strategy', heading: 'Knowledge Base Search Results', limit: 10 },
  { command: 'safety', category: 'safety_narrative', heading: 'Safety Intelligence', limit: 5 },
];
const INACTIVE = ['pending_review', 'superseded', 'archived', 'rejected', null, 'unknown-status'];

beforeAll(async () => {
  // Pin the reader-facing column names to the canonical Drizzle creator, not
  // the legacy names imagined by the broken statements. No extension/FK is
  // needed to execute these four real SELECTs against their table columns.
  const source = readFileSync(new URL('../../../../shared/schema.ts', import.meta.url), 'utf8');
  const shape = source.slice(source.indexOf('export const projectMemoryEntries = pgTable('));
  const table = shape.slice(0, shape.indexOf('\n);'));
  expect(table).toContain("confidenceScore: real('confidence_score')");
  expect(table).toContain("importanceLevel: text('importance_level')");
  expect(table).toContain("status: text('status').default('active')");
  expect(table).not.toMatch(/(?:real|text)\('(?:confidence|importance)'\)/);
  pg = new PGlite();
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
  h.failClaimsPrimary = false;
  h.errors = []; h.results = [];
  h.query.mockReset().mockImplementation(async (sql: string, args: unknown[] = []) => {
    try {
      if (h.failClaimsPrimary && args.length === 3 && args[2] === 8) {
        h.failClaimsPrimary = false;
        throw Object.assign(new Error('forced claims primary failure'), { code: '57P01' });
      }
      const result = await pg.query<Record<string, unknown>>(sql, args);
      h.results.push({ sql, args, rows: result.rows });
      return { rows: result.rows };
    } catch (error) {
      h.errors.push({ sql, code: (error as { code?: string }).code });
      throw error;
    }
  });
});

type MemoryRow = {
  title: string; category: string; projectId?: number; organizationId?: number;
  confidence?: number | null; importance?: string | null; status?: string | null; createdAt?: string;
};
async function seed(row: MemoryRow) {
  const { title, category, projectId = 42, organizationId = 7, confidence = 0.9, importance = 'medium', status = 'active', createdAt = '2026-10-01T00:00:00Z' } = row;
  await pg.query(`INSERT INTO project_memory_entries
    (project_id, organization_id, category, title, content, confidence_score, importance_level, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [projectId, organizationId, category, title, `${title} body`, confidence, importance, status, createdAt]);
}
const recall = (command: string) => enrichContextForChat({ ...INPUT, message: `/${command}` });
const titles = (rows: Array<Record<string, unknown>>) => rows.map(row => row.title);
const exactHealthyBlocks: Record<string, string> = {
  precedent: '\n\n## PROJECT PRECEDENT INTELLIGENCE\nIdentified precedents and comparators. Reference these for similar products/devices.\n\n### Regulatory Precedent Analysis\n- **Active record** [90% confidence]: Active record body',
  claims: '\n\n## Evidence & Claims Analysis\n**Evidence Chain Strength:** moderate | **Confidence:** 66/100\n**Factors:** evidenceCount: 1, averageRelevance: 0.9, hasRegulatoryReference: false, hasUserVerification: false, recency: recent\n\n**Evidence Entries:**\n- **Active record** [90%]: Active record body\n\nAnalyze the strength of evidence chains. Flag any claims with weak or missing evidence support.',
  knowledge: '\n\n## Knowledge Base Search Results\n**1 entries** found in project knowledge.\n\n- **Active record** [strategy] (90%): Active record body\n\nReference these knowledge atoms when answering. Cite the category and confidence level.',
  safety: '\n\n## Safety Intelligence\nProject-specific safety data. Reference directly in your response.\n- **Active record** [90% confidence]: Active record body',
};

describe('structured readers execute canonical columns and retain their healthy format', () => {
  it.each(ROUTES)('/$command returns its primary heading and confidence from canonical columns', async route => {
    await seed({ title: 'Active record', category: route.category });
    const result = await recall(route.command);
    expect(result.block).toBe(exactHealthyBlocks[route.command]);
    expect(result.sources).toEqual([route.command]);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    expect(h.errors).toEqual([]);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.results[0].rows[0][route.command === 'safety' ? 'confidence_score' : 'confidence']).toBeCloseTo(0.9);
    expect(h.results[0].args.slice(0, 2)).toEqual([42, 7]);
  });

  it.each(ROUTES)('/$command preserves the existing zero-confidence handling', async route => {
    await seed({ title: 'Zero confidence', category: route.category, confidence: 0 });
    const { block } = await recall(route.command);
    expect(block).toContain(`## ${route.heading}`);
    expect(block).not.toContain('[0%');
    expect(block).not.toContain('(0%)');
    if (route.command === 'claims') {
      expect(block).toContain('**Confidence:** 58/100');
      expect(block).toContain('averageRelevance: 0.5');
      expect(block).toContain('**Zero confidence** [—]');
    }
  });
});

describe('all four selectors order severity and preserve existing limits', () => {
  it.each(ROUTES)('/$command ranks severity case-insensitively, then newest first, with null/unknown last', async route => {
    const rows = [
      { title: 'Medium', importance: 'medium', createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Unknown new', importance: 'urgent', createdAt: '2026-10-05T00:00:00Z' },
      { title: 'Critical old', importance: 'CRITICAL', createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Null old', importance: null, createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Low', importance: 'low', createdAt: '2026-10-03T00:00:00Z' },
      { title: 'High', importance: 'HiGh', createdAt: '2026-10-01T00:00:00Z' },
      { title: 'Critical new', importance: 'critical', createdAt: '2026-10-02T00:00:00Z' },
    ];
    for (const row of rows) await seed({ category: route.category, ...row });
    const { block } = await recall(route.command);
    const expected = ['Critical new', 'Critical old', 'High', 'Medium', 'Low', 'Unknown new', 'Null old'].slice(0, route.limit);
    expect(titles(h.results[0].rows)).toEqual(expected);
    expect(block.indexOf('Critical new')).toBeLessThan(block.indexOf('Critical old'));
    expect(block.indexOf('Critical old')).toBeLessThan(block.indexOf('High'));
    expect(block.indexOf('High')).toBeLessThan(block.indexOf('Medium'));
    expect(h.errors).toEqual([]);
  });

  it.each(ROUTES)('/$command applies its SQL limit and the existing per-category rendering cap', async route => {
    for (let index = 0; index < route.limit + 3; index++) {
      await seed({ title: `Limit ${String(index).padStart(2, '0')}`, category: route.category, importance: 'critical', createdAt: `2026-10-01T00:00:${String(index).padStart(2, '0')}Z` });
    }
    const { block } = await recall(route.command);
    expect(h.results[0].rows).toHaveLength(route.limit);
    expect(h.results[0].args.at(-1)).toBe(route.limit);
    expect(block.match(/^- \*\*Limit /gm)).toHaveLength(route.command === 'precedent' ? 4 : route.limit);
    expect(block).not.toContain('**Limit 00**');
  });

  it.each([
    { command: 'precedent', categories: ['precedent_analysis', 'competitive_intelligence', 'predicate_device'] },
    { command: 'claims', categories: ['evidence_assessment', 'claim_evidence_map', 'evidence_gap'] },
    { command: 'safety', categories: ['safety_narrative', 'adverse_event_summary', 'benefit_risk', 'safety_signal'] },
  ])('/$command retains its existing category set', async ({ command, categories }) => {
    for (const category of categories) await seed({ title: `Allowed ${category}`, category });
    await seed({ title: 'Excluded category', category: 'not-an-allowed-category', importance: 'critical' });
    const { block } = await recall(command);
    expect(h.results[0].rows).toHaveLength(categories.length);
    for (const category of categories) expect(block).toContain(`Allowed ${category}`);
    expect(block).not.toContain('Excluded category');
  });
});

describe('active-only recall excludes quarantined and retired records', () => {
  it.each(ROUTES)('/$command exposes only active rows despite higher-severity inactive rows', async route => {
    await seed({ title: 'Active record', category: route.category, importance: 'low' });
    for (const status of INACTIVE) await seed({ title: `Inactive ${String(status)}`, category: route.category, status, importance: 'critical' });
    const result = await recall(route.command);
    expect(result.block).toContain('Active record');
    expect(titles(h.results[0].rows)).toEqual(['Active record']);
    for (const status of INACTIVE) expect(result.block).not.toContain(`Inactive ${String(status)}`);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
  });

  it.each(ROUTES)('/$command treats an inactive-only result as its original healthy empty', async route => {
    for (const status of INACTIVE) await seed({ title: `Inactive ${String(status)}`, category: route.category, status });
    const result = await recall(route.command);
    expect(h.results.every(read => read.rows.length === 0)).toBe(true);
    expect(result.block).not.toContain('Inactive');
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    if (route.command === 'safety') expect(result.block).toContain('No safety data found for this project yet');
    else expect(result.block).toBe('');
  });

  it('keeps active-only claims fallback with its original five-row limit when the primary read fails', async () => {
    for (let index = 0; index < 7; index++) await seed({ title: `Fallback active ${index}`, category: 'claim_evidence_map', importance: 'high' });
    for (const status of INACTIVE) await seed({ title: `Fallback inactive ${String(status)}`, category: 'claim_evidence_map', status, importance: 'critical' });
    h.failClaimsPrimary = true;
    const result = await recall('claims');
    expect(result.block).toContain('## Claims & Evidence Intelligence');
    expect(result.block).not.toContain('## Evidence & Claims Analysis');
    expect(result.block).not.toContain('Fallback inactive');
    expect(h.errors.map(error => error.code)).toEqual(['57P01']);
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.results[0].rows).toHaveLength(5);
    expect(h.results[0].args).toEqual([42, 7, 'evidence_assessment', 'claim_evidence_map', 'evidence_gap', 5]);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
  });
});

describe('empty, missing-table, and real SQL errors preserve their original contracts', () => {
  it.each(ROUTES)('/$command keeps healthy empty results distinct from failed reads', async route => {
    const result = await recall(route.command);
    expect(h.errors).toEqual([]);
    expect(h.query).toHaveBeenCalledTimes(route.command === 'claims' ? 2 : 1);
    expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
    if (route.command === 'safety') expect(result.block).toContain('No safety data found for this project yet');
    else expect(result.block).toBe('');
  });

  it.each(ROUTES)('/$command retains the legitimately missing-table empty behavior', async route => {
    await pg.exec('ALTER TABLE project_memory_entries RENAME TO memory_temporarily_unavailable');
    try {
      const result = await recall(route.command);
      expect(h.errors.length).toBeGreaterThan(0);
      expect(h.errors.every(error => error.code === '42P01')).toBe(true);
      expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
      if (route.command === 'safety') expect(result.block).toContain('No safety data found for this project yet');
      else expect(result.block).toBe('');
    } finally {
      await pg.exec('ALTER TABLE memory_temporarily_unavailable RENAME TO project_memory_entries');
    }
  });

  it.each(ROUTES)('/$command keeps existing failure reporting on a real non-missing-table SQL error', async route => {
    await pg.exec('ALTER TABLE project_memory_entries RENAME COLUMN content TO content_temporarily_unavailable');
    try {
      const result = await recall(route.command);
      expect(h.errors.every(error => error.code === '42703')).toBe(true);
      expect(h.errors.length).toBeGreaterThan(0);
      if (route.command === 'safety') {
        expect(result.enrichmentMeta?.unavailableSources).toEqual(['safety']);
        expect(result.enrichmentMeta?.unavailableReasons).toEqual({ safety: 'error' });
        expect(result.block).not.toContain('No safety data found');
      } else {
        expect(result.enrichmentMeta?.unavailableSources).toEqual([]);
        expect(result.block).toBe('');
      }
    } finally {
      await pg.exec('ALTER TABLE project_memory_entries RENAME COLUMN content_temporarily_unavailable TO content');
    }
  });
});

describe('recall retains tenant, project, and public-entry guards', () => {
  it.each(ROUTES)('/$command excludes another tenant and another project', async route => {
    await seed({ title: 'Own record', category: route.category });
    await seed({ title: 'Other tenant', category: route.category, organizationId: 8, importance: 'critical' });
    await seed({ title: 'Other project', category: route.category, projectId: 43, importance: 'critical' });
    const result = await recall(route.command);
    expect(result.block).toContain('Own record');
    expect(result.block).not.toContain('Other tenant');
    expect(result.block).not.toContain('Other project');
    expect(h.results[0].args.slice(0, 2)).toEqual([42, 7]);
  });

  it.each(ROUTES)('/$command reads no project memory without an organization or project', async route => {
    await enrichContextForChat({ message: `/${route.command}` });
    await enrichContextForChat({ ...INPUT, organizationId: undefined, message: `/${route.command}` });
    expect(h.query).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('/$command uses the linked integer project for a caller-resolved program UUID', async route => {
    await seed({ title: 'Linked project record', category: route.category });
    const result = await enrichContextForChat({ ...INPUT, projectId: 'd6160c9f-33d2-4be9-b779-eb27375f6e49', message: `/${route.command}` });
    expect(result.block).toContain('Linked project record');
    expect(h.results[0].args.slice(0, 2)).toEqual([42, 7]);
  });

  it.each(['none', 'unresolved'] as const)('reads no memory for a %s project resolution', async status => {
    const project = status === 'none' ? { status } : { status, reason: 'error' as const };
    for (const route of ROUTES) {
      const result = await enrichContextForChat({ ...INPUT, project, message: `/${route.command}` });
      expect(result.block).not.toContain('No safety data found');
      if (status === 'unresolved') expect(result.enrichmentMeta?.unavailableSources).toEqual(['project-record']);
    }
    expect(h.query).not.toHaveBeenCalled();
  });
});
