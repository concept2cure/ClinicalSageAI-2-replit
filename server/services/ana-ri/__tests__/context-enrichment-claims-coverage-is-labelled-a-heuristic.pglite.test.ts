/**
 * The claims block labels its evidence figure as what it is: a heuristic
 * coverage figure, not a confidence.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * claimsEvidenceBlock printed computeConfidence() as "**Confidence:** NN/100".
 * computeConfidence is base 40, plus up to 25 for the number of entries, plus
 * 20 × their mean recorded confidence, plus 10 for a regulatory reference or a
 * user verification, ± recency — a heuristic over the entries, which AnA was
 * handed as the confidence of the evidence chain.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../intelligence/project-intelligence-service.js', () => ({ getProjectIntelligence: async () => null }));
vi.mock('../workflow-orchestration.js', () => ({ buildWorkflowContext: async () => '' }));

import { enrichContextForChat } from '../context-enrichment';

let pg: PGlite;
const INPUT = { projectId: 42, project: { status: 'linked', id: 42 } as const, organizationId: 7 };
const recall = async (command: string) => (await enrichContextForChat({ ...INPUT, message: `/${command}` })).block;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE project_memory_entries (
    id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL,
    category text NOT NULL, title text NOT NULL, content text NOT NULL,
    confidence_score real, importance_level text DEFAULT 'medium',
    status text DEFAULT 'active', created_at timestamp NOT NULL DEFAULT now()
  )`);
});
afterAll(async () => { await pg?.close(); });

beforeEach(async () => {
  await pg.exec('TRUNCATE project_memory_entries RESTART IDENTITY');
  h.query.mockReset().mockImplementation(async (sql: string, args: unknown[] = []) => ({ rows: (await pg.query(sql, args)).rows }));
});

describe('the claims evidence figure', () => {
  it('is labelled a heuristic coverage figure, not a confidence', async () => {
    await pg.query(`INSERT INTO project_memory_entries (project_id, organization_id, category, title, content, confidence_score, created_at)
      VALUES (42, 7, 'claim_evidence_map', 'Scored claim', 'Scored claim body', 0.9, '2026-10-02T00:00:00Z')`);
    const block = await recall('claims');
    expect(block, 'the heuristic was printed as the confidence of the evidence chain').not.toMatch(/\*\*Confidence:\*\*/);
    expect(block).toContain(
      '**Evidence coverage (heuristic, not a confidence):** 66/100, from the number of entries, their mean recorded ' +
      'confidence, source types and recency | **Chain strength (from that heuristic):** moderate');
  });
});
