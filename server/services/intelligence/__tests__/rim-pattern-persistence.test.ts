/**
 * RIM Pattern Persistence — verifies the DATABASE-backed durable storage for
 * learned RIM patterns, against in-process PGlite.
 *
 * This module replaced a JSON-file store under `data/rim-patterns/` (gitignored,
 * per-container disk — judgment lost with every container). Coverage mirrors
 * what the file-based suite pinned, restated for the durable substrate:
 *   - round-trip (persist then load)
 *   - re-persist REPLACES the org's set, in ONE row updated in place
 *   - close-together persists do not race update-else-insert into duplicate rows
 *   - an org with nothing stored loads []
 *   - unreadable stored content loads [] (never throws)
 *   - a write failure never throws into the caller
 *   - an org without an intelligence profile is skipped with one warning
 *   - loaded patterns claiming another org are dropped (tenant hygiene)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { RimPattern } from '../rim-pattern-store';

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

import { persistPatterns, loadPersistedPatterns } from '../rim-pattern-persistence';

let nextOrg = 900;
async function seedOrg(): Promise<number> {
  const org = ++nextOrg;
  await pg.query(
    `INSERT INTO project_intelligence_profiles (project_id, organization_id) VALUES ($1, $2)`,
    [org * 10, org]
  );
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

async function storedRows(orgId: number) {
  const r = await pg.query<{ content: string }>(
    `SELECT content FROM project_memory_entries
      WHERE organization_id = $1 AND category = 'rim_learned_pattern'`,
    [orgId]
  );
  return r.rows;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE project_intelligence_profiles (
      id serial PRIMARY KEY,
      project_id integer NOT NULL,
      organization_id integer NOT NULL
    );
    CREATE TABLE project_memory_entries (
      id serial PRIMARY KEY,
      project_profile_id integer NOT NULL,
      project_id integer NOT NULL,
      organization_id integer NOT NULL,
      category text NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      confidence_score real DEFAULT 0.8,
      importance_level text DEFAULT 'medium',
      status text DEFAULT 'active',
      extracted_by text DEFAULT 'ai',
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
});

afterAll(async () => {
  await pg.close();
});

describe('persistPatterns + loadPersistedPatterns round-trip', () => {
  it('persists patterns to the database and reads them back', async () => {
    const org = await seedOrg();
    const patterns = [
      makePattern(org),
      makePattern(org, {
        id: `${org}::csr::risk_signal::elevated liver enzymes`,
        signalType: 'risk_signal',
        observation: 'Elevated liver enzymes',
      }),
    ];

    await persistPatterns(String(org), patterns);

    const loaded = await loadPersistedPatterns(String(org));
    expect(loaded).toHaveLength(2);
    expect(loaded.map(p => p.observation).sort()).toEqual([
      'Elevated liver enzymes',
      'Missing primary endpoint',
    ]);
  });

  it('re-persist REPLACES the set, in one row updated in place', async () => {
    const org = await seedOrg();
    await persistPatterns(String(org), [makePattern(org)]);
    await persistPatterns(String(org), [
      makePattern(org, { occurrences: 4, confidence: 65 }),
    ]);

    expect(await storedRows(org)).toHaveLength(1);
    const loaded = await loadPersistedPatterns(String(org));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].occurrences).toBe(4);
    expect(loaded[0].confidence).toBe(65);
  });

  it('close-together persists serialize instead of racing into duplicate rows', async () => {
    const org = await seedOrg();
    // Both start before either finishes — the update-else-insert race window.
    await Promise.all([
      persistPatterns(String(org), [makePattern(org)]),
      persistPatterns(String(org), [makePattern(org, { occurrences: 5 })]),
    ]);

    expect(await storedRows(org)).toHaveLength(1);
    const loaded = await loadPersistedPatterns(String(org));
    expect(loaded[0].occurrences).toBe(5);
  });
});

describe('graceful degradation', () => {
  it('returns [] for an org with nothing stored', async () => {
    const org = await seedOrg();
    expect(await loadPersistedPatterns(String(org))).toEqual([]);
  });

  it('returns [] when the stored content has no pattern array', async () => {
    const org = await seedOrg();
    await pg.query(
      `INSERT INTO project_memory_entries
         (project_profile_id, project_id, organization_id, category, title, content)
       VALUES (1, $1, $2, 'rim_learned_pattern', 'RIM learned patterns', $3)`,
      [org * 10, org, JSON.stringify({ version: 1, patterns: 'not-an-array' })]
    );
    expect(await loadPersistedPatterns(String(org))).toEqual([]);
  });

  it('returns [] when the stored content is invalid JSON', async () => {
    const org = await seedOrg();
    await pg.query(
      `INSERT INTO project_memory_entries
         (project_profile_id, project_id, organization_id, category, title, content)
       VALUES (1, $1, $2, 'rim_learned_pattern', 'RIM learned patterns', 'not json {')`,
      [org * 10, org]
    );
    expect(await loadPersistedPatterns(String(org))).toEqual([]);
  });

  it('a write failure never throws into the caller', async () => {
    const org = await seedOrg();
    failNextQuery = true;
    await expect(persistPatterns(String(org), [makePattern(org)])).resolves.toBeUndefined();
  });

  it('skips an org with no intelligence profile (nothing to anchor the row)', async () => {
    const org = 999999; // never seeded
    await persistPatterns(String(org), [makePattern(org)]);
    expect(await storedRows(org)).toHaveLength(0);
  });

  it('drops loaded patterns claiming another org — tenant hygiene', async () => {
    const org = await seedOrg();
    const foreign = makePattern(12345);
    await pg.query(
      `INSERT INTO project_memory_entries
         (project_profile_id, project_id, organization_id, category, title, content)
       VALUES (1, $1, $2, 'rim_learned_pattern', 'RIM learned patterns', $3)`,
      [org * 10, org, JSON.stringify({ version: 1, patterns: [makePattern(org), foreign] })]
    );
    const loaded = await loadPersistedPatterns(String(org));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].orgId).toBe(org);
  });
});
