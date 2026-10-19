/**
 * An IBC determination records whether a convened quorum voted only when
 * someone says so.
 *
 * ibc_reviews.convened_quorum was `boolean NOT NULL DEFAULT false` and
 * recordReviewTx wrote `convenedQuorum === true`, so a determination recorded
 * without that answer was stored as made WITHOUT a convened quorum — for
 * NIH Guidelines III-A/B/C work, a record that reads as a compliance gap nobody
 * reported. Unstated is now NULL (not recorded).
 *
 * Real creating migration on PGlite.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const query = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
};

vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => query(s, p) }, db: {} }));

import { recordReviewTx } from '../ibc-service';

const ORG = 7;
const USER = 3;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const client = { query: (s: string, p?: unknown[]) => query(s, p) };

let id: number;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE submissions (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pglite.exec(fs.readFileSync(path.join(repoRoot, 'migrations/20260610_ibc_biosafety.sql'), 'utf8'));
}, 60_000);

beforeEach(async () => {
  await pglite.exec('TRUNCATE ibc_reviews, ibc_registrations RESTART IDENTITY CASCADE;');
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO ibc_registrations (organization_id, registration_number, title, status, created_by)
     VALUES ($1, 'R-1', 'AAV work', 'submitted', $2) RETURNING id`,
    [ORG, USER],
  );
  id = r.rows[0].id;
});

const storedQuorum = async () => (await pglite.query<{ q: boolean | null }>(`SELECT convened_quorum AS q FROM ibc_reviews`)).rows.map((r) => r.q);

describe('ibc_reviews.convened_quorum', () => {
  it('is NULL when the determination does not say, not "no convened quorum"', async () => {
    await recordReviewTx(client, ORG, USER, id, { outcome: 'tabled', determinationDate: '2026-03-02' });
    expect(await storedQuorum()).toEqual([null]);
  });

  it('stores a stated answer, false included', async () => {
    await recordReviewTx(client, ORG, USER, id, { outcome: 'tabled', determinationDate: '2026-03-02', convenedQuorum: false });
    await recordReviewTx(client, ORG, USER, id, { outcome: 'tabled', determinationDate: '2026-03-09', convenedQuorum: true });
    expect(await storedQuorum()).toEqual([false, true]);
  });
});
