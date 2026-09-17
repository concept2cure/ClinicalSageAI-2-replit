/**
 * Contract: the installer's push-surface check can see every table the schema
 * graph declares, and every one of them has something that actually creates it.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `scripts/db/install-fresh.mjs` verifies that `drizzle-kit push` did what its
 * exit code claims — push stops at the first failing statement and still exits
 * 0, so the exit code cannot be trusted and the tables are counted instead.
 *
 * Both halves of that count were public-only:
 *
 *   declaration side   /\bpgTable\(\s*['"`]([a-zA-Z0-9_]+)['"`]/
 *   existence side     WHERE table_schema = 'public'
 *
 * Drizzle has a second declaration form for a non-public schema:
 *
 *     const vault = pgSchema('vault');                    shared/schema/vault.ts:29
 *     export const vaultDocuments = vault.table('documents', { … });      :70
 *
 * and `shared/schema.ts:38` does `export * from './schema/vault'`, so those
 * files ARE in the reachable graph the installer walks. Executing the old regex
 * over that graph: 465 tables seen, 6 invisible — `vault.document_archives`,
 * `document_chunks`, `documents`, `evidence_citations`, `legal_holds`,
 * `retention_policies`. The installer printed "declared tables verified
 * present" having never looked at a schema.
 *
 * ── WHAT THE BLINDNESS WAS HIDING ────────────────────────────────────────────
 * `vault.evidence_citations` is declared (`shared/schema/vault.ts:193`) and its
 * only SQL creator is `db/migrations/_legacy/042_gcc_evidence_vault.sql`, which
 * is on NO applier:
 *
 *   - not in C2C_MIGRATION_FILES (265 entries, zero matches);
 *   - install-fresh's governed-content loop is a non-recursive
 *     `readdirSync('db/migrations')`, so it never descends into `_legacy/`;
 *   - CI's `ls db/migrations/*_gcc_*.sql` glob does not descend either;
 *   - `db/migrations/044c_gcc_vault_schema.sql`, which IS reachable, does not
 *     create it.
 *
 * So the table exists on no provisioned database — confirmed by querying one —
 * while `server/services/advancedRAGPipeline.ts:1316` INSERTs into it on every
 * retrieval that requests citation persistence. Executed against a canonically
 * provisioned database, that INSERT returns:
 *
 *     ERROR: relation "vault.evidence_citations" does not exist
 *
 * and `:1533` catches it into a `console.warn`, so the RAG answer returns
 * normally with its provenance silently unrecorded. `shared/schema/vault.ts:7`
 * meanwhile described the table as "INACTIVE — defined but no routes/services
 * query this table", which was false.
 *
 * This gate is the other half of the fix: the installer now sees the vault
 * schema, and this test keeps both properties true independently of it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  declaredTableEntries,
  unresolvedSchemaReceivers,
} from '../../scripts/db/lib/declared-tables.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The entrypoints drizzle.config.ts names, read the way install-fresh reads them. */
function drizzleEntrypoints(): string[] {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'drizzle.config.ts'), 'utf8');
  const arr = /schema:\s*\[([\s\S]*?)\]/.exec(text);
  if (arr) return [...arr[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const one = /schema:\s*['"]([^'"]+)['"]/.exec(text);
  return one ? [one[1]] : [];
}

const ENTRYPOINTS = drizzleEntrypoints();
const declared = declaredTableEntries(ENTRYPOINTS, REPO_ROOT);

/** Every .sql file an applier can actually reach. */
function applierReachableSql(): string[] {
  const out: string[] = [];
  // install-fresh step 3: the whole of migrations/, non-recursive.
  const rootDir = path.join(REPO_ROOT, 'migrations');
  if (fs.existsSync(rootDir)) {
    for (const f of fs.readdirSync(rootDir)) {
      if (f.endsWith('.sql')) out.push(path.join(rootDir, f));
    }
  }
  // install-fresh step 6 + CI: db/migrations/*_gcc_*.sql, ALSO non-recursive —
  // which is precisely why _legacy/ is unreachable.
  const gccDir = path.join(REPO_ROOT, 'db', 'migrations');
  if (fs.existsSync(gccDir)) {
    for (const f of fs.readdirSync(gccDir)) {
      if (f.endsWith('.sql')) out.push(path.join(gccDir, f));
    }
  }
  return out;
}

describe('the installer can see the whole declared table surface', () => {
  it('reads the drizzle entrypoints', () => {
    expect(ENTRYPOINTS.length).toBeGreaterThan(0);
    expect(ENTRYPOINTS).toContain('./shared/schema.ts');
  });

  it('sees tables in non-public schemas, not only pgTable() ones', () => {
    const schemas = new Set(declared.map((t) => t.schema));
    // The whole defect in one assertion: this set was {'public'}.
    expect([...schemas].sort()).toContain('vault');
    expect(declared.some((t) => t.schema === 'vault' && t.name === 'documents')).toBe(true);
  });

  it('attributes every schema-qualified table to a real pgSchema binding', () => {
    // A receiver it cannot resolve is a declaration form it does not know.
    // Reported, never silently skipped — silent skipping is the original bug.
    expect(unresolvedSchemaReceivers(ENTRYPOINTS, REPO_ROOT)).toEqual([]);
  });
});

describe('every declared non-public table has a creator an applier can reach', () => {
  // Public tables come from `drizzle-kit push` itself, which is what the
  // installer's own count verifies. Non-public ones do NOT: push emits no
  // vault DDL, so each needs a SQL creator on a path an applier actually walks.
  const nonPublic = declared.filter((t) => t.schema !== 'public');
  const sqlFiles = applierReachableSql();
  const corpus = sqlFiles.map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }));

  it('found both the tables and the applier-reachable SQL to check them against', () => {
    expect(nonPublic.length).toBeGreaterThan(0);
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it('leaves no declared table without a reachable creator', () => {
    const orphans: string[] = [];
    for (const t of nonPublic) {
      const re = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${t.schema}\\.${t.name}\\b`,
        'i',
      );
      if (!corpus.some((c) => re.test(c.text))) orphans.push(`${t.schema}.${t.name}`);
    }
    // Was: ['vault.evidence_citations'] — declared, INSERTed into by
    // advancedRAGPipeline.ts, and created only by a file under
    // db/migrations/_legacy/ that no applier's non-recursive glob descends into.
    expect(orphans).toEqual([]);
  });
});

describe('the _legacy tree is not an applier path, and nothing may rely on it', () => {
  it('is not reachable by the governed-content glob', () => {
    const gccDir = path.join(REPO_ROOT, 'db', 'migrations');
    const reachable = fs
      .readdirSync(gccDir)
      .filter((f) => f.includes('_gcc_') && f.endsWith('.sql'));
    // readdirSync is non-recursive: _legacy/042_gcc_evidence_vault.sql matches
    // the *name* pattern but is never listed. Pinned so that a future change to
    // recursive reading is a deliberate decision rather than an accident.
    expect(reachable.some((f) => f.startsWith('_legacy'))).toBe(false);
    expect(fs.existsSync(path.join(gccDir, '_legacy', '042_gcc_evidence_vault.sql'))).toBe(true);
  });
});
