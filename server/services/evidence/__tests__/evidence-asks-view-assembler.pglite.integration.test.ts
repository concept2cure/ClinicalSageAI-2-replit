/**
 * assembleOrgEvidenceAsks — END-TO-END against in-process PGlite.
 *
 * Proves the GA read: real AI-trace-chain rows (ai_retrieval_runs + chunks + linked
 * generation runs — what POST /api/evidence/ask persists) assemble into the Evidence
 * surface's ask view: question + rank-ordered chunks, pedigree derived from a linked
 * generation run, answer honestly null (only its hash is retained), strict org scope.
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

import { assembleOrgEvidenceAsks } from '../evidence-asks-view-assembler';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE ai_retrieval_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id int, query_text text, created_at timestamptz DEFAULT now());
CREATE TABLE ai_retrieval_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), retrieval_run_id uuid, rank int, title text, excerpt_preview text, score numeric(6,4));
CREATE TABLE ai_generation_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), retrieval_run_id uuid, model text, created_at timestamptz DEFAULT now());
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM ai_generation_runs; DELETE FROM ai_retrieval_chunks; DELETE FROM ai_retrieval_runs;`); });

async function ask(org: number, q: string, at: string): Promise<string> {
  const r = await pglite.query(
    `INSERT INTO ai_retrieval_runs (organization_id, query_text, created_at) VALUES ($1,$2,$3) RETURNING id`,
    [org, q, at],
  );
  return (r.rows[0] as { id: string }).id;
}

describe('assembleOrgEvidenceAsks', () => {
  it('assembles real asks: question, ranked chunks, generation-linked pedigree, honest nulls', async () => {
    const a1 = await ask(ORG, 'What did the pivotal show on ORR?', '2026-07-01T10:00:00Z');
    await pglite.query(`INSERT INTO ai_retrieval_chunks (retrieval_run_id, rank, title, excerpt_preview, score) VALUES ($1,2,'CSR BX204-301','…ORR 38.6%…',0.81),($1,1,'Protocol BX204-301','…primary endpoint ORR…',0.92)`, [a1]);
    await pglite.query(`INSERT INTO ai_generation_runs (retrieval_run_id, model) VALUES ($1,'claude-sonnet-5')`, [a1]);
    const a2 = await ask(ORG, 'List open CMC comparability items', '2026-07-02T10:00:00Z');

    const asks = await assembleOrgEvidenceAsks(ORG);
    expect(asks.map((a) => a.question)).toEqual(['List open CMC comparability items', 'What did the pivotal show on ORR?']); // newest first
    const grounded = asks[1];
    expect(grounded.chunks.map((c) => c.n)).toEqual([1, 2]);            // rank-ordered
    expect(grounded.chunks[0]).toMatchObject({ doc: 'Protocol BX204-301', sim: 0.92, page: null });
    expect(grounded.pedigree).toBe('model_assisted');                    // linked generation run
    expect(grounded.model).toBe('claude-sonnet-5');
    expect(grounded.answer).toBeNull();                                  // only the hash is retained
    expect(grounded.answerRetained).toBe(false);
    expect(grounded.cites).toEqual([]);
    expect(asks[0].pedigree).toBe('deterministic_query');                // no generation linked
    expect(asks[0].chunks).toEqual([]);
    expect(a2).toBeTruthy();
  });

  it('returns [] for an org with no asks, and never crosses tenants', async () => {
    await ask(ORG, 'mine', '2026-07-01T10:00:00Z');
    expect(await assembleOrgEvidenceAsks(OTHER)).toEqual([]);
  });
});
