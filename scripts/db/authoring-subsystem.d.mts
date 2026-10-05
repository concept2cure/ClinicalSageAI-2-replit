/**
 * Types for scripts/db/authoring-subsystem.mjs.
 *
 * The same reason as migration-set.d.mts: `scripts/` is outside tsconfig's
 * `include`, and under `noImplicitAny` a server test importing the .mjs is a
 * TS7016 error. A test that builds the authoring schema takes the file list
 * from the applier itself, so it cannot drift from what a deploy runs.
 *
 * Hand-written: the .mjs is the source of truth and stays plain ESM, run by
 * node with no build step. Keep these signatures in step with it. The
 * extension must stay `.d.mts` (see migration-set.d.mts).
 */

/** The authoring subsystem's migration files, in the order the applier runs them. */
export declare const AUTHORING_SUBSYSTEM_FILES: readonly string[];

/** The subsystem's tenant-keyed tables. */
export declare const AUTHORING_SUBSYSTEM_TABLES: readonly string[];

/** The subsystem's tables isolated by their parent document's tenant. */
export declare const AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES: ReadonlyArray<{ table: string; parentExists: string }>;

/** The composite tenant-parentage foreign keys the subsystem must carry. */
export declare const AUTHORING_SUBSYSTEM_FK_CONSTRAINTS: readonly string[];

/** Apply the subsystem as one atomic unit: its files, then tenant isolation. */
export declare function applyAuthoringSubsystem(
  pool: { query: (sql: string) => Promise<unknown> },
  repoRoot: string,
  options?: { log?: (message: string) => void },
): Promise<{ applied: string[] }>;
