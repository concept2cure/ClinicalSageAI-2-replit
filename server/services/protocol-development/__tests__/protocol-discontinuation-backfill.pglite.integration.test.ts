/**
 * migrations/20260922b_protocol_discontinuation_section.sql — replay safety.
 *
 * CLAUDE.md Rule 1: every file in C2C_MIGRATION_FILES re-executes on every
 * deploy. This one INSERTs rows and SHIFTS order_index, which is exactly the
 * shape that destroys data on replay if its guard is wrong — run three times
 * without the guard and a protocol gains three duplicate sections while its
 * schedule-of-assessments section drifts three places down the document.
 *
 * So the test applies the real migration file (not a copy) twice, with an
 * author's edit written in between, and asserts the second run is a no-op.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'migrations/20260922b_protocol_discontinuation_section.sql'),
  'utf8',
);

const DDL = `
CREATE TABLE protocol_documents (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_kind text NOT NULL, title text, status text NOT NULL DEFAULT 'draft', created_by int NOT NULL, deleted_at timestamptz);
CREATE TABLE protocol_sections (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_document_id int NOT NULL, section_key text NOT NULL, title text NOT NULL, content text, required boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'not_started', order_index int NOT NULL DEFAULT 0, created_by int NOT NULL, deleted_at timestamptz);
`;

const SEED = `
INSERT INTO protocol_documents (organization_id, protocol_kind, title, status, created_by) VALUES
  (1,'clinical','Draft clinical','draft',5),
  (1,'clinical','Finalized clinical','finalized',5),
  (1,'irb','An IRB protocol','draft',5),
  (1,'clinical','Deleted clinical','draft',5);
UPDATE protocol_documents SET deleted_at = now() WHERE id = 4;
INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, order_index, created_by) VALUES
  (1,1,'intervention','Treatments',5,5),
  (1,1,'assessments','Schedule',6,5),
  (1,1,'statistics','Statistics',8,5),
  (1,2,'intervention','Treatments',5,5),
  (1,2,'assessments','Schedule',6,5);
`;

let pg: PGlite;

async function sections(docId: number): Promise<Array<{ key: string; order: number; content: string | null }>> {
  const r = await pg.query<{ section_key: string; order_index: number; content: string | null }>(
    `SELECT section_key, order_index, content FROM protocol_sections
      WHERE protocol_document_id = $1 ORDER BY order_index, id`,
    [docId],
  );
  return r.rows.map((x) => ({ key: x.section_key, order: x.order_index, content: x.content }));
}

beforeAll(() => { pg = new PGlite(); });

beforeEach(async () => {
  await pg.exec('DROP TABLE IF EXISTS protocol_sections; DROP TABLE IF EXISTS protocol_documents;');
  await pg.exec(DDL);
  await pg.exec(SEED);
});

describe('discontinuation backfill', () => {
  it('inserts the section after Treatments and shifts what followed', async () => {
    await pg.exec(MIGRATION);

    expect(await sections(1)).toEqual([
      { key: 'intervention', order: 5, content: null },
      { key: 'discontinuation', order: 6, content: null },
      { key: 'assessments', order: 7, content: null },
      { key: 'statistics', order: 9, content: null },
    ]);
  });

  it('leaves a finalized protocol alone — an approved record is not rewritten to score better', async () => {
    await pg.exec(MIGRATION);

    expect((await sections(2)).map((s) => s.key)).toEqual(['intervention', 'assessments']);
  });

  it('touches neither another protocol kind nor a deleted document', async () => {
    await pg.exec(MIGRATION);

    expect(await sections(3)).toEqual([]);
    expect(await sections(4)).toEqual([]);
  });

  it('is a no-op on replay, and does not disturb what an author wrote between deploys', async () => {
    await pg.exec(MIGRATION);
    await pg.exec(`UPDATE protocol_sections SET content = 'Dosing stops on confirmed DKA.', status = 'draft' WHERE section_key = 'discontinuation';`);

    await pg.exec(MIGRATION);

    expect(await sections(1)).toEqual([
      { key: 'intervention', order: 5, content: null },
      { key: 'discontinuation', order: 6, content: 'Dosing stops on confirmed DKA.' },
      { key: 'assessments', order: 7, content: null },
      { key: 'statistics', order: 9, content: null },
    ]);
  });

  it('stays a no-op across a third deploy', async () => {
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION);

    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM protocol_sections WHERE section_key = 'discontinuation'`,
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('appends rather than guessing a position when the anchor section is absent', async () => {
    await pg.exec(`DELETE FROM protocol_sections WHERE protocol_document_id = 1 AND section_key = 'intervention';`);

    await pg.exec(MIGRATION);

    expect(await sections(1)).toEqual([
      { key: 'assessments', order: 6, content: null },
      { key: 'statistics', order: 8, content: null },
      { key: 'discontinuation', order: 9, content: null },
    ]);
  });

  it('NOTICE-skips on a database that has no protocol tables at all', async () => {
    await pg.exec('DROP TABLE protocol_sections; DROP TABLE protocol_documents;');

    await expect(pg.exec(MIGRATION)).resolves.toBeDefined();
  });
});
