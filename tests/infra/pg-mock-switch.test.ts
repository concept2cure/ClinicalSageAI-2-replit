/**
 * The global `pg` mock is escapable — proved by running it both ways.
 *
 * tests/setup.ts installs a `pg` stub for all ~1,595 test files. That is why a
 * green suite proves less than it looks: `new Pool().query()` answers
 * `{rows:[],rowCount:0}` for every caller, so the "DB-backed, safety-critical"
 * jobs run against a stub and a broken query still passes.
 *
 * The factory is now conditional on TEST_REAL_DB=1. This file pins BOTH sides:
 * the default (still stubbed — nothing regressed for the existing suite) and
 * the escape hatch (real module returned), because a switch that is only ever
 * exercised in one position is not a switch.
 *
 * The real-DB side asserts the MODULE IDENTITY, not a live connection: it
 * checks that `Pool` is the genuine constructor rather than a vi.fn stub. No
 * database is contacted, so this runs anywhere; provisioning a schema and
 * running the DB-backed suites with RLS_ENFORCE=on is the follow-up this
 * unblocks, not something this test pretends to do.
 *
 * No test doubles are introduced here. The subject under test IS the doubling
 * mechanism, and the assertion is about which module the loader returned.
 */

import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';

const REAL = process.env.TEST_REAL_DB === '1';

describe('pg mock switch', () => {
  it(`is ${REAL ? 'DISENGAGED (real pg)' : 'ENGAGED (stubbed pg)'} for this run`, () => {
    const isStub = typeof (Pool as unknown as { mock?: unknown }).mock === 'object';
    expect(isStub).toBe(!REAL);
  });

  it('stubbed mode still answers the shape the existing suite depends on', async () => {
    if (REAL) return; // asserted by the real-mode run instead
    const pool = new Pool();
    await expect(pool.query('select 1')).resolves.toMatchObject({ rows: [], rowCount: 0 });
  });

  it('real mode hands back a constructible Pool from the pg package', () => {
    if (!REAL) return; // asserted by the default run instead
    expect(typeof Pool).toBe('function');
    expect((Pool as unknown as { mock?: unknown }).mock).toBeUndefined();
    // Constructing does not connect; pg dials lazily on first query.
    const pool = new Pool({ connectionString: 'postgresql://u:p@127.0.0.1:1/none' });
    expect(typeof pool.query).toBe('function');
    void pool.end().catch(() => {});
  });

  it('preserves an operator-supplied DATABASE_URL in real mode', () => {
    if (!REAL) return;
    // The contract is "do not OVERWRITE", not "the sentinel is absent": when no
    // URL is supplied, setup.ts still seeds the sentinel at module load so
    // db.js can construct. What must never happen is a real URL being replaced
    // by the sentinel in beforeAll — that would point a live pg client at a
    // database that does not exist, and the flag would appear to work while
    // every query failed to connect. Asserted against the value this run was
    // actually given.
    const supplied = process.env.TEST_SUPPLIED_DATABASE_URL;
    if (!supplied) return; // nothing was supplied; nothing to preserve
    expect(process.env.DATABASE_URL).toBe(supplied);
  });
});
