/**
 * Types for scripts/db/migration-set.mjs.
 *
 * `scripts/` is outside tsconfig's `include`, so the .mjs module itself is never
 * checked — but two server tests import `C2C_MIGRATION_FILES` from it, and under
 * `noImplicitAny` an untyped import is a hard TS7016 error, not a warning. That
 * failed `npm run typecheck` for every file in the project, not just those two.
 *
 * Hand-written rather than emitted: the .mjs is the source of truth and must
 * stay plain ESM (deploy-migrate and install-fresh run it directly with node, no
 * build step). Keep these signatures in step with it.
 */

/**
 * The migration files that must be applied to an EXISTING database, in order.
 * The only durable path for schema that ships after a database was provisioned.
 */
export declare const C2C_MIGRATION_FILES: string[];

export interface ApplyMigrationOptions {
  log?: (message: string) => void;
  error?: (message: string) => void;
  /**
   * Stop at the first failure instead of reporting every problem in one run.
   * The deploy applier passes true so a faulted migration never leaves a deploy
   * applying further DDL on top of a schema it has already failed to move.
   */
  stopOnFirstFailure?: boolean;
}

export interface ApplyMigrationResult {
  applied: string[];
  failures: Array<{ file: string; error: string }>;
}

/** Apply `files` (repo-relative) against `pool`, one transaction per file. */
export declare function applyMigrationFiles(
  pool: { query: (sql: string) => Promise<unknown> },
  repoRoot: string,
  files: string[],
  options?: ApplyMigrationOptions,
): Promise<ApplyMigrationResult>;
