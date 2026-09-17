/**
 * The table surface `drizzle-kit push` will create from the configured schema
 * entrypoints.
 *
 * Extracted from scripts/db/install-fresh.mjs on 2026-09-11 (WO-15 finding 8)
 * so it can be tested directly. install-fresh runs `main()` at module load, so
 * nothing could import the function while it lived there, and a verification
 * routine no test can reach is a verification routine nobody has checked.
 *
 * ── Scoping ──────────────────────────────────────────────────────────────────
 * Scoped exactly the way drizzle scopes it: every entrypoint named in
 * `drizzle.config.ts`, plus whatever each entrypoint recursively re-exports
 * (`export * from './schema/…'`) — and nothing else under `shared/`. Modules
 * outside that reachable graph are not push inputs; counting them would fail an
 * install that is in fact complete, which is worse than the silence it replaces.
 *
 * Read from source text rather than by importing: this runs against a database
 * that may not exist yet, and importing pulls in the whole Drizzle graph.
 *
 * ── Two declaration forms, not one (corrected 2026-09-11) ────────────────────
 * This function previously carried the comment "The declaration form is uniform
 * — `pgTable('name', …)` — so a regex over the reachable files is sufficient."
 * That was false, and the falsehood was load-bearing. Drizzle has a second form
 * for a non-public schema:
 *
 *     const vault = pgSchema('vault');
 *     export const vaultDocuments = vault.table('documents', { … });
 *
 * `shared/schema/vault.ts` is reachable (`shared/schema.ts` re-exports it) and
 * declares SIX tables that way. The old regex matched none of them, so the
 * installer verified 465 tables, reported the push surface verified, and had
 * never looked at an entire schema. `vault.evidence_citations` was missing from
 * every provisioned database for exactly as long as that held, and
 * server/services/advancedRAGPipeline.ts has been INSERTing into it.
 *
 * Views are excluded (`pgView`/`pgMaterializedView`): push does not create them.
 */
import fs from 'node:fs';
import path from 'node:path';

/** `pgTable('name', …)` — a table in the default (public) schema. */
const PUBLIC_TABLE = /\bpgTable\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;

/**
 * `<ident>.table('name', …)` — a table in a named schema.
 *
 * The receiver is resolved to the schema NAME via its `pgSchema('…')` binding
 * rather than assumed from the variable name, because the two need not match
 * and a guess would put a table in the wrong schema — which reads as a missing
 * table and is worse than not looking.
 */
const SCHEMA_TABLE = /\b([a-zA-Z_$][\w$]*)\.table\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;
const SCHEMA_BINDING = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*pgSchema\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;

/** Every file reachable from the configured entrypoints via `export * from`. */
export function reachableSchemaFiles(entrypoints, repoRoot) {
  const files = [];
  const queued = entrypoints.map((entry) => path.resolve(repoRoot, entry));
  const seen = new Set();

  // A queue keeps this correct if an entrypoint gains a second level of barrel
  // files later; `seen` prevents cycles from turning verification into a hang.
  while (queued.length > 0) {
    const file = queued.shift();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (!fs.existsSync(file)) continue;
    files.push(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = path.resolve(path.dirname(file), `${m[1]}${suffix}`);
        if (fs.existsSync(candidate)) {
          queued.push(candidate);
          break;
        }
      }
    }
  }
  return files;
}

/**
 * Every table the configured schema graph declares, as `{ schema, name }`.
 *
 * Sorted by `schema.name` so callers get a stable order.
 */
export function declaredTableEntries(entrypoints, repoRoot) {
  const files = reachableSchemaFiles(entrypoints, repoRoot);
  const entries = new Map();

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');

    // Resolve `pgSchema` bindings within this file first, so a `x.table(…)`
    // can be attributed to the schema x actually names.
    const schemaOf = new Map();
    for (const m of src.matchAll(SCHEMA_BINDING)) schemaOf.set(m[1], m[2]);

    for (const m of src.matchAll(PUBLIC_TABLE)) {
      entries.set(`public.${m[1]}`, { schema: 'public', name: m[1] });
    }
    for (const m of src.matchAll(SCHEMA_TABLE)) {
      const schema = schemaOf.get(m[1]);
      // An unresolvable receiver is NOT guessed at and NOT silently dropped —
      // it is reported, so a third declaration form surfaces as a question
      // rather than as a table that quietly stops being verified.
      if (!schema) continue;
      entries.set(`${schema}.${m[2]}`, { schema, name: m[2] });
    }
  }

  return [...entries.values()].sort((a, b) =>
    `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`),
  );
}

/**
 * Receivers written as `<ident>.table('…')` whose `pgSchema` binding could not
 * be resolved in the same file. Empty is the expected answer; a non-empty
 * result means the extractor has stopped covering something and should be
 * taught the new form rather than left to under-report.
 */
export function unresolvedSchemaReceivers(entrypoints, repoRoot) {
  const out = [];
  for (const file of reachableSchemaFiles(entrypoints, repoRoot)) {
    const src = fs.readFileSync(file, 'utf8');
    const schemaOf = new Map();
    for (const m of src.matchAll(SCHEMA_BINDING)) schemaOf.set(m[1], m[2]);
    for (const m of src.matchAll(SCHEMA_TABLE)) {
      if (!schemaOf.has(m[1])) out.push({ file, receiver: m[1], table: m[2] });
    }
  }
  return out;
}

/**
 * Back-compat: bare names, public schema only.
 *
 * Retained because the `db:check-schema-entrypoints` reporting path counts
 * public tables and says so. Callers verifying a push MUST use
 * `declaredTableEntries` instead — a bare name cannot express which schema a
 * table belongs to, which is the whole defect this module was extracted to fix.
 */
export function declaredPublicTableNames(entrypoints, repoRoot) {
  return declaredTableEntries(entrypoints, repoRoot)
    .filter((t) => t.schema === 'public')
    .map((t) => t.name);
}
