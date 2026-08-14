/**
 * apply-rewrite writes columns that exist, and signs the version it produced.
 *
 * WHAT WAS WRONG. The version-snapshot INSERT named `title`, `status`,
 * `created_by` and `metadata` — none of which exist on
 * `concept2cure_artifact_versions` — and omitted `organization_id` and
 * `content_hash`, both NOT NULL. The statement sits inside the apply
 * transaction, so it raised 42703 and rolled the whole thing back:
 * POST /api/ana/submission-chat/apply-rewrite returned 500 for EVERY call on
 * any migration-provisioned database. Nothing in the repository tested this
 * module, which is how a wholly non-functional governed mutation survived.
 *
 * SECOND DEFECT, same block. The e-signature's `artifact_version_id` pointed at
 * the PREDECESSOR snapshot while the code comment claimed it was "bound to the
 * NEW version row". Its `signature_hash` covers the NEW content, so an
 * inspector following the link landed on the text that had just been replaced
 * and could not reproduce the hash. The root cause was that no version row was
 * ever written for the new content — the ledger held only superseded states —
 * so there was nothing correct to point at.
 *
 * These tests run the real statements against the REAL DDL in PGlite. A mocked
 * pool would accept any SQL as a no-op, which is exactly why the phantom
 * columns were invisible for as long as they were.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** The real table definition, lifted verbatim from the migration rather than
 *  hand-mirrored here — hand-mirroring is the drift this test exists to catch. */
function realVersionsDdl(): string {
  const sql = fs.readFileSync(
    path.join(REPO_ROOT, 'db/migrations/20260311_concept2cure_artifacts.sql'),
    'utf8',
  );
  const m = sql.match(
    /CREATE TABLE IF NOT EXISTS concept2cure_artifact_versions \(([\s\S]*?)\n\);/i,
  );
  if (!m) throw new Error('concept2cure_artifact_versions DDL not found');
  // FK targets are not created here; the columns and constraints are what matter.
  return `CREATE TABLE concept2cure_artifact_versions (${m[1]
    .replace(/\s+REFERENCES\s+\w+\([^)]*\)(\s+ON DELETE CASCADE)?/gi, '')
    .replace(/,\s*$/, '')}\n);`;
}

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(realVersionsDdl());
});

afterAll(async () => {
  await pg?.close();
});

const ORG = 7;
const ARTIFACT = 42;
const PREDECESSOR = '<h1>2.5</h1><p>Original body.</p>';
const REWRITTEN = '<h1>2.5</h1><p>Rewritten for EMA. [SRC-1]</p>';

const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

describe('apply-rewrite version writes — against the real DDL', () => {
  it('REGRESSION: the old statement fails on the real table', async () => {
    // Reproduces exactly what shipped. If this ever stops throwing, the table
    // grew the columns and this test should be revisited — not deleted.
    await expect(
      pg.query(
        `INSERT INTO concept2cure_artifact_versions
           (artifact_id, version, content, title, status, created_by, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [ARTIFACT, 1, PREDECESSOR, 'A title', 'draft', 3, '{}'],
      ),
    ).rejects.toThrow(/column .*(title|status|created_by|metadata).* does not exist/i);
  });

  it('the predecessor snapshot inserts with the columns the table has', async () => {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO concept2cure_artifact_versions
         (artifact_id, organization_id, version, content, content_hash,
          change_description, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ARTIFACT, ORG, 1, PREDECESSOR, sha(PREDECESSOR), 'Superseded by rewrite', 3],
    );
    expect(res.rows[0].id).toBeGreaterThan(0);
  });

  it('the snapshot carries the PREDECESSOR digest, not the incoming one', async () => {
    const res = await pg.query<{ content: string; content_hash: string }>(
      `SELECT content, content_hash FROM concept2cure_artifact_versions
        WHERE artifact_id = $1 AND version = 1`,
      [ARTIFACT],
    );
    // Labelling the superseded row with the digest of the text that replaced it
    // would make the ledger describe a version that never existed.
    expect(res.rows[0].content).toBe(PREDECESSOR);
    expect(res.rows[0].content_hash).toBe(sha(PREDECESSOR));
    expect(res.rows[0].content_hash).not.toBe(sha(REWRITTEN));
  });

  it('the NEW version gets its own row, so a signature has something to point at', async () => {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO concept2cure_artifact_versions
         (artifact_id, organization_id, version, content, content_hash,
          change_description, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ARTIFACT, ORG, 2, REWRITTEN, sha(REWRITTEN), 'AnA submission-chat rewrite', 3],
    );
    const newRowId = res.rows[0].id;
    expect(newRowId).toBeGreaterThan(0);

    // Following the signature's artifact_version_id must land on the bytes the
    // signature hash was computed over.
    const check = await pg.query<{ content: string; content_hash: string }>(
      `SELECT content, content_hash FROM concept2cure_artifact_versions WHERE id = $1`,
      [newRowId],
    );
    expect(check.rows[0].content).toBe(REWRITTEN);
    expect(check.rows[0].content_hash).toBe(sha(REWRITTEN));
  });

  it('predecessor and new version coexist under UNIQUE(artifact_id, version)', async () => {
    const res = await pg.query<{ version: number }>(
      `SELECT version FROM concept2cure_artifact_versions
        WHERE artifact_id = $1 ORDER BY version`,
      [ARTIFACT],
    );
    expect(res.rows.map(r => r.version)).toEqual([1, 2]);
  });

  it('re-writing the same version number is refused by the table', async () => {
    await expect(
      pg.query(
        `INSERT INTO concept2cure_artifact_versions
           (artifact_id, organization_id, version, content, content_hash, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ARTIFACT, ORG, 2, 'something else', sha('something else'), 3],
      ),
    ).rejects.toThrow();
  });

  it('SOURCE: the service writes no column outside the real set', async () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'server/services/ana/submission-chat-apply-rewrite.ts'),
      'utf8',
    );
    // `updated_at` is declared on the drizzle model but created by neither SQL
    // migration, so writing it would fail on exactly the databases this fix
    // serves. It must not appear in these statements.
    const inserts = [...src.matchAll(/INSERT INTO concept2cure_artifact_versions([\s\S]*?)VALUES/g)]
      .map(m => m[1]);
    expect(inserts.length).toBeGreaterThan(0);
    for (const cols of inserts) {
      expect(cols).not.toMatch(/\btitle\b|\bstatus\b|\bmetadata\b|\bupdated_at\b/);
      expect(cols).not.toMatch(/\bcreated_by\b(?!_id)/);
      expect(cols).toContain('organization_id');
      expect(cols).toContain('content_hash');
    }
  });
});
