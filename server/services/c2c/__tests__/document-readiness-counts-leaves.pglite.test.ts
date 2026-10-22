/**
 * c2c_documents.readiness counts the sections that hold content, not the
 * headings that hold other sections (FILING_SPINE F23 8/9).
 *
 * The trigger (migrations/20260528_phase9_document_schema.sql) divided the
 * approved or locked sections by EVERY row of the document. A heading that
 * holds other sections ('M1', 'M2', '3.2', '3.2.S') is never written and never
 * approved: approval moves only signed text, and a bare module heading never
 * receives any. So no CTD document could reach 100%. Approve every section of
 * an IND and it read 79.
 *
 * On PGlite with the real migration and the real rule packs:
 *   - with every content section approved, the trigger reads 100, and so does
 *     the home figure dossier-read computes from the same rows;
 *   - replaying the migration gives the same value, corrects a stale one, and
 *     leaves updated_at alone;
 *   - an empty heading is not counted, and a heading someone has written in is
 *     (review of F23 8/9: unsigned text at a heading must not read 100);
 *   - a 'todo' section that gains a child stops being counted;
 *   - re-parenting a section recounts the document.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createJourneyDb, extractTableDdl, REPO_ROOT, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { readDossierFigures } from '../dossier-read';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ORG = 7;
const IND = '22222222-2222-4222-8222-222222222222';
const MIGRATIONS = [
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260929_actor_names.sql',
  'migrations/20260609_audit_hmac_seal.sql',
  'migrations/20260524_program_workbench_schema.sql',
  'migrations/20260907_regulatory_programs_application_number.sql',
  'migrations/20260903_regulatory_programs_estar_device_fields.sql',
  'migrations/20260528_phase9_document_schema.sql',
  'migrations/20260804_phase9_rule_pack_outlines.sql',
  'migrations/20261015e_c2c_documents_filing_scope.sql',
  // A database that carries the generic updated_at stamp: the backfill must
  // still leave updated_at alone.
  'db/migrations/20260526_updated_at_triggers.sql',
];

let jdb: JourneyDb;
const one = async (sql: string, params: unknown[] = []) => (await jdb.pool.query(sql, params)).rows[0] as Record<string, unknown>;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'audit_logs']),
    migrations: MIGRATIONS,
  });
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Org', 'org', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, product_name, primary_agency, target_agencies, status)
     VALUES ($1, $2, 'IND', 'IND-1', 'ind', 'drug', 'Examplinib', 'FDA', '[]'::json, 'active')`, [IND, ORG]);
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT 'ind-doc', $1, $2, doc_type, agency, version, 'IND', 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = 'ind' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`,
    [ORG, IND],
  );
  await jdb.pool.query(
    `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
     SELECT 'ind-doc', s.key, s.parent_key, s.label, COALESCE(s.path_order, 0), COALESCE(s.mandatory, false), 'todo', '{}'::jsonb, 'template', 1
       FROM c2c_documents d JOIN c2c_rule_packs rp ON rp.doc_type = d.doc_type AND rp.agency = d.agency AND rp.version = d.rule_pack_version,
            jsonb_to_recordset(rp.required_sections) AS s(key text, parent_key text, label text, mandatory boolean, path_order integer)
      WHERE d.id = 'ind-doc'`,
  );
});
afterAll(async () => { await jdb?.close?.(); });

/** Approve every section that holds no other section. */
const approveContentSections = () => jdb.pool.query(
  `UPDATE c2c_document_sections s SET status = 'approved'
    WHERE s.document_id = 'ind-doc'
      AND NOT EXISTS (SELECT 1 FROM c2c_document_sections c WHERE c.document_id = s.document_id AND c.parent_key = s.section_key)`,
);

