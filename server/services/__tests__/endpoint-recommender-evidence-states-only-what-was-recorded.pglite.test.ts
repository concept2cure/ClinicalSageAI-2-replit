/**
 * Endpoint evidence states what was recorded and nothing else: no constant
 * "confidence", no trial status nobody recorded, no publication year nobody
 * read, and no claim of an analysis that did not happen.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 *   - Every CSR evidence item carried `confidence: 0.9`, every literature item
 *     `confidence: result.relevance || 0.8` (a real relevance of 0 became 0.8),
 *     and every model suggestion `confidence: 0.7`. No computation produced
 *     those numbers.
 *   - csr_reports has no outcome column, so every CSR line read
 *     "<sponsor> trial (<phase>): Completed", a trial status nobody recorded.
 *   - The literature search returns no year and no authors, so every reference
 *     read year "Recent" with `authors: []`, which says "no authors".
 *   - A model-suggested endpoint was filed as `source_type: 'academic'` and said
 *     "Based on analysis of similar trial endpoints for <indication>". No analysis
 *     happened: the prompt asks the model to "Generate N evidence-based primary
 *     endpoints".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { csrReports, csrDetails } from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({ get db() { return holder.db; } }));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
const academic = vi.hoisted(() => ({ searchAcademicKnowledge: vi.fn(), getRecentlyProcessedDocuments: vi.fn() }));
vi.mock('../academic-document-processor', () => ({ academicDocumentProcessor: academic }));
vi.mock('../../huggingface-service', () => ({ huggingFaceService: { queryHuggingFace: vi.fn() } }));

import { EndpointRecommenderService, type EndpointRecommendation } from '../endpoint-recommender-service';

/** The organization the corpus is seeded under; the recommender reads only its own. */
const ORG = 7;

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

function serviceWithModel(answer: string) {
  return new EndpointRecommenderService({ queryHuggingFace: async () => answer } as never);
}

function recsOf(result: unknown): EndpointRecommendation[] {
  return (Array.isArray(result) ? result : (result as { recommendations: [] }).recommendations) ?? [];
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(ddlOf(csrReports as PgTable));
  await holder.pg.exec(ddlOf(csrDetails as PgTable));
  // One matching report, so the corpus read worked even before 2026-10-15.
  await holder.pg.query(
    `INSERT INTO csr_reports (id, organization_id, report_id, report_title, title, sponsor, indication, phase)
     VALUES (1, 7, 'CSR-1', 'Study 1', 'Study 1', 'Acme Oncology', 'Non-small cell lung cancer', 'Phase 3')`,
  );
  await holder.pg.query(`INSERT INTO csr_details (report_id, endpoints) VALUES (1, $1::json)`, [
    JSON.stringify({ primary: ['Overall survival'], secondary: [] }),
  ]);
  holder.db = drizzle(holder.pg);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

beforeEach(() => {
  academic.searchAcademicKnowledge.mockReset();
  academic.searchAcademicKnowledge.mockResolvedValue([]);
  academic.getRecentlyProcessedDocuments.mockReturnValue([{ id: 'doc-1' }]); // a loaded literature store
});

describe('CSR evidence', () => {
  it('says the outcome was not recorded, instead of "Completed", and carries no invented confidence', async () => {
    const result = await serviceWithModel('[]').getComprehensiveEndpointRecommendations(
      ORG,
      'Non-small cell lung cancer',
      'Phase 3',
      1,
    );

    const evidence = recsOf(result).find((r) => r.endpoint === 'Overall survival')?.evidence[0];
    expect(evidence?.reference_text).not.toContain('Completed');
    expect(evidence?.reference_text).toBe('Acme Oncology trial (Phase 3): outcome not recorded');
    expect(evidence?.confidence).toBeNull();
  });
});

describe('model-suggested endpoints', () => {
  it('are labelled as model output, claim no analysis, and carry no invented confidence', async () => {
    const result = await serviceWithModel('["Change from baseline in 6-minute walk distance at week 24"]')
      .getComprehensiveEndpointRecommendations(ORG, 'Fabry disease', '', 1);

    const evidence = recsOf(result)[0]?.evidence[0];
    expect(evidence?.reference_text).not.toMatch(/analysis/i);
    expect(evidence?.source_type).toBe('language_model');
    expect(evidence?.confidence).toBeNull();
  });
});

describe('literature evidence', () => {
  it("keeps the search's own relevance, even 0, and invents no year, authors or publication", async () => {
    academic.searchAcademicKnowledge.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Endpoints in Fabry disease trials',
        type: 'paper',
        source: '',
        relevance: 0,
        summary: '',
        context: 'The primary endpoint was the change in plasma lyso-Gb3 at month 12 in treated adults.',
      },
    ]);

    const result = await serviceWithModel('[]').getComprehensiveEndpointRecommendations(ORG, 'Fabry disease', '', 1);

    const rec = recsOf(result)[0];
    expect(rec?.evidence[0]).toMatchObject({ source_type: 'academic', confidence: null, retrieval_score: 0 });
    expect(rec?.academic_references?.[0]).toMatchObject({ year: null, authors: null, publication: null });
  });
});
