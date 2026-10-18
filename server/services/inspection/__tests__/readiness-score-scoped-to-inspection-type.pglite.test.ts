/**
 * The readiness score for one inspection is held to the readiness domains that
 * inspection's type covers, read from the inspection itself.
 *
 * What the code used to do (until 2026-10-15): GET /readiness/score scored
 * whatever areas were recorded for the inspection — one 'ready' area made a
 * 100 / 'ready' inspection — and an inspectionId that matched no inspection
 * scored zero areas instead of saying the inspection does not exist.
 *
 * Runs the real service SQL against in-process PGlite with the real migration.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

let pg: PGlite;
const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { rows: r.rows as any[] };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { createInspectionTx, upsertReadinessTx, getReadinessScore } from '../inspection-service';

const ORG = 7;
const USER = 3;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG}), (8);
    INSERT INTO users (id) VALUES (${USER});`);
  await pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260610_inspection_readiness.sql'), 'utf8'));
}, 120_000);
afterAll(async () => { await pg?.close(); });

describe('getReadinessScore', () => {
  it('holds a BIMO inspection to the GCP domain and a PAI to the GMP + conformance domains', async () => {
    const bimo = await createInspectionTx(exec, ORG, USER, { inspectionType: 'bimo', agency: 'fda', siteName: 'Site 12' });
    const pai = await createInspectionTx(exec, ORG, USER, { inspectionType: 'pai', agency: 'fda', siteName: 'Plant A' });

    // One recorded area each, both 'ready'.
    await upsertReadinessTx(exec, ORG, USER, { inspectionId: bimo.id, area: 'BIMO / GCP', status: 'ready' });
    await upsertReadinessTx(exec, ORG, USER, { inspectionId: pai.id, area: 'Data integrity', status: 'ready' });

    const b = await getReadinessScore(ORG, bimo.id);
    expect(b).toMatchObject({ verdict: 'ready', score: 100, notRecorded: [] });

    const p = await getReadinessScore(ORG, pai.id);
    expect(p.verdict).toBe('incomplete');
    expect(p.score).toBeLessThan(100);
    expect(p.notRecorded).toContain('application_conformance');
    expect(p.notRecorded).not.toContain('data_integrity');
    expect(p.requiredDomains).not.toContain('bimo_gcp');
  }, 60_000);

  it('refuses an inspection that is not in the organization instead of scoring nothing', async () => {
    await expect(getReadinessScore(ORG, 99_999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const other = await createInspectionTx(exec, 8, USER, { inspectionType: 'gmp', agency: 'fda', siteName: 'Elsewhere' });
    await expect(getReadinessScore(ORG, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }, 60_000);
});
