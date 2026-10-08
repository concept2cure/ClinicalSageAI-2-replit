/**
 * The duplicate-send refusal names the environment that holds the bytes.
 *
 * 2026-10-08 (W5/D7, sweep HS-6 review). The bytes key — and
 * sub_trans_active_lock_idx — carry no environment, so a bundle sent to the
 * agency's TEST environment holds the first PRODUCTION send of the same bytes.
 * The refusal told that production send the bundle "is with the agency" and
 * that a rollback "does not retract it": untrue, since production never
 * received it, and rolling the test send back is the only way to free the
 * lock. The real findActiveTransmittal SQL and assertNoActiveTransmittal run
 * here on PGlite with the real DDL; the route-level wording is pinned in
 * tests/mdx-submission-gateway-transmit-bundle-guard.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { PGlite } from '@electric-sql/pglite';

const { db } = vi.hoisted(() => ({ db: { current: null as PGlite | null } }));

vi.mock('../../../db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => db.current!.query(sql, params) },
}));

import { assertNoActiveTransmittal, GovernedTransmitRefusal } from '../governed-transmit-checks';
import type { GovernedTransmitInput, ResolvedBundle } from '../governed-transmit';

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
    INSERT INTO organizations (id) VALUES (7);
    INSERT INTO c2c_submission_packages (id) VALUES (5);
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

const SHA = 'a'.repeat(64);

async function held(status: string, metadata: Record<string, unknown>): Promise<number> {
  const { rows } = await db.current!.query<{ id: number }>(
    `INSERT INTO submission_transmittals (organization_id, package_id, region, gateway, format, bundle_sha256, status, metadata)
     VALUES (7, 5, 'fda', 'esg', 'ectd', $1, $2, $3::jsonb) RETURNING id`,
    [SHA, status, JSON.stringify(metadata)],
  );
  return rows[0].id;
}

/** A package bundle of sequence 0000, the same bytes, sent to `environment`. */
async function refusal(environment: 'staging' | 'production'): Promise<GovernedTransmitRefusal> {
  const input = { organizationId: 7, packageId: 5, environment } as GovernedTransmitInput;
  const bundle = { sha256: SHA, sequence: '0000' } as ResolvedBundle;
  const err = await assertNoActiveTransmittal(input, bundle).then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(GovernedTransmitRefusal);
  return err as GovernedTransmitRefusal;
}

describe('assertNoActiveTransmittal — a send to the other environment holding the bytes', () => {
  it('a received TEST send holding a first production send: names the test environment and how to free the lock', async () => {
    const id = await held('received', { sequence: '0000', environment: 'staging' });
    const err = await refusal('production');
    expect(err.code).toBe('ACTIVE_TRANSMITTAL');
    expect(err.message).not.toMatch(/is with the agency|does not retract/);
    expect(err.message).toBe(
      `This bundle is held by transmittal #${id}, sent to the agency's test environment, whose gateway acknowledged receipt. ` +
        'A send to the test environment does not file it in production. ' +
        `Roll transmittal #${id} back from its row in the transmittal log, then send.`,
    );
    expect(err.details).toEqual({ transmittalId: id, status: 'received', holderEnvironment: 'staging' });
  });

  it('a received send in the SAME environment keeps the received wording, with no rollback offered', async () => {
    const id = await held('received', { sequence: '0000', environment: 'production' });
    const err = await refusal('production');
    expect(err.message).toMatch(new RegExp(`acknowledged receipt of transmittal #${id}, so this bundle is with the agency`));
    expect(err.message).not.toMatch(/roll .*back/i);
    expect(err.details).toEqual({ transmittalId: id, status: 'received' });
  });

  it('a row that names no environment (written before it was recorded) is read as the same environment', async () => {
    const id = await held('received', {});
    const err = await refusal('production');
    expect(err.message).toMatch(/so this bundle is with the agency/);
    expect(err.details).toEqual({ transmittalId: id, status: 'received' });
  });
});
