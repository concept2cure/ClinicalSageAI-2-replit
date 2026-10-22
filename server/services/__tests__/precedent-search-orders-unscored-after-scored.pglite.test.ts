/**
 * A precedent nobody scored does not outrank one that was scored.
 *
 * What the code used to do (2026-10-15): the stored-precedent search ordered
 * ties on decision date by `confidence_score DESC`, and PostgreSQL puts NULL
 * first in a descending sort, so a precedent that records no confidence came
 * back ahead of every scored precedent decided the same day. A row with no
 * confidence now reads as none (mapPrecedentRow), and it sorts last.
 *
 * Real PostgreSQL (PGlite) runs the engine's own query.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as unknown as PGlite }));
vi.mock('../../db.js', () => ({
  pool: { query: (text: string, params?: unknown[]) => h.pg.query(text, params as unknown[]) },
}));

import { PrecedentEngine } from '../precedent-engine';

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE SCHEMA precedent;
    CREATE TABLE precedent.regulatory_precedents (
      id               serial PRIMARY KEY,
      organization_id  integer,
      submission_type  text NOT NULL,
      product_type     text,
      device_class     text,
      therapeutic_area text,
      device_name      text,
      decision_date    date,
      confidence_score numeric
    );
    INSERT INTO precedent.regulatory_precedents (submission_type, device_name, decision_date, confidence_score) VALUES
      ('510k', 'scored high', '2026-03-01', 0.9),
      ('510k', 'unscored',    '2026-03-01', NULL),
      ('510k', 'scored low',  '2026-03-01', 0.4);
  `);
}, 120_000);

afterAll(async () => {
  await h.pg.close();
});

describe('stored precedent search', () => {
  it('orders a precedent with no recorded confidence after the scored ones decided the same day', async () => {
    const engine = new PrecedentEngine() as unknown as {
      searchUnifiedPrecedents(input: { submissionType: string }, limit: number, organizationId?: number): Promise<Array<{ deviceName: string | null }>>;
    };
    const rows = await engine.searchUnifiedPrecedents({ submissionType: '510k' }, 10, 7);
    expect(rows.map(r => r.deviceName)).toEqual(['scored high', 'scored low', 'unscored']);
  });
});