describe('readiness counts sections, not headings', () => {
  it('the pack has headings, and they are never approved', async () => {
    const r = await one(`SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM c2c_document_sections c WHERE c.document_id = s.document_id AND c.parent_key = s.section_key))::int AS headings,
                                count(*)::int AS rows
                           FROM c2c_document_sections s WHERE s.document_id = 'ind-doc'`);
    expect(Number(r.headings)).toBeGreaterThan(0);
    expect(Number(r.rows)).toBeGreaterThan(Number(r.headings));
  });

  it('with every content section approved, the document reads 100, and so does the home figure (at head: 79)', async () => {
    await approveContentSections();
    expect((await one(`SELECT readiness FROM c2c_documents WHERE id = 'ind-doc'`)).readiness).toBe(100);
    const figure = (await readDossierFigures(jdb.pool as never, ORG, [IND])).get(IND);
    expect(figure).toMatchObject({ state: 'measured', pct: 100 });
  });

  it('a replay with nothing stale changes nothing: not the figure, not updated_at', async () => {
    await jdb.pool.query(`UPDATE c2c_documents SET updated_at = '2026-02-02T00:00:00Z' WHERE id = 'ind-doc'`);
    const before = await one(`SELECT readiness, updated_at FROM c2c_documents WHERE id = 'ind-doc'`);
    await jdb.pglite.exec(fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql'), 'utf8'));
    const after = await one(`SELECT readiness, updated_at FROM c2c_documents WHERE id = 'ind-doc'`);
    expect(after.readiness).toBe(before.readiness);
    expect(new Date(String(after.updated_at)).toISOString()).toBe('2026-02-02T00:00:00.000Z');
  });

  it('replaying the migration keeps the value, corrects a stale one and leaves updated_at alone', async () => {
    await jdb.pool.query(`UPDATE c2c_documents SET readiness = 40, updated_at = '2026-01-01T00:00:00Z' WHERE id = 'ind-doc'`);
    // Every deploy re-runs every file of the set (CLAUDE.md Rule 1).
    await jdb.pglite.exec(fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql'), 'utf8'));
    const r = await one(`SELECT readiness, updated_at FROM c2c_documents WHERE id = 'ind-doc'`);
    expect(r.readiness).toBe(100);
    expect(new Date(String(r.updated_at)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    // The stamp the backfill set aside is back on: an ordinary edit is dated.
    const trig = await one(`SELECT tgenabled FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'c2c_documents'::regclass`);
    expect(trig.tgenabled).toBe('O');
    await jdb.pool.query(`UPDATE c2c_documents SET title = 'IND (retitled)' WHERE id = 'ind-doc'`);
    const edited = await one(`SELECT updated_at FROM c2c_documents WHERE id = 'ind-doc'`);
    expect(new Date(String(edited.updated_at)).getTime()).toBeGreaterThan(Date.parse('2026-06-01'));
  });

  it('a document with no sections keeps the figure it was inserted with on replay (a legacy row is not zeroed)', async () => {
    await jdb.pool.query(
      `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
       SELECT 'legacy-doc', $1, $2, doc_type, agency, rule_pack_version, 'Legacy', 'draft', 35 FROM c2c_documents WHERE id = 'ind-doc'`,
      [ORG, IND],
    );
    await jdb.pglite.exec(fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql'), 'utf8'));
    expect((await one(`SELECT readiness FROM c2c_documents WHERE id = 'legacy-doc'`)).readiness).toBe(35);
  });

  /** A small document whose figure tells the rules apart. */
  async function tiny(id: string, rows: Array<[string, string | null, string]>) {
    await jdb.pool.query(
      `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
       SELECT $1, $2, $3, doc_type, agency, rule_pack_version, $1, 'draft', 0 FROM c2c_documents WHERE id = 'ind-doc'`,
      [id, ORG, IND],
    );
    for (const [i, [key, parent, status]] of rows.entries()) {
      await jdb.pool.query(
        `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
         VALUES ($1, $2, $3, $2, $4, false, $5, '{}'::jsonb, 'template', 1)`,
        [id, key, parent, i + 1, status],
      );
    }
    return async () => Number((await one(`SELECT readiness FROM c2c_documents WHERE id = $1`, [id])).readiness);
  }

  it('an empty heading is not counted; a heading someone has written in is (review: unsigned text at a heading must not read 100)', async () => {
    const readiness = await tiny('tiny-heading', [['H', null, 'todo'], ['H.1', 'H', 'approved'], ['H.2', 'H', 'approved']]);
    // At head the empty heading was counted: 2 of 3.
    expect(await readiness()).toBe(100);
    await jdb.pool.query(`UPDATE c2c_document_sections SET status = 'drafted' WHERE document_id = 'tiny-heading' AND section_key = 'H'`);
    expect(await readiness()).toBe(67);
    await jdb.pool.query(`UPDATE c2c_document_sections SET status = 'approved' WHERE document_id = 'tiny-heading' AND section_key = 'H'`);
    expect(await readiness()).toBe(100);
  });

  it('a todo section that gains a child stops being counted: 1 of 2 becomes 2 of 2, never 2 of 3', async () => {
    const readiness = await tiny('tiny-child', [['A', null, 'todo'], ['B', null, 'approved']]);
    expect(await readiness()).toBe(50);
    await jdb.pool.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
       VALUES ('tiny-child', 'A.1', 'A', 'A.1', 3, false, 'approved', '{}'::jsonb, 'template', 1)`,
    );
    expect(await readiness()).toBe(100);
  });

  it('re-parenting a section recounts the document', async () => {
    const readiness = await tiny('tiny-move', [['P', null, 'todo'], ['Q', null, 'approved']]);
    expect(await readiness()).toBe(50);
    // Q moves under P: P is now an empty heading, and is not counted.
    await jdb.pool.query(`UPDATE c2c_document_sections SET parent_key = 'P' WHERE document_id = 'tiny-move' AND section_key = 'Q'`);
    expect(await readiness()).toBe(100);
  });
});
