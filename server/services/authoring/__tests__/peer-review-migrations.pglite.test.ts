/** Both deployed review creators add bindings without manufacturing old evidence. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertNoSchemaGaps, createJourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';

const CREATORS = [
  'migrations/20260728_authoring_reviews.sql',
  'db/migrations/20260730_authoring_subsystem_schema.sql',
];
const BINDING_COLUMNS = ['reviewed_snapshot', 'reviewed_snapshot_hash', 'review_binding_basis'];

async function verifyCreator(file: string, upgrade: boolean) {
  const database = await createJourneyDb({ prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    ] });
  try {
    const sql = fs.readFileSync(path.resolve(file), 'utf8');
    const id = randomUUID();
    const reviewId = randomUUID();
    await database.pool.query(`INSERT INTO authoring_documents (id,title,created_by,tenant_id)
      VALUES ($1,$2,$3,$4)`, [id, 'Retained prior review', AUTHOR.id, ORG]);
    if (upgrade) {
      // Execute the original creator with only this additive amendment omitted.
      // Existing verdict/request bytes remain genuine rows, never fixture-backfilled bindings.
      const original = sql.split('\n').filter(line => !/\b(?:reviewed_snapshot|reviewed_snapshot_hash|review_binding_basis)\b/.test(line)).join('\n');
      await database.pglite.exec(original);
      await database.pool.query(`INSERT INTO authoring_reviews
        (id,doc_id,reviewer_id,review_status,review_comments,requested_by,tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [reviewId, id, '21', 'approved', 'Historical words remain', AUTHOR.id, ORG]);
    }
    await database.pglite.exec(sql);
    await database.pglite.exec(sql);
    const columns = await database.pool.query(`SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='authoring_reviews' AND column_name=ANY($1::text[])`, [BINDING_COLUMNS]);
    expect(columns.rows).toHaveLength(3);
    expect(columns.rows.every(row => (row as { is_nullable: string }).is_nullable === 'YES')).toBe(true);
    if (upgrade) {
      const prior = await database.pool.query('SELECT review_status, review_comments, reviewed_snapshot, reviewed_snapshot_hash, review_binding_basis FROM authoring_reviews WHERE id=$1 AND tenant_id=$2', [reviewId, ORG]);
      expect(prior.rows).toEqual([{ review_status: 'approved', review_comments: 'Historical words remain',
        reviewed_snapshot: null, reviewed_snapshot_hash: null, review_binding_basis: null }]);
    }
    const count = await database.pool.query('SELECT COUNT(*)::int AS count FROM authoring_reviews');
    expect(count.rows).toEqual([{ count: upgrade ? 1 : 0 }]);
    assertNoSchemaGaps(database);
  } finally { await database.close(); }
}

describe('additive human-review binding on each canonical creator', () => {
  it.each(CREATORS)('fresh creation and repeated replay: %s', file => verifyCreator(file, false), 180_000);
  it.each(CREATORS)('legacy verdict upgrade and repeated replay: %s', file => verifyCreator(file, true), 180_000);
});
