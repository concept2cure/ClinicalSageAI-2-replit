/**
 * Resolution stageRewrite — END-TO-END on PGlite (ledger L177).
 *
 * `stageRewrite` stages a resolution bundle's prepared rewrite as a NEW
 * `concept2cure_artifact_versions` row. Two defects, both invisible to the
 * resolution suite because its mocks answer any statement:
 *
 *   1. NO SPAN LINEAGE. A governed document gained a version whose clauses had
 *      no recorded origin, and the write was a bare `db.execute` — so even once
 *      lineage existed, the two would not have committed together.
 *   2. IT REPORTED SUCCESS WHEN IT WROTE NOTHING. The INSERT … SELECT matches
 *      no row when the artifact does not exist IN THIS TENANT, and the function
 *      returned `true` regardless, so the executor recorded
 *      `outcome: 'executed', newState: 'rewrite_staged'` for a rewrite the
 *      database never took (the shape of ledger L173).
 *
 * The resolution mocks now stub the lineage store; this file is where the
 * claims are checked against the real migrations.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const h = vi.hoisted(() => {
  const holder: { pg: any; drz: any } = { pg: null, drz: null };
  return { holder };
});
vi.mock('../../../db', () => ({
  get db() {
    return h.holder.drz;
  },
  getPool: () => ({}),
  pool: {},
}));

import { stageRewrite } from '../bundle-executor';

const ORG = 21;
const OTHER_ORG = 22;
const USER = 4242;
const CONTENT =
  'The primary endpoint is overall survival. Secondary endpoints follow the amended plan.';

async function q(sql: string, params: unknown[] = []) {
  const r = await h.holder.pg.query(sql, params);
  return r.rows as any[];
}

beforeAll(async () => {
  const pglite = new PGlite();
  h.holder.pg = pglite;
  h.holder.drz = drizzle(pglite as any);
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text, organization_id int, title text,
      content text, status text, version int);
    CREATE TABLE concept2cure_artifact_versions (
      id serial PRIMARY KEY, artifact_id int, organization_id int, version int,
      content text, content_hash text, change_description text, created_by_id int,
      created_at timestamptz);
  `);
  await pglite.query(`INSERT INTO organizations (id,name) VALUES ($1,'a'),($2,'b')`, [ORG, OTHER_ORG]);

  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of [
    'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'db/migrations/20260803_document_span_lineage.sql',
    'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql',
  ]) {
    await pglite.exec(readFileSync(resolve(here, '../../../../', rel), 'utf8'));
  }
}, 90_000);

afterAll(async () => {
  await h.holder.pg?.close();
});

beforeEach(async () => {
  await h.holder.pg.exec(
    `DELETE FROM document_span_lineage;
     DELETE FROM concept2cure_artifact_versions;
     DELETE FROM concept2cure_artifacts;`,
  );
});

async function seedArtifact(orgId: number): Promise<string> {
  const rows = await q(
    `INSERT INTO concept2cure_artifacts (artifact_id, organization_id, title, content, status, version)
     VALUES ('artifact_x', $1, 't', 'old text', 'draft', 1) RETURNING id`,
    [orgId],
  );
  return String(rows[0].id);
}

describe('stageRewrite attributes what it stages, and admits when it stages nothing', () => {
  it('writes the version AND its author lineage', async () => {
    const artifactId = await seedArtifact(ORG);

    const staged = await stageRewrite(ORG, USER, 'artifact', artifactId, CONTENT, 'bundle-1');
    expect(staged).toBe(true);

    const versions = await q(`SELECT content, version FROM concept2cure_artifact_versions`);
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe(CONTENT);

    const spans = await q(
      `SELECT provenance_kind, char_start, char_end, asserted_by, document_id
         FROM document_span_lineage
        WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY char_start`,
      [ORG],
    );
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans.every((s) => s.provenance_kind === 'author_assertion')).toBe(true);
    expect(spans.every((s) => String(s.asserted_by) === String(USER))).toBe(true);
    expect(spans.every((s) => String(s.document_id) === artifactId)).toBe(true);
    expect(Math.max(...spans.map((s) => Number(s.char_end)))).toBe(CONTENT.length);
  });

  it('REFUSES a cross-tenant artifact instead of reporting a rewrite it never made', async () => {
    // The artifact exists, but in another organization. The INSERT … SELECT
    // matches nothing; the old code still answered true.
    const foreignArtifactId = await seedArtifact(OTHER_ORG);

    const staged = await stageRewrite(ORG, USER, 'artifact', foreignArtifactId, CONTENT, 'bundle-1');
    expect(staged).toBe(false);

    expect(await q(`SELECT 1 FROM concept2cure_artifact_versions`)).toHaveLength(0);
    expect(await q(`SELECT 1 FROM document_span_lineage`)).toHaveLength(0);
  });

  it('FAILS CLOSED — a broken lineage write rolls the staged version back', async () => {
    const artifactId = await seedArtifact(ORG);
    await h.holder.pg.exec(`ALTER TABLE document_span_lineage RENAME TO document_span_lineage_hidden;`);
    try {
      const staged = await stageRewrite(ORG, USER, 'artifact', artifactId, CONTENT, 'bundle-1');
      expect(staged).toBe(false);
      // The version must not survive a lineage it could not record.
      expect(await q(`SELECT 1 FROM concept2cure_artifact_versions`)).toHaveLength(0);
    } finally {
      await h.holder.pg.exec(
        `ALTER TABLE document_span_lineage_hidden RENAME TO document_span_lineage;`,
      );
    }
  });
});
