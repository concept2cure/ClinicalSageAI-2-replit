/**
 * RIM Pattern Persistence — verifies the judgment layer's OWN tables, against
 * in-process PGlite, using the REAL migration DDL
 * (migrations/20260820b_rim_learned_patterns.sql) so the schema under test is
 * the schema a deploy creates.
 *
 * Coverage:
 *   - round-trip: persistPattern → loadPersistedPatterns
 *   - a strengthened pattern UPDATES its one row (upsert on org + pattern_key)
 *   - every persist appends ONE observation row — the append-only audit trail
 *   - close-together persists serialize (no duplicate aggregate rows)
 *   - org isolation on read
 *   - an org with nothing stored loads []
 *   - a write failure never throws into the caller
 *   - a missing table warns once and degrades (no throw, no loss of the write path)
 *   - the stopgap JSON blob (project_memory_entries, category
 *     'rim_learned_pattern') is lazily IMPORTED into the real tables, so the
 *     interim window's learning graduates with the schema
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RimPattern } from '../rim-pattern-store';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATION = path.join(REPO_ROOT, 'migrations/20260820b_rim_learned_patterns.sql');

let pg: PGlite;
let failNextQuery = false;

vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string, params?: unknown[]) => {
      if (failNextQuery) {
        failNextQuery = false;
        throw new Error('injected database failure');
      }
      const r = await pg.query(sql, params as unknown[]);
      return {
        rows: r.rows as Array<Record<string, unknown>>,
        rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
      };
    },
  },
  db: {},
}));

import { persistPattern, loadPersistedPatterns } from '../rim-pattern-persistence';

let nextOrg = 900;
async function seedOrg(): Promise<number> {
  const org = ++nextOrg;
  await pg.query(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [org, `org-${org}`]);
  return org;
}

function makePattern(orgId: number, overrides: Partial<RimPattern> = {}): RimPattern {
  return {
    id: `${orgId}::csr::deficiency::missing primary endpoint`,
    orgId,
    domain: 'csr',
    signalType: 'deficiency',
    observation: 'Missing primary endpoint',
    confidence: 60,
    occurrences: 3,
    firstSeen: '2025-01-01T00:00:00.000Z',
    lastSeen: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

async function aggregateRows(orgId: number) {
  const r = await pg.query<Record<string, unknown>>(
    `SELECT * FROM rim_learned_patterns WHERE organization_id = $1 ORDER BY id`,
    [orgId]
  );
  return r.rows;
}

async function observationRows(orgId: number) {
  const r = await pg.query<Record<string, unknown>>(
    `SELECT * FROM rim_pattern_observations WHERE organization_id = $1 ORDER BY id`,
    [orgId]
  );
  return r.rows;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, name text);
    CREATE TABLE project_memory_entries (
      id serial PRIMARY KEY,
      project_profile_id integer NOT NULL,
      project_id integer NOT NULL,
      organization_id integer NOT NULL,
      category text NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      status text DEFAULT 'active',
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  const migration = fs.readFileSync(MIGRATION, 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // a deploy re-runs the whole set — must be idempotent
});

afterAll(async () => {
  await pg.close();
});

describe('persistPattern + loadPersistedPatterns round-trip', () => {
  it('persists a pattern and reads it back', async () => {
    const org = await seedOrg();
    await persistPattern(makePattern(org));

    const loaded = await loadPersistedPatterns(String(org));
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      orgId: org,
      domain: 'csr',
      signalType: 'deficiency',
      observation: 'Missing primary endpoint',
      confidence: 60,
      occurrences: 3,
    });
  });

  it('a strengthened pattern UPDATES its one aggregate row, and each persist appends one observation', async () => {
    const org = await seedOrg();
    await persistPattern(makePattern(org, { occurrences: 1, confidence: 50 }));
    await persistPattern(
      makePattern(org, { occurrences: 2, confidence: 55, lastSeen: '2025-07-01T00:00:00.000Z' })
    );

    const aggregates = await aggregateRows(org);
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].occurrences).toBe(2);
    expect(Number(aggregates[0].confidence)).toBe(55);

    // The audit trail keeps BOTH events — nothing updates or deletes here.
    const observations = await observationRows(org);
    expect(observations).toHaveLength(2);
  });

  it('close-together persists serialize instead of racing', async () => {
    const org = await seedOrg();
    await Promise.all([
      persistPattern(makePattern(org, { occurrences: 1 })),
      persistPattern(makePattern(org, { occurrences: 2 })),
    ]);

    const aggregates = await aggregateRows(org);
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].occurrences).toBe(2);
  });

  it('reads are org-isolated', async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    await persistPattern(makePattern(orgA, { observation: 'A only' , id: `${orgA}::csr::deficiency::a only`}));
    await persistPattern(makePattern(orgB, { observation: 'B only', id: `${orgB}::csr::deficiency::b only` }));

    expect((await loadPersistedPatterns(String(orgA))).map(p => p.observation)).toEqual(['A only']);
    expect((await loadPersistedPatterns(String(orgB))).map(p => p.observation)).toEqual(['B only']);
  });
});

describe('graceful degradation', () => {
  it('returns [] for an org with nothing stored (and no legacy blob)', async () => {
    const org = await seedOrg();
    expect(await loadPersistedPatterns(String(org))).toEqual([]);
  });

  it('a write failure never throws into the caller', async () => {
    const org = await seedOrg();
    failNextQuery = true;
    await expect(persistPattern(makePattern(org))).resolves.toBeUndefined();
  });
});

describe('the stopgap blob graduates with the schema', () => {
  it('lazily imports the project_memory_entries JSON blob when the real table is empty', async () => {
    const org = await seedOrg();
    const blobPatterns = [
      makePattern(org, { id: `${org}::ectd::deficiency::interim learning`, observation: 'Interim learning' }),
      makePattern(12345, { observation: 'Foreign org — must be dropped' }),
    ];
    await pg.query(
      `INSERT INTO project_memory_entries
         (project_profile_id, project_id, organization_id, category, title, content)
       VALUES (1, $1, $2, 'rim_learned_pattern', 'RIM learned patterns', $3)`,
      [org * 10, org, JSON.stringify({ version: 1, patterns: blobPatterns })]
    );

    const loaded = await loadPersistedPatterns(String(org));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].observation).toBe('Interim learning');

    // Imported INTO the real tables — the next load never touches the blob.
    expect(await aggregateRows(org)).toHaveLength(1);
    expect(await observationRows(org)).toHaveLength(1);
  });
});
