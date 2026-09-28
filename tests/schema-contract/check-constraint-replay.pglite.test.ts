/**
 * @fileoverview A CHECK constraint that several files in the set define survives
 * the deploy that replays them all.
 *
 * RULE 1 (CLAUDE.md): `applyMigrationFiles` executes every C2C_MIGRATION_FILES
 * entry on every deploy. Three constraints in the set are widened by one file
 * and widened again by a later one, and each widening was the idiom
 *
 *     DROP CONSTRAINT IF EXISTS x;  ADD CONSTRAINT x CHECK (<this file's list>);
 *
 * run unconditionally. `ADD CONSTRAINT` validates every existing row. So on a
 * provisioned database the earlier file re-imposes its narrower list over rows
 * the later file admitted, the ADD fails, and the deploy stops at that file —
 * on every deploy from the first such row on. The drop-safety gate exempted the
 * idiom because "whichever such file runs last simply defines the object",
 * which is true of the end state and false of the step before it.
 *
 * The rows that trip it are ordinary product state:
 *
 *   document_span_lineage_kind_valid / _kind_shape
 *     20260907 (3 kinds) replayed over a `machine_draft` span — any AnA draft
 *     nobody has accepted yet (20260908 adds the kind).
 *   c2c_documents_doc_type_check
 *     20260806b replayed over an `mdr` / `ivdr` document — any EU MDR or IVDR
 *     technical file (20260810b adds the types).
 *   submission_orchestrator_runs_status_check
 *     the orchestrator store port replayed over an `awaiting-signature` run —
 *     any submission waiting on its e-signature (the e-sig gate port adds it).
 *
 * Each case below applies the files in the set's own order, stores one row that
 * only the newest definition admits, and replays the files exactly as a deploy
 * does. The replay must succeed, keep the row, and leave the constraint as it
 * found it — still refusing what it existed to refuse.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const sql = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The named files, in the order the applier runs them — never a hand-kept list. */
function inSetOrder(basenames: string[]): string[] {
  const files = (C2C_MIGRATION_FILES as string[]).filter(f =>
    basenames.some(b => f.endsWith(`/${b}`))
  );
  expect(files, 'every file this case replays is on the applier').toHaveLength(basenames.length);
  return files;
}

async function applyAll(db: PGlite, files: string[]) {
  for (const f of files) await db.exec(sql(f));
}

