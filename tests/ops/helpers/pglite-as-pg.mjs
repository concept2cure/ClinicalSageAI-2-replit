/**
 * A stand-in for the `pg` module, backed by an in-memory PGlite (real Postgres,
 * compiled to WASM), so a CLI script's own SQL and exit code can be tested end to
 * end without a database server. Loaded only through pglite-as-pg-register.mjs.
 *
 * PGLITE_SEED is SQL run once when the first query arrives. Every Pool shares the
 * one database; connect() hands out a client on it. PGlite's close() resets
 * process.exitCode, so a script that sets its exit code before closing the pool
 * reports 0 here — which is the ordering bug this stand-in exists to catch.
 *
 * Why not server/services/ana-ri/__tests__/pglite-pool.fixture.ts, which already
 * wraps one PGlite as a pg-shaped pool: that fixture is TypeScript and imports
 * tests/golden-journeys/harness by an extensionless path, so it loads only under
 * vitest or tsx. The script under test runs under plain `node`, and running it
 * under a TS loader instead would change what is being tested — the script as
 * `node scripts/verify-rag-corpus.mjs` runs it. What is new here is the module
 * resolve hook (pglite-as-pg-register.mjs) and the pg-module shape (a Pool
 * class, end() closing the database); the query adapter is five lines.
 */
import { PGlite } from '@electric-sql/pglite';

let ready;
function db() {
  ready ??= (async () => {
    const d = new PGlite();
    if (process.env.PGLITE_SEED) await d.exec(process.env.PGLITE_SEED);
    return d;
  })();
  return ready;
}

const run = async (sql, params) => ({ rows: (await (await db()).query(sql, params)).rows });

export class Pool {
  query(sql, params) {
    return run(sql, params);
  }
  async connect() {
    await db();
    return { query: run, release() {} };
  }
  async end() {
    if (ready) await (await ready).close();
  }
}

export default { Pool };
