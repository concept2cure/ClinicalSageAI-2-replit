/**
 * AnA's project-memory context shows a confidence only where one is recorded,
 * and says "unscored" where none is.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * Each memory reader rendered `[NN% confidence]` / `(NN%)` when the row's
 * confidence_score was truthy and nothing otherwise, so an unscored entry and a
 * recorded 0 looked alike and neither said so. The claims reader entered every
 * unscored entry (and every recorded 0) into its evidence chain at an invented
 * relevance of 0.5, and printed "Confidence: NN/100" and "averageRelevance"
 * computed from those figures — for entries nobody had scored at all.
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

async function seed(title: string, category: string, confidence: number | null, createdAt = '2026-10-01T00:00:00Z') {
  await pg.query(`INSERT INTO project_memory_entries (project_id, organization_id, category, title, content, confidence_score, created_at)
    VALUES (42, 7, $1, $2, $3, $4, $5)`, [category, title, `${title} body`, confidence, createdAt]);
}

describe('an unscored memory entry says it is unscored', () => {
  it.each([
    ['precedent', 'precedent_analysis', '- **Unscored record** [unscored]: Unscored record body'],
    ['safety', 'safety_narrative', '- **Unscored record** [unscored]: Unscored record body'],
    ['claims', 'claim_evidence_map', '- **Unscored record** [unscored]: Unscored record body'],
    ['knowledge', 'strategy', '- **Unscored record** [strategy] (unscored): Unscored record body'],
  ])('/%s', async (command, category, line) => {
    await seed('Unscored record', category, null);
    expect(await recall(command), 'the entry carried no confidence and the context did not say so').toContain(line);
  });
});

describe('the claims evidence chain is built only from recorded confidences', () => {
  it('prints no chain strength or confidence when no entry is scored', async () => {
    await seed('First claim', 'claim_evidence_map', null, '2026-10-02T00:00:00Z');
    await seed('Second claim', 'claim_evidence_map', null);
    const block = await recall('claims');
    expect(block, 'a confidence was computed from entries nobody scored').not.toMatch(/\*\*Confidence:\*\* \d+\/100/);
    expect(block).not.toContain('averageRelevance');
    expect(block).toContain('**Evidence Chain Strength / Confidence:** not assessed — no entry below carries a recorded confidence');
    expect(block).toContain('- **First claim** [unscored]: First claim body\n- **Second claim** [unscored]: Second claim body');
  });

  it('computes over the scored entries only and says how many were left out', async () => {
    await seed('Scored claim', 'claim_evidence_map', 0.9, '2026-10-02T00:00:00Z');
    await seed('Unscored claim', 'claim_evidence_map', null);
    const block = await recall('claims');
    // The same figures one 0.9 entry gives on its own: the unscored entry adds no invented 0.5.
    // (2026-10-15: the heuristic is labelled as one — context-enrichment-claims-coverage-is-labelled-a-heuristic.)
    expect(block, 'the unscored entry entered the chain at an invented relevance').toContain(
      '**Evidence coverage (heuristic, not a confidence):** 66/100, from the number of entries, their mean recorded ' +
      'confidence, source types and recency | **Chain strength (from that heuristic):** moderate\n' +
      '**Factors:** evidenceCount: 1, averageRelevance: 0.9,');
    expect(block).toContain('**Not counted above:** 1 of 2 entries (unscored)');
    expect(block).toContain('- **Unscored claim** [unscored]: Unscored claim body');
  });
});

describe('a recorded confidence of 0 is shown as recorded', () => {
  it.each([
    ['precedent', 'precedent_analysis', '- **Zero record** [0% confidence]: Zero record body'],
    ['safety', 'safety_narrative', '- **Zero record** [0% confidence]: Zero record body'],
    ['claims', 'claim_evidence_map', '- **Zero record** [0%]: Zero record body'],
    ['knowledge', 'strategy', '- **Zero record** [strategy] (0%): Zero record body'],
  ])('/%s', async (command, category, line) => {
    await seed('Zero record', category, 0);
    expect(await recall(command), 'a recorded 0 was hidden as if absent').toContain(line);
  });

  it('enters the claims chain at its recorded 0, not 0.5', async () => {
    await seed('Zero record', 'claim_evidence_map', 0);
    expect(await recall('claims')).toContain('averageRelevance: 0,');
  });
});
