/**
 * A protocol risk is recorded with the ratings someone assessed.
 *
 * A risk added without likelihood or impact was recorded 'possible' ×
 * 'moderate' — 3 × 3 = 9, banded 'high' — by the service, the column defaults
 * and the 'Add risk' form's preselected values alike, and the scorer turned
 * any unknown rating into the middle of the scale.
 */
import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../protocol-development/protocol-development-service', () => ({
  requireProtocolForWriteTx: vi.fn(async () => ({ id: 5 })),
}));
vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));

import { addRiskTx, ProtocolRiskError } from '../protocol-risks-service';
import { riskScore } from '../protocol-risks-logic';

function client() {
  return { query: vi.fn(async (_text: string, _params?: unknown[]) => ({ rows: [{ id: 9 }], rowCount: 1 })) };
}
const inserts = (c: ReturnType<typeof client>) => c.query.mock.calls.filter(([t]) => /INSERT INTO protocol_risks/.test(String(t)));

describe('addRiskTx', () => {
  it.each([
    ['likelihood', { impact: 'major' }],
    ['impact', { likelihood: 'likely' }],
  ])('refuses a risk with no %s, and records nothing', async (missing, ratings) => {
    const c = client();
    await expect(
      addRiskTx(c as never, 3, 7, { protocolDocumentId: 5, description: 'Site turnover', ...ratings }),
    ).rejects.toThrow(`${missing} is required`);
    await expect(
      addRiskTx(c as never, 3, 7, { protocolDocumentId: 5, description: 'Site turnover', ...ratings }),
    ).rejects.toBeInstanceOf(ProtocolRiskError);
    expect(inserts(c)).toEqual([]);
  });

  it('records the ratings it was given, as given', async () => {
    const c = client();
    const r = await addRiskTx(c as never, 3, 7, { protocolDocumentId: 5, description: 'Site turnover', likelihood: 'likely', impact: 'major' });
    expect(r.level).toBe('extreme');
    expect(inserts(c)[0][1]).toEqual(expect.arrayContaining(['likely', 'major']));
  });
});

describe('riskScore', () => {
  it('refuses a rating outside the scale rather than scoring it as 3', () => {
    expect(() => riskScore(undefined as never, 'moderate')).toThrow(RangeError);
    expect(() => riskScore('possible', 'unknown' as never)).toThrow(RangeError);
    expect(riskScore('possible', 'moderate')).toBe(9);
  });
});

describe('protocol_risks has no default rating', () => {
  const sql = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  const BASE = `CREATE TABLE organizations (id serial PRIMARY KEY); CREATE TABLE users (id serial PRIMARY KEY);
                INSERT INTO organizations DEFAULT VALUES; INSERT INTO users DEFAULT VALUES;`;
  const UNRATED = `INSERT INTO protocol_risks (organization_id, protocol_document_id, description, created_by) VALUES (1, 5, 'x', 1)`;
  const defaults = async (pg: PGlite) => (await pg.query<{ column_name: string; column_default: string | null }>(
    `SELECT column_name, column_default FROM information_schema.columns
      WHERE table_name = 'protocol_risks' AND column_name IN ('likelihood', 'impact') ORDER BY column_name`)).rows;

  it('on a fresh install, and an insert without ratings fails rather than inventing them', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(BASE);
      await pg.exec(sql('migrations/20260622_protocol_risks.sql'));
      await pg.exec(sql('migrations/20261015d_protocol_risk_ratings_no_default.sql'));
      expect(await defaults(pg)).toEqual([
        { column_name: 'impact', column_default: null },
        { column_name: 'likelihood', column_default: null },
      ]);
      await expect(pg.exec(UNRATED)).rejects.toThrow(/null value in column "(likelihood|impact)"/);
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('on a database provisioned before, every deploy, idempotently', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(BASE);
      await pg.exec(sql('migrations/20260622_protocol_risks.sql'));
      await pg.exec(`ALTER TABLE protocol_risks ALTER COLUMN likelihood SET DEFAULT 'possible', ALTER COLUMN impact SET DEFAULT 'moderate'`);
      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(sql('migrations/20261015d_protocol_risk_ratings_no_default.sql'));
        expect((await defaults(pg)).every((d) => d.column_default === null)).toBe(true);
      }
      await expect(pg.exec(UNRATED)).rejects.toThrow(/null value in column/);
    } finally {
      await pg.close();
    }
  }, 60_000);
});
