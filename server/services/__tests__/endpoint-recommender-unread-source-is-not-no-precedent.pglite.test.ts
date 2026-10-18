/**
 * The endpoint recommender says which of its sources it read. A source it could
 * not read is never reported as a source that found nothing.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * getComprehensiveEndpointRecommendations consulted four sources, and each one
 * caught its own failure and returned an empty answer: the CSR corpus read
 * (`return []`), the literature search (every failed term logged "Generating
 * local response from CSR data..." and generated nothing; then `return []`), the
 * regulatory guidance lookup (`return {}`) and the language model (`return []`).
 * So an unreadable corpus read as "no CSR precedent for this indication", the
 * model backfilled the gap with its own endpoints, and the caller got HTTP 200
 * with nothing saying the corpus was never read. If every stage failed, the
 * answer was an empty list.
 *
 * The corpus read also failed whenever two or more reports matched. It selected
 * their details with sql`report_id IN (${ids.join(',')})`: one bound text
 * parameter, '1,2,3', compared with an integer column, which Postgres refuses.
 * The catch then turned every well-covered indication into "no precedent" as well.
 *
 * Real Postgres (PGlite) holds the corpus. The model and the literature search
 * are injected doubles.
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

import { EndpointRecommenderService } from '../endpoint-recommender-service';

const NSCLC = 'Non-small cell lung cancer';

/** CREATE TABLE from the drizzle definition: column names and types. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

async function seedCorpus(pg: PGlite): Promise<void> {
  await pg.exec(ddlOf(csrReports as PgTable));
  await pg.exec(ddlOf(csrDetails as PgTable));
  const reports: Array<[number, string, string, string]> = [
    [1, 'Acme Oncology', NSCLC, 'Phase 3'],
    [2, 'Beta Pharma', NSCLC, 'Phase 3'],
    [3, 'Gamma Bio', NSCLC, 'Phase 3'],
    [4, 'Delta Health', 'Breast cancer', 'Phase 2'],
  ];
  for (const [id, sponsor, indication, phase] of reports) {
    await pg.query(
      `INSERT INTO csr_reports (id, organization_id, report_id, report_title, title, sponsor, indication, phase)
       VALUES ($1, 7, $2, $3, $3, $4, $5, $6)`,
      [id, `CSR-${id}`, `Study ${id}`, sponsor, indication, phase],
    );
  }
  const details: Array<[number, object]> = [
    [1, { primary: ['Overall survival'], secondary: ['Objective response rate'] }],
    [2, { primary: ['Overall survival'], secondary: [] }],
    [3, { primary: ['Overall survival'], secondary: ['Objective response rate'] }],
    [4, { primary: ['Pathological complete response'], secondary: [] }],
  ];
  for (const [reportId, endpoints] of details) {
    await pg.query(`INSERT INTO csr_details (report_id, endpoints) VALUES ($1, $2::json)`, [
      reportId,
      JSON.stringify(endpoints),
    ]);
  }
}

function serviceWithModel(answer: () => Promise<string>) {
  const hf = { queryHuggingFace: vi.fn(answer) };
  return { hf, svc: new EndpointRecommenderService(hf as never) };
}

/** The recommendations, whichever shape the service answers in. */
function recsOf(result: unknown): Array<{ endpoint: string; occurrence_count: number }> {
  return (Array.isArray(result) ? result : (result as { recommendations: [] }).recommendations) ?? [];
}

let corpusDb: unknown;

