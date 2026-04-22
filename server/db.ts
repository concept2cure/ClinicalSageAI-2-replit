/**
 * Database facade for Concept2Cure.
 *
 * The implementation was split in Phase 3 of the architecture consolidation:
 *   - Runtime (pool, Drizzle, query/transaction/health/migrations):
 *       server/db/runtime.ts
 *   - Bootstrap/install (schema repair, org seed, demo user, module catalog):
 *       server/db/bootstrap/
 *
 * This file is intentionally kept as a thin re-export facade so the 266
 * existing callers that import from `server/db.ts` / `../db` / `./db` keep
 * working without modification. New code should prefer importing directly
 * from `server/db/runtime.ts` for runtime access, or from
 * `server/db/bootstrap/` for install behavior, so the separation stays
 * visible at the import site.
 *
 * Do NOT add new runtime or bootstrap behavior here. Add it to the owning
 * module under server/db/ and let it flow through the re-export if
 * backwards compatibility is required.
 */

export {
  db,
  pool,
  getPool,
  getDb,
  query,
  transaction,
  healthCheck,
  runMigrations,
} from './db/runtime';

export { ensureAuthTables } from './db/bootstrap';
