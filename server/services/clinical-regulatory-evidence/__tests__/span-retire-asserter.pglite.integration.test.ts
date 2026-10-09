/**
 * Retiring a span is keyed on WHO asserted it, not only on where it sits.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The writers and the retirers disagreed about what identifies a span.
 *
 *   recordAuthorSpan  upserts on (document, char_start, char_end, asserted_by)
 *                     — its existing-row lookup carries `AND asserted_by = $6`.
 *   replaceAuthorSpans retired on (char_start, char_end) alone.
 *
 * So a second author who edits a clause to the SAME LENGTH gets a new row for
 * their range, while the first author's row — same range, different asserter —
 * is not retired, because its range is still in the keep set. Two live
 * author_assertion rows then describe the same characters and name different
 * people as having asserted them, over text only one of them wrote.
 *
 * replaceMachineSpans had the same shape one dimension along: its key is
 * `kind:start:end`, so two different acceptors stay live for one clause, each
 * claiming to be the human who accepted it.
 *
 * Under Part 11 that is the attribution question answered two contradictory
 * ways at once, and the Data Origins panel reads whichever row it happens to
 * order first. The source-span replacer in the same file already keys on all
 * three ("the unique index enforces — so the keep-set is keyed on all three");
 * these two were the ones that did not.
 *
 * ── The trap in the fix ───────────────────────────────────────────────────────
 * `machine_draft` rows carry asserted_by IS NULL by constraint. In SQL
 * `'a' || ':' || NULL` is NULL, and `NULL <> ALL (...)` is NULL rather than
 * true — so adding asserted_by to the predicate without COALESCE would stop
 * retiring unaccepted machine drafts ENTIRELY, replacing a contradiction with
 * a leak. The last case here exists to catch exactly that.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as R[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { enforceAuthorLineage } from '../lineage-gate';
import * as lineage from '../span-lineage.service';

const ORG = 811;
const ALICE = '1111';
const BOB = '2222';
const TABLE = 'q_sub_section_bodies';

/** Same length, so the clause occupies the identical character range. */
const V1 = 'The recommended starting dose is 10 mg once daily for adult patients.';
const V2 = 'The recommended starting dose is 90 mg once daily for adult patients.';
const OTHER = 'No new safety signals emerged during the verification testing campaign.';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

beforeAll(async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await db.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await db.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await db.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await db.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await db.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
  pglite = db;
}, 120_000);

afterAll(async () => { await pglite?.close(); });

const ref = (documentId: string) => ({ documentTable: TABLE, documentId });

async function liveRows(documentId: string) {
  const r = await exec.query<{ provenance_kind: string; asserted_by: string | null; char_start: number; char_end: number }>(
    `SELECT provenance_kind, asserted_by, char_start, char_end
       FROM document_span_lineage
      WHERE organization_id = $1 AND document_id = $2 AND deleted_at IS NULL
      ORDER BY char_start, id`,
    [ORG, documentId],
  );
  return r.rows;
}

describe('one clause, one live asserter', () => {
  it('retires the first author when a second edits the clause to the same length', async () => {
    const r = ref('doc-A');
    expect(V1.length, 'the ranges must coincide for this to mean anything').toBe(V2.length);

    await enforceAuthorLineage(exec, ORG, r, V1, ALICE);
    await enforceAuthorLineage(exec, ORG, r, V2, BOB);

    const rows = (await liveRows(r.documentId)).filter((x) => x.provenance_kind === 'author_assertion');
    expect(
      rows.length,
      'two live author_assertion rows name different people as asserting the same characters',
    ).toBe(1);
    expect(rows[0].asserted_by, 'the surviving row must be the author of the text that is there now').toBe(BOB);
  });

  it('retires the first acceptor when a second accepts the replacement', async () => {
    const r = ref('doc-B');

    await enforceAuthorLineage(exec, ORG, r, V1, ALICE, {
      acceptedMachineText: [{ authorId: 'ana', text: V1 }],
    });
    await enforceAuthorLineage(exec, ORG, r, V2, BOB, {
      acceptedMachineText: [{ authorId: 'ana', text: V2 }],
    });

    const rows = (await liveRows(r.documentId)).filter((x) => x.provenance_kind === 'accepted_machine_draft');
    expect(rows.length, 'two acceptors are both live for one clause').toBe(1);
    expect(rows[0].asserted_by).toBe(BOB);
  });

  /* The COALESCE case. machine_draft carries asserted_by IS NULL, and a
     predicate that concatenates it without COALESCE yields NULL — which is not
     `true` — so these rows would silently stop being retired. */
  it('still retires an UNACCEPTED machine draft whose clause is gone', async () => {
    const r = ref('doc-C');

    await enforceAuthorLineage(exec, ORG, r, `${V1} ${OTHER}`, ALICE, {
      machineDraft: { authorId: 'ana' },
    });
    const before = (await liveRows(r.documentId)).filter((x) => x.provenance_kind === 'machine_draft');
    expect(before.length).toBe(2);
    for (const row of before) expect(row.asserted_by).toBeNull();

    // The author deletes the machine's second clause entirely.
    await enforceAuthorLineage(exec, ORG, r, V1, ALICE, { machineDraft: { authorId: 'ana' } });

    const after = (await liveRows(r.documentId)).filter((x) => x.provenance_kind === 'machine_draft');
    expect(
      after.length,
      'a NULL asserter stopped the retirement predicate matching, so a deleted clause stayed live',
    ).toBe(1);
  });

  it('leaves a clause alone when the same author re-saves it unchanged', async () => {
    const r = ref('doc-D');
    await enforceAuthorLineage(exec, ORG, r, V1, ALICE);
    await enforceAuthorLineage(exec, ORG, r, V1, ALICE);
    const rows = (await liveRows(r.documentId)).filter((x) => x.provenance_kind === 'author_assertion');
    expect(rows.length).toBe(1);
    expect(rows[0].asserted_by).toBe(ALICE);
  });
});
