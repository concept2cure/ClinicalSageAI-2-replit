/**
 * Endpoint evaluation takes no score from a language model. The model narrates;
 * CSR precedent comes from the corpus, or the evaluation fails and says so.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * evaluateEndpoint asked the model for "score: A number from 0-100 representing
 * quality" and returned whatever number came back, with no rubric and no range
 * check: 250 or -3 passed. The AnA command evaluate_endpoint reported it as
 * `Endpoint "X" scored N/100`. CLAUDE.md Rule 2 calls this a defect: a tool that
 * asks a model for a figure.
 *
 * Its "similar endpoints" came from jsonb_array_elements_text(endpoints->>'primary').
 * That is a jsonb function applied to text read from a json column, and Postgres
 * refuses it. The catch returned [], so every evaluation reported no similar CSR
 * endpoint without reading one. A failed model call also came back as a
 * successful evaluation whose feedback was "An error occurred during evaluation".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { csrReports, csrDetails } from '../../../shared/schema';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({ get db() { return holder.db; } }));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../academic-document-processor', () => ({
  academicDocumentProcessor: { searchAcademicKnowledge: vi.fn(async () => []) },
}));
vi.mock('../../huggingface-service', () => ({ huggingFaceService: { queryHuggingFace: vi.fn() } }));

import { EndpointRecommenderService } from '../endpoint-recommender-service';

const NSCLC = 'Non-small cell lung cancer';
const SCORED = '{"score": 250, "feedback": "Clear, measurable and clinically meaningful."}';

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

function serviceWithModel(answer: () => Promise<string>) {
  const prompts: string[] = [];
  const hf = {
    queryHuggingFace: async (prompt: string) => {
      prompts.push(prompt);
      return answer();
    },
  };
  return { prompts, svc: new EndpointRecommenderService(hf as never) };
}

let corpusDb: unknown;

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(ddlOf(csrReports as PgTable));
  await holder.pg.exec(ddlOf(csrDetails as PgTable));
  for (const [id, primary] of [
    [1, ['Overall survival']],
    [2, ['Progression-free survival per RECIST 1.1']],
    [3, ['Overall survival']],
  ] as Array<[number, string[]]>) {
    await holder.pg.query(
      `INSERT INTO csr_reports (id, organization_id, report_id, report_title, title, sponsor, indication, phase)
       VALUES ($1, 7, $2, $2, $2, 'Acme Oncology', $3, 'Phase 3')`,
      [id, `CSR-${id}`, NSCLC],
    );
    await holder.pg.query(`INSERT INTO csr_details (report_id, endpoints) VALUES ($1, $2::json)`, [
      id,
      JSON.stringify({ primary, secondary: [] }),
    ]);
  }
  corpusDb = drizzle(holder.pg);
  holder.db = corpusDb;
}, 60_000);

afterAll(async () => {
  await holder.pg?.close();
});

describe('endpoint evaluation: no figure from a model', () => {
  it("does not report the number the model typed as the endpoint's score", async () => {
    const { svc } = serviceWithModel(async () => SCORED);

    const evaluation = await svc.evaluateEndpoint('Overall survival at 24 months', NSCLC, 'Phase 3');

    expect(evaluation.score).toBeNull();
  });

  it('does not ask the model for a score', async () => {
    const { svc, prompts } = serviceWithModel(async () => 'Specific and measurable; name the analysis population.');

    await svc.evaluateEndpoint('Overall survival at 24 months', NSCLC, 'Phase 3');

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toMatch(/score:|0-100/i);
  });
});

describe('endpoint evaluation: CSR precedent is read, or the evaluation fails', () => {
  it('reads similar primary endpoints from the corpus', async () => {
    const { svc } = serviceWithModel(async () => 'Commentary.');

    const evaluation = await svc.evaluateEndpoint('Overall survival at 24 months', NSCLC, 'Phase 3');

    // Both share a word with it ("overall", "survival"); the second report's repeat is not listed twice.
    expect(evaluation.similarEndpoints).toEqual(['Overall survival', 'Progression-free survival per RECIST 1.1']);
  });

  it('fails when the corpus cannot be read, instead of reporting no similar endpoints', async () => {
    const empty = new PGlite(); // no csr tables: the read fails
    holder.db = drizzle(empty);
    const { svc } = serviceWithModel(async () => 'Commentary.');

    try {
      await expect(svc.evaluateEndpoint('Overall survival at 24 months', NSCLC, 'Phase 3')).rejects.toThrow();
    } finally {
      holder.db = corpusDb;
      await empty.close();
    }
  });

  it('fails when the model request fails, instead of returning an error message as the evaluation', async () => {
    const { svc } = serviceWithModel(async () => {
      throw new Error('AI gateway unavailable');
    });

    await expect(svc.evaluateEndpoint('Overall survival at 24 months', NSCLC, 'Phase 3')).rejects.toThrow(
      'AI gateway unavailable',
    );
  });

  it('says nothing was compared when the endpoint has no word to match on, rather than "none found"', async () => {
    const { svc } = serviceWithModel(async () => 'Commentary.');

    const evaluation = await svc.evaluateEndpoint('ORR', NSCLC, 'Phase 3');

    expect(evaluation.similarEndpoints).toBeNull();
  });
});
