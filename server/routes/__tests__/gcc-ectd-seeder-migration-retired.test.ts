/**
 * R1 batch 1, S05b (2026-11-09, founder-approved): migration 038, the GCC eCTD seeder, is retired.
 *
 * `db/migrations/038_gcc_ectd_seeder_service.sql` created a small `ectd` schema: a module tree
 * (`ectd.module_structure`), project folders (`ectd.project_folders`), three functions and two views. Nothing in
 * the server, the client or shared code reads any of it. Its last two readers were deleted on 2026-10-15
 * (`server/services/ectd/ECTDScaffoldingService.ts`) and 2026-10-25 (`server/api/ectd/routes.ts`). The screen that
 * once used its endpoints (`client/src/components/gcc/ECTDModuleBrowser.tsx`) went on 2026-05-01.
 *
 * Only `install-fresh` step 6 and the CI psql loops applied it, through their `*_gcc_*` glob. It was never in
 * `C2C_MIGRATION_FILES`, so deleting it appends no DROP and changes no deployed database (CLAUDE.md RULE 1).
 *
 * What does the job instead: a project's filing documents are scaffolded from the record when the project is
 * created, by `scaffoldProjectDocuments` (`server/services/c2c/scaffold-project-documents.ts`), called by
 * `POST /api/c2c/projects` (`server/routes/c2c/projects.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MIGRATION = '038_gcc_ectd_seeder_service.sql';

/** Every non-test source file under a folder, relative to the repository root. */
function sources(rel: string): string[] {
  return fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).flatMap((e) => {
    const p = path.join(rel, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('S05b: migration 038 (the GCC eCTD seeder) is retired', () => {
  it('the migration file is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'db/migrations', MIGRATION))).toBe(false);
  });

  it('the migrations manifest no longer lists it', () => {
    expect(read('db/migrations/migrations_manifest.json')).not.toContain(MIGRATION);
  });

  it('it was never on the deploy applier, so no DROP is owed (RULE 1)', () => {
    expect(read('scripts/db/migration-set.mjs')).not.toContain(MIGRATION);
  });

  it('no server, client or shared code reads the ectd schema it created', () => {
    const readers = ['server', 'shared', 'client/src']
      .flatMap(sources)
      .filter((file) => /\bectd\.(module_structure|project_folders)\b/.test(read(file)));
    expect(readers).toEqual([]);
  });

  it('the replacement is reached: project creation scaffolds the filing documents', () => {
    expect(read('server/services/c2c/scaffold-project-documents.ts')).toMatch(/export async function scaffoldProjectDocuments\(/);
    expect(read('server/routes/c2c/projects.ts')).toMatch(/\bscaffoldProjectDocuments\(/);
  });
});
