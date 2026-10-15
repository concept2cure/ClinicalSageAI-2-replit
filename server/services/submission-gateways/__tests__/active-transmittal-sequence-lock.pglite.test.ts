/**
 * The duplicate-send lock's SQL, run against the real submission_transmittals
 * DDL (migrations/20260509_submission_gateways.sql + the active-lock index).
 *
 * 2026-10-01 (W5/D7, sweep F15): the lock was keyed on the bundle's bytes
 * only. Re-assembling a sequence produces a new zip sha256 for the SAME
 * sequence, so a re-assembled 0000 passed the lock while the first send of
 * 0000 was still in flight or delivered-but-unconfirmed. findActiveTransmittal
 * now also matches the sequence and environment a row was sent under. The
 * route-level behaviour is pinned in
 * tests/mdx-submission-gateway-transmit-bundle-guard.test.ts; this file proves
 * the predicate the stub there restates.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { PGlite } from '@electric-sql/pglite';

const { db } = vi.hoisted(() => ({ db: { current: null as PGlite | null } }));

vi.mock('../../../db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => db.current!.query(sql, params) },
}));

import { findActiveTransmittal } from '../fda-esg';

const migration = (name: string) =>
  readFileSync(new URL(`../../../../migrations/${name}`, import.meta.url), 'utf8');

beforeAll(async () => {
  const pg = new PGlite();
  // The parents the migration's foreign keys name; only their keys matter here.
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE c2c_submission_packages (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (7), (8);
    INSERT INTO c2c_submission_packages (id) VALUES (99), (100);
  `);
  await pg.exec(migration('20260509_submission_gateways.sql'));
  await pg.exec(migration('20260629_submission_transmittals_active_lock.sql'));
  db.current = pg;
}, 60_000);

afterAll(async () => {
  await db.current?.close();
});

beforeEach(async () => {
  await db.current!.exec('DELETE FROM submission_transmittals');
});

const SENT = 'a'.repeat(64);        // the bundle already sent
const REASSEMBLED = 'b'.repeat(64); // the same sequence, re-assembled: new bytes
const PRODUCTION_ZERO = { sequence: '0000', environment: 'production' };

async function sent(r: { status: string; metadata: Record<string, unknown>; org?: number; pkg?: number; sha?: string }): Promise<number> {
  const { rows } = await db.current!.query<{ id: number }>(
    `INSERT INTO submission_transmittals (organization_id, package_id, region, gateway, format, bundle_sha256, status, metadata)
     VALUES ($1, $2, 'fda', 'esg', 'ectd', $3, $4, $5::jsonb) RETURNING id`,
    [r.org ?? 7, r.pkg ?? 99, r.sha ?? SENT, r.status, JSON.stringify(r.metadata)],
  );
  return rows[0].id;
}

const lookup = (filing: { sequence: string; environment: string } | null = PRODUCTION_ZERO, bundleSha256 = REASSEMBLED) =>
  findActiveTransmittal({ organizationId: 7, packageId: 99, bundleSha256, filing });

describe('findActiveTransmittal — the sequence a row was sent under holds it (sweep F15)', () => {
  it.each(['pending', 'in_transit', 'received'])('a %s send of the sequence holds it against a re-assembled bundle', async (status) => {
    const id = await sent({ status, metadata: PRODUCTION_ZERO });
    expect(await lookup()).toEqual({ id, status, sequence: '0000' });
  });

  it('the other environment does not hold it: a staging send never blocks production, nor the reverse', async () => {
    const id = await sent({ status: 'in_transit', metadata: { sequence: '0000', environment: 'staging' } });
    expect(await lookup()).toBeNull();
    expect(await lookup({ sequence: '0000', environment: 'staging' })).toEqual({ id, status: 'in_transit', sequence: '0000' });
  });

  it.each(['rejected', 'rolled_back', 'completed'])('a %s transmittal of the sequence does not hold it', async (status) => {
    await sent({ status, metadata: PRODUCTION_ZERO });
    expect(await lookup()).toBeNull();
  });

  it('another sequence, another package or another organization does not hold it', async () => {
    await sent({ status: 'in_transit', metadata: { sequence: '0001', environment: 'production' } });
    await sent({ status: 'in_transit', metadata: PRODUCTION_ZERO, pkg: 100 });
    await sent({ status: 'in_transit', metadata: PRODUCTION_ZERO, org: 8 });
    // Rows written before the sequence was put on the row carry none.
    await sent({ status: 'in_transit', metadata: { environment: 'production' }, sha: 'c'.repeat(64) });
    expect(await lookup()).toBeNull();
  });

  it('without a filing only the bundle bytes are matched, as before', async () => {
    const id = await sent({ status: 'in_transit', metadata: PRODUCTION_ZERO });
    expect(await lookup(null)).toBeNull();
    expect(await lookup(null, SENT)).toEqual({ id, status: 'in_transit' });
  });

  it('the same bytes are reported as the bundle, not as the sequence', async () => {
    const id = await sent({ status: 'received', metadata: PRODUCTION_ZERO });
    expect(await lookup(PRODUCTION_ZERO, SENT)).toEqual({ id, status: 'received' });
  });
});