beforeAll(async () => {
  holder.pg = new PGlite();
  await seedCorpus(holder.pg);
  corpusDb = drizzle(holder.pg);
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

beforeEach(() => {
  holder.db = corpusDb;
  academic.searchAcademicKnowledge.mockReset();
  academic.searchAcademicKnowledge.mockResolvedValue([]);
  academic.getRecentlyProcessedDocuments.mockReturnValue([{ id: 'doc-1' }]); // a loaded literature store
});

describe('endpoint recommender: the CSR corpus is read, or the answer says it was not', () => {
  it('reads the corpus across every matching report, not only when exactly one matches', async () => {
    const { svc } = serviceWithModel(async () => '[]');

    const result = await svc.getComprehensiveEndpointRecommendations(NSCLC, 'Phase 3', 2);

    const os = recsOf(result).find((r) => r.endpoint === 'Overall survival');
    expect(recsOf(result).map((r) => r.endpoint)).toContain('Overall survival');
    expect(os?.occurrence_count).toBe(3);
  });

  it('refuses to recommend from a corpus it could not read, instead of answering from the model', async () => {
    const empty = new PGlite(); // no csr_reports relation: the read fails as it would on a broken store
    holder.db = drizzle(empty);
    const { svc, hf } = serviceWithModel(
      async () => '["Overall survival at 24 months", "Progression-free survival per RECIST 1.1"]',
    );

    try {
      await expect(svc.getComprehensiveEndpointRecommendations(NSCLC, 'Phase 3', 5)).rejects.toMatchObject({
        name: 'EndpointCorpusUnavailableError',
        unavailable: ['csr_corpus'],
      });
      // No backfill for a gap nobody measured.
      expect(hf.queryHuggingFace).not.toHaveBeenCalled();
    } finally {
      await empty.close();
    }
  });

  it('says when it read only the first 100 matching reports, instead of counting over them silently', async () => {
    await holder.pg.exec(`
      INSERT INTO csr_reports (id, organization_id, report_id, report_title, sponsor, indication, phase)
        SELECT g, 7, 'HTN-' || g, 'Study ' || g, 'Sponsor ' || g, 'Hypertension', 'Phase 3'
        FROM generate_series(1001, 1101) AS g;
      INSERT INTO csr_details (report_id, endpoints)
        SELECT g, '{"primary": ["Change in seated systolic blood pressure"], "secondary": []}'::json
        FROM generate_series(1001, 1101) AS g;`);
    const { svc } = serviceWithModel(async () => '[]');

    const result = await svc.getComprehensiveEndpointRecommendations('Hypertension', 'Phase 3', 1);

    expect(recsOf(result)[0]?.occurrence_count).toBe(100);
    expect((result as { sources?: Record<string, unknown> }).sources?.csr_corpus).toEqual({
      status: 'read',
      detail: 'the first 100 by id of more than 100 matching CSR reports, 100 with endpoints recorded',
    });
  });

  it('reports no matching reports as no_matches, which is a different fact from unreadable', async () => {
    const { svc } = serviceWithModel(async () => '[]');

    const result = await svc.getComprehensiveEndpointRecommendations('Fabry disease', '', 3);

    expect((result as { sources?: unknown }).sources).toMatchObject({ csr_corpus: { status: 'no_matches' } });
  });
});

describe('endpoint recommender: a supplementary source that fails is reported, not hidden', () => {
  it('reports a failed literature search as unavailable, not as "no literature"', async () => {
    academic.searchAcademicKnowledge.mockRejectedValue(new Error('embedding service down'));
    const { svc } = serviceWithModel(async () => '[]');

    const result = await svc.getComprehensiveEndpointRecommendations(NSCLC, 'Phase 3', 2);

    expect((result as { sources?: Record<string, unknown> }).sources?.academic_literature).toEqual({
      status: 'unavailable',
      detail: 'the literature search failed',
    });
    // The corpus was read, so its endpoints still stand.
    expect(recsOf(result).map((r) => r.endpoint)).toContain('Overall survival');
  });

  it('reports an empty literature store as unavailable, not as a search that found nothing', async () => {
    academic.getRecentlyProcessedDocuments.mockReturnValue([]);
    const { svc } = serviceWithModel(async () => '[]');

    const result = await svc.getComprehensiveEndpointRecommendations(NSCLC, 'Phase 3', 2);

    expect((result as { sources?: Record<string, unknown> }).sources?.academic_literature).toEqual({
      status: 'unavailable',
      detail: 'no literature is loaded',
    });
    expect(academic.searchAcademicKnowledge).not.toHaveBeenCalled();
  });

  it('reports a failed model request as unavailable, not as "the model proposed nothing"', async () => {
    const { svc } = serviceWithModel(async () => {
      throw new Error('AI gateway unavailable');
    });

    const result = await svc.getComprehensiveEndpointRecommendations('Fabry disease', '', 3);

    expect(recsOf(result)).toEqual([]);
    expect((result as { sources?: Record<string, { status: string }> }).sources?.language_model?.status).toBe(
      'unavailable',
    );
  });

  it('does not turn a model reply that is not a list of endpoints into endpoints', async () => {
    const { svc } = serviceWithModel(async () => 'Sure! Here are some endpoints:\n1. Overall survival');

    const result = await svc.getComprehensiveEndpointRecommendations('Fabry disease', '', 3);

    expect(recsOf(result).map((r) => r.endpoint)).not.toContain('Sure! Here are some endpoints:');
    expect((result as { sources?: Record<string, { status: string }> }).sources?.language_model?.status).toBe(
      'unavailable',
    );
  });

  it('says the model was not consulted when the corpus supplied what was asked', async () => {
    const { svc, hf } = serviceWithModel(async () => '["Anything"]');

    const result = await svc.getComprehensiveEndpointRecommendations(NSCLC, 'Phase 3', 2);

    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
    expect((result as { sources?: Record<string, { status: string }> }).sources?.language_model?.status).toBe(
      'not_queried',
    );
  });

  it('reports regulatory guidance as unavailable when no guidance source is loaded, not as none issued', async () => {
    const { svc } = serviceWithModel(async () => '[]');

    const result = await svc.getComprehensiveEndpointRecommendations(NSCLC, 'Phase 3', 2);

    expect((result as { sources?: Record<string, unknown> }).sources?.regulatory_guidance).toEqual({
      status: 'unavailable',
      detail: 'no regulatory guidance source is loaded',
    });
  });
});
