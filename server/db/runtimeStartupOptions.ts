/**
 * The startup options every request-serving connection opens with.
 *
 * RLS enforcement is composed by `buildRlsStartupOptions` (rlsEnforcement.ts),
 * which stays the one owner of that setting. This adds the planner settings the
 * runtime pool needs on top of it.
 *
 * ── jit=off (MR-02, 2026-10-22) ──────────────────────────────────────────────
 * The data-eligibility predicates (`document-data-disposition/eligibility.ts`)
 * are SQL fragments composed into the atom, RAG and Vault searches. Composed,
 * `searchHybrid`'s statement is about 92 KB with a plan of ~920 nodes. When the
 * planner's cost estimate crosses `jit_above_cost` (as it does on a freshly
 * written, not-yet-analyzed table, and at any real data volume), Postgres
 * LLVM-compiles ~1,600 functions before running it: 20–30 s, against this
 * pool's 30 s statement_timeout. Measured on PostgreSQL 16: 26.2 s with JIT,
 * 11 ms without, same plan, same data. An OLTP request whose cost is the size
 * of its SQL text gains nothing from JIT, so it is off for every runtime
 * connection rather than per query: the RAG and Vault searches compose the
 * same fragments.
 *
 * Migrations and admin tooling use their own connections and keep the server's
 * default.
 */
import { buildRlsStartupOptions } from './rlsEnforcement';

/** Turns JIT off for the session; see the module note. */
export const RUNTIME_PLANNER_OPTIONS = '-c jit=off';

export function buildRuntimeStartupOptions(
  env: NodeJS.ProcessEnv = process.env,
  existingOptions = '',
): string {
  const rls = buildRlsStartupOptions(env, existingOptions);
  return [rls, RUNTIME_PLANNER_OPTIONS].filter(Boolean).join(' ');
}
