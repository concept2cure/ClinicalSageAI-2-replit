/**
 * findSimilarProtocols reads only the caller's organization's protocols, and a
 * failed read is an error.
 *
 * Before (to 2026-10-15): the read was `WHERE indication = $1` with no
 * organization, so the demo analysis (analytics-demo-analysis.ts) listed every
 * organization's protocols that shared the indication — titles, sponsors,
 * sample sizes; and a failed read was caught and returned [], which the caller
 * renders as "stated but unmatched".
 *
 * Real `protocols` table on PGlite; the embedding service is unavailable, so
 * similarity is attribute-scored.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { protocols } from '../../shared/schema';

const H = vi.hoisted(() => ({ pg: null as any, db: null as any }));

vi.mock('../db', () => ({ get db() { return H.db; } }));
vi.mock('../db/runtime', () => ({
  getPool: () => { throw new Error('no pool in this test'); },
}));

import { protocolAnalyzerService } from '../protocol-analyzer-service';

const ALPHA = 1;
const BETA = 2;

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  H.pg = new PGlite();
  H.db = drizzle(H.pg);
  await H.pg.exec(ddlOf(protocols as PgTable));
  const cols = getTableConfig(protocols as PgTable).columns.map((c) => c.name);
  const insert = async (id: number, org: number, title: string) => {
    const row: Record<string, unknown> = { id, organization_id: org, title, indication: 'Asthma', phase: 'Phase 2' };
    const names = Object.keys(row).filter((k) => cols.includes(k));
    await H.pg.query(
      `INSERT INTO protocols (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
      names.map((n) => row[n]),
    );
  };
  await insert(1, ALPHA, 'ALPHA-AST-201');
  await insert(2, BETA, 'BETA-SECRET-AST-301');
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

const input = { indication: 'Asthma', phase: 'Phase 2' } as any;

describe('findSimilarProtocols', () => {
  it("returns only the caller's organization's protocols", async () => {
    const rows = await protocolAnalyzerService.findSimilarProtocols(input, 5, ALPHA);
    expect(rows.map((r) => r.title), "another organization's protocol was listed").toEqual(['ALPHA-AST-201']);
  });

  it('refuses to search with no organization', async () => {
    await expect(protocolAnalyzerService.findSimilarProtocols(input, 5)).rejects.toThrow(/organization/);
  });

  it('a failed read is an error, not "no similar protocols"', async () => {
    const real = H.db;
    H.db = { select: () => { throw new Error('connection terminated'); } };
    try {
      await expect(protocolAnalyzerService.findSimilarProtocols(input, 5, ALPHA)).rejects.toThrow();
    } finally {
      H.db = real;
    }
  });
});
