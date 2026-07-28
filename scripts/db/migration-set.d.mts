/**
 * Type declarations for the untyped ESM module `scripts/db/migration-set.mjs`.
 *
 * WHY THIS FILE EXISTS. The out-of-band migration set is authored in plain
 * `.mjs` because it is consumed by two node scripts (apply-c2c-migrations.mjs
 * and deploy-migrate.mjs) that run outside any build step. But it is ALSO
 * imported by TypeScript tests that assert a migration is on the durable apply
 * path — server/services/ana/__tests__/{council-tool,deep-investigation}.test.ts
 * do exactly that. Under `noImplicitAny` those imports raised TS7016 ("could
 * not find a declaration file"), which is what put the repo's typecheck two
 * errors above its zero baseline.
 *
 * Declared, not inferred: `allowJs` is off, so tsc never reads the .mjs. Keep
 * this file in step with the real exports — a drift here is invisible at
 * runtime and only shows up as a type that lies.
 *
 * THE EXTENSION IS LOAD-BEARING — this file must be `migration-set.d.mts`.
 * Under `moduleResolution: "node"` (Node10) TypeScript resolves a specifier
 * ending in `.mjs` by substituting ONLY `.mts` and `.d.mts`; it never consults
 * `.d.ts` for a `.mjs` import. Renaming this to `migration-set.d.ts` silently
 * un-types the module again and TS7016 comes back — verified against tsc 5.6.3
 * with `--traceResolution`. Do not "normalise" the extension.
 */

/**
 * The ordered set of repo-relative .sql paths that no other durable path
 * applies. Ordering is load-bearing (prerequisites precede the files that ALTER
 * or reference their tables), so callers read it as a sequence, not a set.
 */
export declare const C2C_MIGRATION_FILES: string[];

/** The `pg` surface applyMigrationFiles actually uses — a Pool or a PoolClient. */
export interface MigrationQueryable {
  query(sql: string): Promise<unknown>;
}

export interface ApplyMigrationFilesOptions {
  /** Per-file success line. Defaults to a no-op. */
  log?: (message: string) => void;
  /** Per-file failure line. Defaults to a no-op. */
  error?: (message: string) => void;
  /**
   * Deploy path passes true so a faulted migration never leaves a deploy
   * applying further DDL on top of a schema move it has already failed.
   * Defaults to false (report every problem in one run).
   */
  stopOnFirstFailure?: boolean;
}

export interface ApplyMigrationFilesResult {
  applied: string[];
  failures: Array<{ file: string; error: string }>;
}

/** Apply `files` (repo-relative to `repoRoot`) against `pool`, one transaction per file. */
export declare function applyMigrationFiles(
  pool: MigrationQueryable,
  repoRoot: string,
  files: readonly string[],
  options?: ApplyMigrationFilesOptions,
): Promise<ApplyMigrationFilesResult>;
