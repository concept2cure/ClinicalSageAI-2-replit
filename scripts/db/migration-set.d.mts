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
 *
 * THE EXTENSION IS LOAD-BEARING — this file must stay `.d.mts`. Under
 * `moduleResolution: "node"` TypeScript resolves a specifier ending in `.mjs`
 * by substituting ONLY `.mts` and `.d.mts`; it never consults `.d.ts` for a
 * `.mjs` import. Renaming this to `migration-set.d.ts` silently un-types the
 * module and TS7016 comes back — verified against tsc 5.6.3 with
 * `--traceResolution`. Do not "normalise" the extension.
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
  /** Cap on each lock wait, in ms. Default C2C_MIGRATION_LOCK_TIMEOUT_MS or 2000. */
  lockTimeoutMs?: number;
  /** Attempts per file before a lock timeout fails it. Default C2C_MIGRATION_LOCK_ATTEMPTS or 12. */
  lockAttempts?: number;
  /** First retry delay in ms, doubling to a 10 s cap. Default C2C_MIGRATION_LOCK_BACKOFF_MS or 1000. */
  lockBackoffMs?: number;
}

export interface MigrationLockPolicy {
  lockTimeoutMs: number;
  lockAttempts: number;
  lockBackoffMs: number;
}

/** The lock-wait policy, from the environment. */
export declare function migrationLockPolicy(env?: Record<string, string | undefined>): MigrationLockPolicy;

/** True for a statement that gave up waiting for a lock (SQLSTATE 55P03), also as `cause`. */
export declare function isLockTimeout(err: unknown): boolean;

/** Retry `attempt` (which rolls itself back) on lock timeouts, with backoff. */
export declare function retryOnLockTimeout<T>(
  attempt: () => Promise<T>,
  options: { label: string; attempts: number; backoffMs: number; log?: (message: string) => void },
): Promise<T>;

export interface ApplyMigrationResult {
  applied: string[];
  failures: Array<{ file: string; error: string }>;
}

/** Apply `files` (repo-relative) against `pool`, one transaction per file. */
export declare function applyMigrationFiles(
  pool: { query: (sql: string, params?: unknown[]) => Promise<any> },
  repoRoot: string,
  files: string[],
  options?: ApplyMigrationOptions,
): Promise<ApplyMigrationResult>;
