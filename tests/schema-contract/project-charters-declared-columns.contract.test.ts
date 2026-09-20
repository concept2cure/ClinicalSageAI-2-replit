/**
 * Contract: every column `projectCharters` declares exists on a deployed
 * database.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `server/routes/charters.ts` issues an UNQUALIFIED Drizzle select:
 *
 *     const rows = await d.select().from(projectCharters).where(…)
 *
 * which expands to every column the declaration names. The declaration names
 * 52; the table has 27. Twenty-one do not exist, so the statement raises 42703
 * on every database. Executed against a canonically provisioned one:
 *
 *     ERROR: column "pma_config" does not exist
 *
 * `server/routes/pma-workflow-routes.ts` is worse, because it uses raw SQL and
 * so names the column explicitly in three statements — a SELECT (:71), an
 * UPDATE (:34) and an INSERT (:43). The whole PMA workflow-progress feature
 * cannot work anywhere.
 *
 * ── WHY PUSH DOES NOT SAVE IT (a correction) ─────────────────────────────────
 * It would be natural to assume `drizzle-kit push` creates this table from the
 * 52-column declaration. It does not, and an earlier note in this work order
 * (finding 3) wrongly said it did. `drizzle.config.ts` names three entrypoints —
 * `shared/schema.ts`, `shared/schema/ana-intelligence.ts`,
 * `shared/schema/report-os.ts`. `shared/schema/project-charter.ts` is
 * re-exported only from `shared/schema/index.ts`, which is NOT an entrypoint and
 * is not reachable from one. So the charter tables are outside the push surface
 * entirely, and `migrations/0012_project_charter_timeline.sql` — the only
 * creator of `project_charters`, frozen at 27 columns — is what every database
 * actually gets, from install-fresh's overlay.
 *
 * That is also why the gap is permanent rather than transient: no file in
 * `C2C_MIGRATION_FILES` creates or alters this table, so nothing on the
 * replaying applier has ever been able to close it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { declaredTableEntries } from '../../scripts/db/lib/declared-tables.mjs';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DECL = path.join(REPO_ROOT, 'shared/schema/project-charter.ts');

/** snake_case column names the projectCharters declaration asks for. */
function declaredColumns(): string[] {
  const src = fs.readFileSync(DECL, 'utf8');
  const block = /export const projectCharters = pgTable\(([\s\S]*?)\n\);/.exec(src);
  if (!block) throw new Error('projectCharters declaration not found');
  // Drizzle names the physical column in the first string argument.
  return [
    ...new Set(
      [...block[1].matchAll(/\b(?:text|integer|json|jsonb|boolean|timestamp|uuid|numeric|decimal|serial)\(\s*'([a-z0-9_]+)'/g)]
        .map((m) => m[1]),
    ),
  ];
}

/** Columns any file on the replaying applier creates or adds for this table. */
function applierProvidedColumns(): Set<string> {
  const out = new Set<string>();
  for (const rel of C2C_MIGRATION_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8').replace(/--.*$/gm, '');
    if (!/project_charters/.test(text)) continue;
    for (const m of text.matchAll(
      /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?project_charters\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-z0-9_]+)"?/gi,
    )) out.add(m[1]);
    const create = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?project_charters\s*\(([\s\S]*?)\n\s*\);/i.exec(text);
    if (create) {
      for (const line of create[1].split('\n')) {
        const c = /^\s*"?([a-z][a-z0-9_]*)"?\s+[a-zA-Z]/.exec(line.replace(/--.*$/, ''));
        if (c && !/^(primary|foreign|unique|check|constraint)$/i.test(c[1])) out.add(c[1]);
      }
    }
  }
  return out;
}

describe('the premises this contract rests on', () => {
  it('project_charters is NOT on the drizzle push surface', () => {
    const pushed = declaredTableEntries(
      ['./shared/schema.ts', './shared/schema/ana-intelligence.ts', './shared/schema/report-os.ts'],
      REPO_ROOT,
    ).map((t) => t.name);
    // So push cannot reconcile the shape, and only SQL on an applier can.
    expect(pushed).not.toContain('project_charters');
  });

  it('charters.ts selects every declared column, unqualified', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'server/routes/charters.ts'), 'utf8');
    expect(src.replace(/\s+/g, ' ')).toContain('.select() .from(projectCharters)');
  });

  it('pma-workflow-routes.ts names pma_config in raw SQL', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'server/routes/pma-workflow-routes.ts'), 'utf8');
    expect(src).toMatch(/SELECT pma_config FROM project_charters/);
    expect(src).toMatch(/SET pma_config/);
  });

  it('the declaration parses to a real column list', () => {
    expect(declaredColumns().length).toBeGreaterThan(40);
  });
});

/** Columns migrations/0012 — the base creator, on install-fresh's overlay — makes. */
function baseCreatorColumns(): Set<string> {
  const text = fs
    .readFileSync(path.join(REPO_ROOT, 'migrations/0012_project_charter_timeline.sql'), 'utf8')
    .replace(/--.*$/gm, '');
  const create = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?project_charters\s*\(([\s\S]*?)\n\s*\);/i.exec(text);
  const out = new Set<string>();
  if (!create) return out;
  for (const line of create[1].split('\n')) {
    const c = /^\s*"?([a-z][a-z0-9_]*)"?\s+[a-zA-Z]/.exec(line);
    if (c && !/^(primary|foreign|unique|check|constraint)$/i.test(c[1])) out.add(c[1]);
  }
  return out;
}

describe('every declared column exists on a provisioned database', () => {
  /* The invariant is the UNION, not the applier alone. Every database is
     install-fresh-provisioned (deploy-migrate refuses an unprovisioned one), so
     0012's CREATE TABLE always runs and supplies the base 27. What the applier
     must supply is the remainder — and it supplied nothing, which is why
     d.select() raised 42703 everywhere.

     Deliberately NOT asserted: that the applier re-creates the whole table. A
     second CREATE TABLE for project_charters would be a rival definition of
     0012's and would trip ci:duplicate-table-ddl — the cure being worse than
     the disease. ALTER ... ADD COLUMN IF NOT EXISTS is the convergent form. */
  it('leaves no declared column unprovided by base-creator ∪ applier', () => {
    const provided = new Set([...baseCreatorColumns(), ...applierProvidedColumns()]);
    const missing = declaredColumns().filter((c) => !provided.has(c));
    // Was: the 21 the declaration adds on top of 0012's 27.
    expect(missing).toEqual([]);
  });

  it('puts every column 0012 lacks on the replaying applier', () => {
    const base = baseCreatorColumns();
    expect(base.size).toBeGreaterThan(20); // the parse works
    const applier = applierProvidedColumns();
    const orphaned = declaredColumns().filter((c) => !base.has(c) && !applier.has(c));
    expect(orphaned).toEqual([]);
  });

  it('provides pma_config, which raw SQL names explicitly', () => {
    const provided = new Set([...baseCreatorColumns(), ...applierProvidedColumns()]);
    expect([...provided]).toContain('pma_config');
  });
});