async function constraintDefs(db: PGlite, table: string, names: string[]) {
  const { rows } = await db.query<{ conname: string; def: string }>(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = $1::regclass AND conname = ANY($2::text[])
      ORDER BY conname`,
    [table, names]
  );
  return rows;
}

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

interface ReplayCase {
  name: string;
  table: string;
  constraints: string[];
  files: string[];
  /** Parents the files reference, stubbed to the column the reference needs. */
  setup: (db: PGlite) => Promise<void>;
  /** A row only the newest definition admits. */
  newestOnly: string;
  /** A row every definition refuses — proves the constraint is still enforced. */
  refused: string;
  count: string;
}

const CASES: ReplayCase[] = [
  {
    name: 'document_span_lineage kinds (20260803 → 20260907 → 20260908)',
    table: 'public.document_span_lineage',
    constraints: ['document_span_lineage_kind_shape', 'document_span_lineage_kind_valid'],
    files: inSetOrder([
      '20260803_document_span_lineage.sql',
      '20260907_span_lineage_accepted_machine_draft.sql',
      '20260908_span_lineage_machine_draft.sql',
    ]),
    setup: async d => {
      await d.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
                    INSERT INTO organizations (name) VALUES ('acme');`);
    },
    // An AnA draft nobody has accepted: a machine author and, deliberately, no asserter.
    newestOnly: `INSERT INTO document_span_lineage
        (document_table, document_id, char_start, char_end, span_text_sha256, usage,
         organization_id, provenance_kind, machine_author_id, created_by)
      VALUES ('coauthor_documents', 'doc-1', 0, 40, 'sha-span', 'summarized',
              1, 'machine_draft', 'ana', '4242')`,
    refused: `INSERT INTO document_span_lineage
        (document_table, document_id, char_start, char_end, span_text_sha256, usage,
         organization_id, provenance_kind, machine_author_id, asserted_by, asserted_at)
      VALUES ('coauthor_documents', 'doc-1', 40, 80, 'sha-span-2', 'summarized',
              1, 'machine_draft', 'ana', '4242', now())`,
    count: `SELECT COUNT(*)::int AS n FROM document_span_lineage WHERE provenance_kind = 'machine_draft'`,
  },
  {
    name: 'c2c_documents doc types (20260528 → 20260806b → 20260810b)',
    table: 'public.c2c_documents',
    constraints: ['c2c_documents_doc_type_check'],
    files: inSetOrder([
      '20260806b_anda_ide_filing_types.sql',
      '20260810b_eu_mdr_ivdr_outlines.sql',
    ]),
    setup: async d => {
      // The creator (20260528_phase9_document_schema) needs half the AnA schema
      // to apply. Its doc_type constraint is taken from the file itself, so this
      // fixture is the creator's definition, not a copy of it.
      const creator = sql(
        (C2C_MIGRATION_FILES as string[]).find(f =>
          f.endsWith('/20260528_phase9_document_schema.sql')
        )!
      );
      const clause = creator.match(
        /CONSTRAINT c2c_documents_doc_type_check\s+CHECK \([\s\S]*?\)\),/
      );
      expect(clause, "the creator's doc_type constraint").not.toBeNull();
      await d.exec(
        `CREATE TABLE c2c_documents (id SERIAL PRIMARY KEY, doc_type TEXT NOT NULL, ${clause![0].slice(
          0,
          -1
        )});`
      );
    },
    newestOnly: `INSERT INTO c2c_documents (doc_type) VALUES ('mdr')`,
    refused: `INSERT INTO c2c_documents (doc_type) VALUES ('not-a-filing')`,
    count: `SELECT COUNT(*)::int AS n FROM c2c_documents WHERE doc_type = 'mdr'`,
  },
  {
    name: 'submission_orchestrator_runs status (store port → e-sig gate port)',
    table: 'public.submission_orchestrator_runs',
    constraints: ['submission_orchestrator_runs_status_check'],
    files: inSetOrder([
      '20260725_submission_orchestrator_store_port.sql',
      '20260725_esig_gate_columns_port.sql',
    ]),
    setup: async d => {
      await d.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
                    INSERT INTO organizations (name) VALUES ('acme');
                    CREATE TABLE submissions (id SERIAL PRIMARY KEY);
                    CREATE TABLE electronic_signatures (id SERIAL PRIMARY KEY);`);
    },
    // A submission held at the e-signature gate — the state it sits in for days.
    newestOnly: `INSERT INTO submission_orchestrator_runs
        (run_id, submission_id, application_number, region, submission_type, started_at, status, organization_id)
      VALUES ('00000000-0000-4000-8000-000000000001', 'sub-1', 'IND 123456', 'US', 'original',
              now(), 'awaiting-signature', 1)`,
    refused: `INSERT INTO submission_orchestrator_runs
        (run_id, submission_id, application_number, region, submission_type, started_at, status, organization_id)
      VALUES ('00000000-0000-4000-8000-000000000002', 'sub-2', 'IND 123456', 'US', 'original',
              now(), 'transmitted-maybe', 1)`,
    count: `SELECT COUNT(*)::int AS n FROM submission_orchestrator_runs WHERE status = 'awaiting-signature'`,
  },
];

describe.each(CASES)('replaying the set over $name', c => {
  it('a fresh database converges on the newest definition', async () => {
    db = new PGlite();
    await c.setup(db);
    await applyAll(db, c.files);
    await expect(db.query(c.newestOnly)).resolves.toBeDefined();
    await expect(db.query(c.refused)).rejects.toThrow(/check constraint/i);
  });

  it('the next deploy succeeds over a row only the newest definition admits', async () => {
    db = new PGlite();
    await c.setup(db);
    await applyAll(db, c.files);
    await db.query(c.newestOnly);
    const before = await constraintDefs(db, c.table, c.constraints);
    expect(before).toHaveLength(c.constraints.length);

    // The deploy: every file again, in set order.
    await expect(applyAll(db, c.files)).resolves.toBeUndefined();

    const { rows } = await db.query<{ n: number }>(c.count);
    expect(rows[0].n).toBe(1);
    expect(await constraintDefs(db, c.table, c.constraints)).toEqual(before);
    await expect(db.query(c.refused)).rejects.toThrow(/check constraint/i);
  });
});
