/**
 * The endpoint recommender reads only the calling organization's CSR corpus.
 *
 * What the code used to do (until 2026-10-15): the corpus reads behind
 * recommendations and evaluations (csr_reports by indication and phase, and
 * csr_details joined to them) had no organization predicate. They relied on row
 * level security alone, so where RLS was not enforcing — shadow mode, a role
 * that bypasses it, a connection with no tenant scope — another organization's
 * reports were counted as this one's precedent, and its endpoint wording was
 * shown as this one's "similar endpoints". The reads now bind the organization,
 * as the other csr_reports readers do.
 *
 * Real Postgres (PGlite) holds two organizations' corpora; RLS is not enabled,
 * which is the case the predicate exists for. The AnA commands are driven with
 * organization 7. The model and the literature search are doubles.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { csrReports, csrDetails } from '../../../shared/schema';

const { holder, hf, academic } = vi.hoisted(() => ({
  holder: { pg: null as any, db: null as any },
  hf: { queryHuggingFace: async () => '[]' },
  academic: { searchAcademicKnowledge: async () => [], getRecentlyProcessedDocuments: () => [] },
}));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  pool: { query: async () => ({ rows: [], rowCount: 0 }) },
  getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
  getDb: () => holder.db,
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../huggingface-service', () => ({ huggingFaceService: hf }));
vi.mock('../academic-document-processor', () => ({ academicDocumentProcessor: academic }));

import { recommendEndpoints, evaluateEndpoint } from '../ana-ri/command-executor';

const NSCLC = 'Non-small cell lung cancer';
const ctx = { userId: 41, organizationId: 7 } as Parameters<typeof recommendEndpoints>[0];

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(ddlOf(csrReports as PgTable));
  await holder.pg.exec(ddlOf(csrDetails as PgTable));
  const reports: Array<[number, number, string[]]> = [
    [1, 7, ['Overall survival']],
    [2, 7, ['Overall survival']],
    [3, 8, ['Overall survival']],
    [4, 8, ['Survival of organization eight patients at week 26']],
  ];
  for (const [id, org, primary] of reports) {
    await holder.pg.query(
      `INSERT INTO csr_reports (id, organization_id, report_id, report_title, title, sponsor, indication, phase)
       VALUES ($1, $2, $3, $3, $3, 'Sponsor', $4, 'Phase 3')`,
      [id, org, `CSR-${id}`, NSCLC],
    );
    await holder.pg.query(`INSERT INTO csr_details (report_id, endpoints) VALUES ($1, $2::json)`, [
      id,
      JSON.stringify({ primary, secondary: [] }),
    ]);
  }
  holder.db = drizzle(holder.pg);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

describe("the endpoint commands read the caller's corpus only", () => {
  it("recommend_endpoints counts this organization's reports, not another's", async () => {
    const result = await recommendEndpoints(ctx, { indication: NSCLC, phase: 'Phase 3', count: 5 });

    expect(result.success).toBe(true);
    const recs = (result.data as { recommendations: Array<{ endpoint: string; occurrence_count: number }> })
      .recommendations;
    expect(recs.map((r) => r.endpoint)).toEqual(['Overall survival']);
    expect(recs[0].occurrence_count).toBe(2);
    const sources = (result.data as { sources: { csr_corpus: { detail: string } } }).sources;
    expect(sources.csr_corpus.detail).toContain('2 matching CSR report(s)');
  });

  it("evaluate_endpoint compares against this organization's primary endpoints only", async () => {
    const result = await evaluateEndpoint(ctx, { endpoint: 'Survival at week 26', indication: NSCLC });

    expect(result.success).toBe(true);
    const evaluation = (result.data as { evaluation: { similarEndpoints: string[] | null } }).evaluation;
    expect(evaluation.similarEndpoints).toEqual(['Overall survival']);
  });
});
