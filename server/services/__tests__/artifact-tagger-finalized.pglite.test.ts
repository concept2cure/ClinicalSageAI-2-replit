/**
 * The one artifact writer (tagArtifact) writes an artifact as a draft or in
 * review, and never over an approved or locked one (2026-10-01, D5; review of
 * dacc2ff84). PGlite, a real engine; the real writer.
 *
 * Every caller reaches it: AnA create_artifact through governed execution (the
 * confirm tier — one click, no reason, no password) and POST
 * /api/cortex/save-draft. It wrote whatever status it was given, so either
 * could put an artifact at 'locked' with no signature; and its section branch
 * picked any artifact in the section and replaced its content and status, so a
 * signed, locked document could be rewritten and set back to draft.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { extractTableDdl, REPO_ROOT } from '../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));

vi.mock('../../db/runtime.js', async () => {
  const { pglitePool } = await import('../ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { getPool: () => pool };
});
// Provenance and the governed-context contract are not this writer's rule.
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenance: vi.fn(async () => undefined) }));

import { ArtifactWriteRefusedError, tagArtifact } from '../artifact-tagger';

const DDL = [
  extractTableDdl('migrations/0000_sweet_joseph.sql', ['concept2cure_artifacts', 'concept2cure_artifact_versions']),
  ...[
    'db/migrations/20260508_artifact_citations.sql',
    'db/migrations/20260629_ana_artifact_thread_lookup.sql',
    'db/migrations/20260828_artifact_versions_updated_at.sql',
    'db/migrations/20260828_align_written_columns_with_migrations.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

const ORG = 99;
const PROJECT = 3;
const run = (sql: string, p: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, p);
const rows = async () =>
  (await run(`SELECT artifact_id, status, content, version FROM concept2cure_artifacts ORDER BY id`)).rows;
const write = (over: Record<string, unknown>) =>
  tagArtifact({
    projectId: PROJECT,
    organizationId: ORG,
    userId: 7,
    sectionCode: '2.5',
    title: 'Clinical overview',
    content: 'AnA draft text',
    ...over,
  } as Parameters<typeof tagArtifact>[0]);

async function seedSection(status: string) {
  await run(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, organization_id, project_id, type, category, title, content, content_hash, version, status, ctd_section)
     VALUES ('artifact_signed', $1, $2, 'document', 'document', 'Clinical overview', 'signed text', 'sha', 2, $3, '2.5')`,
    [ORG, PROJECT, status],
  );
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec(`DELETE FROM concept2cure_artifact_versions; DELETE FROM concept2cure_artifacts;`);
});

describe('an artifact is written as a draft or in review', () => {
  it.each([['locked'], ['approved'], ['Approved'], [' LOCKED '], ['published'], ['effective']])(
    'status %j: refused before anything is written',
    async status => {
      const err = await write({ status }).catch(e => e);
      expect(err).toBeInstanceOf(ArtifactWriteRefusedError);
      expect(err.code).toBe('STATUS_NOT_WRITABLE');
      expect(await rows()).toEqual([]);
    },
  );

  it.each([['draft'], ['review'], [undefined]])('status %j: written', async status => {
    const result = await write({ status });
    expect(result.isNew).toBe(true);
    expect((await rows()).map(r => r.status)).toEqual([status ?? 'draft']);
  });
});

describe('an approved or locked artifact is not overwritten', () => {
  it.each([['locked'], ['approved'], ['Locked']])('the section holds a %s artifact: refused, its text and status as signed', async status => {
    await seedSection(status);
    const err = await write({ status: 'draft' }).catch(e => e);
    expect(err).toBeInstanceOf(ArtifactWriteRefusedError);
    expect(err.code).toBe('FINALIZED_ARTIFACT');
    expect(await rows()).toEqual([{ artifact_id: 'artifact_signed', status, content: 'signed text', version: 2 }]);
  });

  it('the section holds a draft: it is updated, as before', async () => {
    await seedSection('draft');
    const result = await write({ status: 'review' });
    expect(result.isNew).toBe(false);
    expect(await rows()).toEqual([{ artifact_id: 'artifact_signed', status: 'review', content: 'AnA draft text', version: 3 }]);
  });
});
