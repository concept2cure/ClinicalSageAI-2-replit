/**
 * market-access-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: a payer/HTA position TRACKED through the service
 * persists in the real market_access_positions store and reads back org-scoped in
 * the flat row shape the MarketAccess surface renders (market / payer / mechanism /
 * code / status / decision_date / note) — no blob, no fixture. Also locks
 * required-field + status-vocab validation, soft-delete, and strict tenant scope.
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

import {
  createMarketAccessPosition, listMarketAccessPositions, getMarketAccessPosition,
  deleteMarketAccessPosition, MarketAccessValidationError,
} from '../market-access-service';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE market_access_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, program text NOT NULL, market text NOT NULL, payer text NOT NULL,
  mechanism text, code text, status text NOT NULL DEFAULT 'planned',
  decision_date date, note text, created_by int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM market_access_positions;`); });

describe('market-access-service', () => {
  it('tracks a payer position and reads it back in the surface row shape', async () => {
    const created = await createMarketAccessPosition(ORG, {
      program: 'BX-204', market: 'United Kingdom', payer: 'NHS -- NICE',
      mechanism: 'HTA appraisal', code: null, status: 'review',
      decisionDate: '2026-11-01', note: 'NICE TA in progress; positioned vs Libre 3.',
      createdBy: 42,
    });
    expect(created.id).toBeTruthy();
    expect(created.organization_id).toBe(ORG);
    expect(created.created_by).toBe(42);
    expect(created.decision_date).toBe('2026-11-01'); // DATE round-trips as ISO text

    const rows = await listMarketAccessPositions(ORG);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.program).toBe('BX-204');
    expect(row.market).toBe('United Kingdom');
    expect(row.payer).toBe('NHS -- NICE');
    expect(row.mechanism).toBe('HTA appraisal');
    expect(row.code).toBeNull();
    expect(row.status).toBe('review');
    expect(row.decision_date).toBe('2026-11-01');
    expect(row.note).toBe('NICE TA in progress; positioned vs Libre 3.');
  });

  it('defaults an absent status to planned and keeps optional fields null', async () => {
    const created = await createMarketAccessPosition(ORG, {
      program: 'BX-204', market: 'France', payer: 'HAS / CNEDiMTS',
    });
    expect(created.status).toBe('planned');
    expect(created.mechanism).toBeNull();
    expect(created.code).toBeNull();
    expect(created.decision_date).toBeNull();
    expect(created.note).toBeNull();
    expect(created.created_by).toBeNull();
  });

  it('rejects a missing required field or an invalid status/date vocab', async () => {
    await expect(createMarketAccessPosition(ORG, { program: '', market: 'US', payer: 'CMS' }))
      .rejects.toBeInstanceOf(MarketAccessValidationError);
    await expect(createMarketAccessPosition(ORG, { program: 'BX-204', market: '  ', payer: 'CMS' }))
      .rejects.toBeInstanceOf(MarketAccessValidationError);
    await expect(createMarketAccessPosition(ORG, { program: 'BX-204', market: 'US', payer: '' }))
      .rejects.toBeInstanceOf(MarketAccessValidationError);
    await expect(createMarketAccessPosition(ORG, { program: 'BX-204', market: 'US', payer: 'CMS', status: 'approved' }))
      .rejects.toBeInstanceOf(MarketAccessValidationError);
    await expect(createMarketAccessPosition(ORG, { program: 'BX-204', market: 'US', payer: 'CMS', decisionDate: 'next spring' }))
      .rejects.toBeInstanceOf(MarketAccessValidationError);
    expect(await listMarketAccessPositions(ORG)).toEqual([]);
  });

  it('is strictly tenant-scoped and soft-delete aware', async () => {
    const mine = await createMarketAccessPosition(ORG, { program: 'BX-204', market: 'United States', payer: 'CMS -- Medicare', status: 'covered' });
    await createMarketAccessPosition(OTHER, { program: 'ZZ-1', market: 'Japan', payer: 'MHLW / Chuikyo' });

    expect((await listMarketAccessPositions(ORG)).map((r) => r.payer)).toEqual(['CMS -- Medicare']);
    expect(await getMarketAccessPosition(OTHER, mine.id)).toBeNull();      // no cross-tenant read

    expect(await deleteMarketAccessPosition(ORG, mine.id)).toBe(true);
    expect(await listMarketAccessPositions(ORG)).toEqual([]);              // soft-deleted excluded
    expect(await getMarketAccessPosition(ORG, mine.id)).toBeNull();
    expect(await deleteMarketAccessPosition(ORG, mine.id)).toBe(false);    // already gone
  });
});
