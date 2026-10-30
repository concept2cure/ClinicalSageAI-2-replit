/**
 * A recorded artifact version is never rewritten (MR-12 CAT2-20). PGlite, a
 * real engine: the tables and the version's foreign key to its artifact are
 * the baseline's, and the migration is the file the deploy applier replays.
 *
 * WHAT WENT WRONG
 * The only trigger written for concept2cure_artifact_versions is in
 * db/migrations/20260318_ga_immutability_hardening.sql, which no applier runs.
 * An UPDATE could rewrite a signed version's content and hash while its
 * signature still pointed at it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const BASELINE = 'migrations/0000_sweet_joseph.sql';
const MIGRATION = fs.readFileSync(path.join(REPO_ROOT, 'migrations/20261029k_artifact_versions_no_rewrite.sql'), 'utf8');
const VERSION_FK = fs
  .readFileSync(path.join(REPO_ROOT, BASELINE), 'utf8')
  .split('\n')
  .filter((l) => /^ALTER TABLE "concept2cure_artifact_versions" ADD CONSTRAINT .*REFERENCES "public"\."concept2cure_artifacts"/.test(l))
  .map((l) => l.replace('--> statement-breakpoint', ''))
  .join('\n');

let pg: PGlite;
const run = (sql: string) => pg.query<Record<string, any>>(sql);
const refused = async (sql: string) => {
  try {
    await pg.exec(sql);
    return 'ALLOWED';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(extractTableDdl(BASELINE, ['concept2cure_artifacts', 'concept2cure_artifact_versions']));
  expect(VERSION_FK, 'the baseline cascades from the artifact to its versions').toMatch(/ON DELETE cascade/);
  await pg.exec(VERSION_FK);
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // replayed on every deploy
  await run(`INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, type, category, title, content, version, status)
    VALUES (1, 'artifact_abc', 3, 99, 'document', 'document', 'Complaint handling', 'v2 body', 2, 'approved'),
           (2, 'artifact_def', 3, 99, 'document', 'document', 'Draft memo', 'draft', 1, 'draft')`);
  await run(`INSERT INTO concept2cure_artifact_versions (id, artifact_id, organization_id, version, content, content_hash)
    VALUES (1, 1, 99, 1, 'v1 body', 'h1'), (2, 1, 99, 2, 'v2 body', 'h2'), (3, 2, 99, 1, 'draft', 'h3')`);
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('concept2cure_artifact_versions refuses a rewrite', () => {
  it('records a new version, and moves the artifact head', async () => {
    await run(`INSERT INTO concept2cure_artifact_versions (id, artifact_id, organization_id, version, content, content_hash)
      VALUES (4, 1, 99, 3, 'v3 body', 'h4')`);
    await run(`UPDATE concept2cure_artifacts SET version = 3, content = 'v3 body' WHERE id = 1`);
    expect((await run(`SELECT count(*)::int AS n FROM concept2cure_artifact_versions WHERE artifact_id = 1`)).rows[0].n).toBe(3);
  });

  it.each([
    ['the content', `UPDATE concept2cure_artifact_versions SET content = 'rewritten' WHERE id = 1`],
    ['the hash', `UPDATE concept2cure_artifact_versions SET content_hash = 'h-forged' WHERE id = 1`],
    ['the version number', `UPDATE concept2cure_artifact_versions SET version = 9 WHERE id = 2`],
    ['the whole table', `TRUNCATE concept2cure_artifact_versions`],
  ])('refuses rewriting %s', async (_what, sql) => {
    expect(await refused(sql)).toMatch(/IMMUTABILITY_VIOLATION: concept2cure_artifact_versions is append-only/);
    expect((await run(`SELECT content, content_hash, version FROM concept2cure_artifact_versions WHERE id = 1`)).rows[0])
      .toEqual({ content: 'v1 body', content_hash: 'h1', version: 1 });
  });

  it("lets the purge's cascade delete an artifact with its versions", async () => {
    await run(`DELETE FROM concept2cure_artifacts WHERE id = 2`);
    expect((await run(`SELECT count(*)::int AS n FROM concept2cure_artifact_versions WHERE artifact_id = 2`)).rows[0].n).toBe(0);
  });
});
