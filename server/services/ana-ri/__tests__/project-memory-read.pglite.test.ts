/**
 * `readProjectMemory` must read columns the table actually has, and rank by
 * importance rather than alphabetically.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Two faults in one statement, both invisible at runtime:
 *
 *   COLUMNS. It selected `confidence, importance`. Those columns do not exist.
 *   The table declares `confidence_score real` and `importance_level text`
 *   (shared/schema.ts:15535-15536), which is what the writer inserts
 *   (services/memory-consolidation-job.ts:321-322) and what every other reader
 *   reads (services/client-intelligence-memory.ts:1080-1081). So all four of
 *   this function's reads raised 42703 on any provisioned database — and the
 *   function catches, returns null, and the caller renders '' or a "No {domain}
 *   data found for this project yet" placeholder. Project memory has therefore
 *   never reached the model, and the surface said so in the affirmative.
 *
 *   ORDER. `ORDER BY importance DESC` on a TEXT column sorts lexically, not by
 *   severity: 'medium' > 'low' > 'high' > 'critical'. With a LIMIT on the query,
 *   that is not cosmetic — it decides WHICH entries survive the cut, and it puts
 *   the critical ones last.
 *
 * This test runs the real SQL against the real column names on PGlite, so a
 * column that does not exist fails here instead of being swallowed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const h = vi.hoisted(() => ({ pool: null as any }));
vi.mock('../../../db', () => ({
  pool: { query: (...a: unknown[]) => h.pool.query(...(a as [string, unknown[]])) },
  getPool: () => h.pool,
}));
vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => h.pool.query(...(a as [string, unknown[]])) },
  getPool: () => h.pool,
}));

import { enrichContextForChat } from '../context-enrichment';

const ORG = 7;
const PROJECT = 42;

beforeAll(async () => {
  pglite = new PGlite();
  h.pool = {
    query: async (text: string, params?: unknown[]) => {
      const r = await pglite.query(text, params as unknown[]);
      return { rows: r.rows as any[] };
    },
  };

  // The REAL column names and types (shared/schema.ts:15512-15545). Using the
  // names the code imagined would make this test agree with the bug.
  await pglite.exec(`
    CREATE TABLE project_memory_entries (
      id serial PRIMARY KEY,
      project_id integer,
      organization_id integer,
      category text NOT NULL,
      subcategory text,
      title text NOT NULL,
      content text NOT NULL,
      confidence_score real DEFAULT 0.8,
      importance_level text DEFAULT 'medium',
      status text DEFAULT 'active',
      created_at timestamptz DEFAULT now()
    );
  `);
  // One entry per importance level, inserted so that neither insertion order nor
  // alphabetical order coincides with severity order.
  const rows: Array<[string, string]> = [
    ['medium', 'A medium claim note'],
    ['critical', 'A critical claim note'],
    ['low', 'A low claim note'],
    ['high', 'A high claim note'],
  ];
  for (const [level, title] of rows) {
    await pglite.query(
      `INSERT INTO project_memory_entries
         (project_id, organization_id, category, title, content, importance_level, confidence_score)
       VALUES ($1,$2,'claim_evidence_map',$3,$4,$5,0.9)`,
      [PROJECT, ORG, title, `${title} body`, level],
    );
  }
});

afterAll(async () => {
  await pglite?.close?.();
});

describe('readProjectMemory reads the columns the table has', () => {
  it('returns project memory instead of swallowing a 42703 into an empty block', async () => {
    // `/claims` dispatches enrichWithClaims, which reads project_memory_entries.
    const { block } = await enrichContextForChat({
      message: '/claims',
      projectId: PROJECT,
      organizationId: ORG,
    });

    expect(
      block,
      'no memory reached the model — the read raised on a column that does not exist',
    ).toContain('A critical claim note');
  });

  it('ranks by severity, not alphabetically — the LIMIT decides what survives', async () => {
    const { block } = await enrichContextForChat({
      message: '/claims',
      projectId: PROJECT,
      organizationId: ORG,
    });

    const at = (t: string) => block.indexOf(t);
    expect(at('A critical claim note'), 'critical entry absent').toBeGreaterThanOrEqual(0);
    expect(at('A high claim note'), 'high entry absent').toBeGreaterThanOrEqual(0);
    expect(at('A low claim note'), 'low entry absent').toBeGreaterThanOrEqual(0);

    // Severity order. Under `ORDER BY importance_level DESC` the lexical order is
    // medium > low > high > critical — exactly backwards for the two that matter.
    expect(
      at('A critical claim note'),
      'critical ranked below high — the ordering is lexical, not by severity',
    ).toBeLessThan(at('A high claim note'));
    expect(at('A high claim note')).toBeLessThan(at('A medium claim note'));
    expect(at('A medium claim note')).toBeLessThan(at('A low claim note'));
  });
});
