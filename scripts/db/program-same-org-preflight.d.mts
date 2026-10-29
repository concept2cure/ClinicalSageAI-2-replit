/**
 * Types for scripts/db/program-same-org-preflight.mjs.
 *
 * `scripts/` is outside tsconfig's `include`, so the .mjs is never type-checked
 * itself, but tests import it (tests/db/no-session-rls-bypass.dbtest.ts and the
 * schema-contract PGlite suites), and under `noImplicitAny` an untyped import is
 * a hard TS7016. Hand-written to match the .mjs; keep in step.
 *
 * THE EXTENSION IS LOAD-BEARING: this file must stay `.d.mts` (see
 * migration-set.d.mts). TypeScript resolves a `.mjs` specifier only via
 * `.mts` / `.d.mts`, never `.d.ts`.
 */

export interface ProgramSameOrgCheck {
  /** The keyed store, schema-qualified. */
  relation: string;
  keyColumn: string;
  /** The same-organization key that holds it, or null when none does yet. */
  keyedBy: string | null;
  /** The table the key names (default public.regulatory_programs). */
  references?: string;
  /** Returns the violating rows. */
  sql: string;
  remedy?: string;
}

export declare const PROGRAM_SAME_ORG_CHECKS: readonly ProgramSameOrgCheck[];

export interface ProgramSameOrgResult {
  relation: string;
  keyedBy: string | null;
  /** The store, or its key column, is not in this schema. */
  skipped: boolean;
  /**
   * Why this role could not read every tenant's rows (row security holds it to
   * the store and no policy the enforcement switch opens admits them). A refused
   * store is never reported clean (P-70, 2026-10-29).
   */
  refused?: string;
  rows: any[];
  remedy?: string | null;
}

/** `client.query(text, params)` must return `{ rows }` (pg or PGlite). */
export declare function runProgramSameOrgPreflight(client: {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}): Promise<ProgramSameOrgResult[]>;
