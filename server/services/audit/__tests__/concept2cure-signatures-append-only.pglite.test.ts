/**
 * An artifact's signatures and lock snapshots are append-only in the database.
 * PGlite, a real engine: the tables and the two foreign keys that cascade into
 * `concept2cure_signatures` are exactly the baseline's, and the migration is
 * the file the deploy applier replays.
 *
 * WHAT WENT WRONG
 * No applier protected either table. Their only triggers are in
 * db/migrations/_legacy/ and in a migration that is not in C2C_MIGRATION_FILES.
 * An UPDATE could rewrite a signer's printed name, meaning or hash, and a
 * DELETE could remove a signature — directly, or through the ON DELETE CASCADE
 * from its artifact or version — while the artifact stayed approved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const BASELINE = 'migrations/0000_sweet_joseph.sql';
const MIGRATION = fs.readFileSync(
  path.join(REPO_ROOT, 'migrations/20260929_concept2cure_signatures_append_only.sql'),
  'utf8',
);
/** The baseline's foreign keys from the signature to its artifact and version (both ON DELETE CASCADE). */
const SIGNATURE_FKS = fs
  .readFileSync(path.join(REPO_ROOT, BASELINE), 'utf8')
  .split('\n')
  .filter((l) => /^ALTER TABLE "concept2cure_signatures" ADD CONSTRAINT .*REFERENCES "public"\."concept2cure_artifact(s|_versions)"/.test(l))
  .map((l) => l.replace('--> statement-breakpoint', ''))
  .join('\n');

let pg: PGlite;
const run = (sql: string, params: unknown[] = []) => pg.query<Record<string, any>>(sql, params);
const refused = async (sql: string) => {
  let error: unknown = null;
  try {
    await pg.exec(sql);
  } catch (e) {
    error = e;
  }
  // 'ALLOWED' when the statement went through: the failure then says so.
  return error instanceof Error ? error.message : 'ALLOWED';
};

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    extractTableDdl(BASELINE, [
      'concept2cure_artifacts',
      'concept2cure_artifact_versions',
      'concept2cure_signatures',
      'concept2cure_submission_snapshots',
    ]),
  );
  expect(SIGNATURE_FKS.split('ON DELETE cascade').length - 1, 'the baseline cascades from artifact and version').toBe(2);
  await pg.exec(SIGNATURE_FKS);
  await pg.exec(MIGRATION);
  await run(
    `INSERT INTO concept2cure_artifacts (id, artifact_id, project_id, organization_id, type, category, title, content, version, status)
     VALUES (1, 'artifact_abc', 3, 99, 'document', 'document', 'Clinical overview', 'body', 1, 'approved')`,
  );
  await run(
    `INSERT INTO concept2cure_artifact_versions (id, artifact_id, organization_id, version, content, content_hash)
     VALUES (1, 1, 99, 1, 'body', 'h1')`,
  );
  await run(
    `INSERT INTO concept2cure_signatures
       (signature_id, artifact_id, artifact_version_id, organization_id, signature_type, signature_purpose,
        signature_meaning, signer_id, signer_name, signer_email, signer_role, authentication_method,
        authentication_timestamp, second_factor_verified, signature_hash, signature_manifest, status, signed_at)
     VALUES ('sig_1', 1, 1, 99, 'approval', 'approval_attestation', 'approval', 5, 'Dana Reviewer',
             'dana@example.com', 'admin', 'password', now(), false, 'hash', '{}'::jsonb, 'active', now())`,
  );
  await run(
    `INSERT INTO concept2cure_submission_snapshots
       (snapshot_id, artifact_id, organization_id, version_id, content_hash, title, action_type, actor_id, actor_name)
     VALUES ('snap_1', 1, 99, 1, 'h1', 'Clinical overview', 'publish', 5, 'Dana Reviewer')`,
  );
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('concept2cure_signatures is append-only', () => {
  it('a new signature can be recorded', async () => {
    await run(
      `INSERT INTO concept2cure_signatures
         (signature_id, artifact_id, artifact_version_id, organization_id, signature_type, signature_purpose,
          signature_meaning, signer_id, signer_name, signer_email, authentication_method, authentication_timestamp,
          second_factor_verified, signature_hash, signature_manifest, status, signed_at)
       VALUES ('sig_2', 1, 1, 99, 'publish', 'publish_attestation', 'release', 5, 'Dana Reviewer',
               'dana@example.com', 'password', now(), false, 'hash2', '{}'::jsonb, 'active', now())`,
    );
    expect((await run(`SELECT count(*)::int AS n FROM concept2cure_signatures`)).rows[0].n).toBe(2);
  });

  it.each([
    ['rewriting the printed name', `UPDATE concept2cure_signatures SET signer_name = 'Someone Else' WHERE signature_id = 'sig_1'`],
    ['rewriting the meaning', `UPDATE concept2cure_signatures SET signature_meaning = 'review' WHERE signature_id = 'sig_1'`],
    ['deleting the signature', `DELETE FROM concept2cure_signatures WHERE signature_id = 'sig_1'`],
    ['truncating the table', `TRUNCATE concept2cure_signatures`],
    ['deleting the signed artifact (the cascade)', `DELETE FROM concept2cure_artifacts WHERE id = 1`],
    ['deleting the signed version (the cascade)', `DELETE FROM concept2cure_artifact_versions WHERE id = 1`],
  ])('%s is refused, and the signature stands as signed', async (_label, sql) => {
    const message = await refused(sql);

    expect(message, 'the statement was allowed').toMatch(/IMMUTABILITY_VIOLATION/);
    expect(
      (await run(`SELECT signer_name, signature_meaning FROM concept2cure_signatures WHERE signature_id = 'sig_1'`)).rows,
    ).toEqual([{ signer_name: 'Dana Reviewer', signature_meaning: 'approval' }]);
  });
});

describe('concept2cure_submission_snapshots is append-only', () => {
  it.each([
    ['rewriting the hash', `UPDATE concept2cure_submission_snapshots SET content_hash = 'other' WHERE snapshot_id = 'snap_1'`],
    ['deleting the snapshot', `DELETE FROM concept2cure_submission_snapshots WHERE snapshot_id = 'snap_1'`],
    ['truncating the table', `TRUNCATE concept2cure_submission_snapshots`],
  ])('%s is refused', async (_label, sql) => {
    expect(await refused(sql), 'the statement was allowed').toMatch(/IMMUTABILITY_VIOLATION/);
    expect((await run(`SELECT content_hash FROM concept2cure_submission_snapshots`)).rows).toEqual([{ content_hash: 'h1' }]);
  });
});

describe('the migration replays', () => {
  it('a second run (every deploy runs it again) succeeds and adds no second trigger', async () => {
    await pg.exec(MIGRATION);
    const { rows } = await run(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid IN ('concept2cure_signatures'::regclass, 'concept2cure_submission_snapshots'::regclass)
          AND NOT tgisinternal
        ORDER BY tgname`,
    );
    expect(rows.map((r) => r.tgname)).toEqual([
      'trg_concept2cure_signatures_append_only',
      'trg_concept2cure_signatures_no_truncate',
      'trg_concept2cure_submission_snapshots_append_only',
      'trg_concept2cure_submission_snapshots_no_truncate',
    ]);
  });
});
