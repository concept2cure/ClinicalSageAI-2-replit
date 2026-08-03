/**
 * @fileoverview Behavioural proof that document_span_lineage enforces its own rules.
 *
 * The sibling contract test asserts what the migration SAYS. This one applies it
 * to a real PostgreSQL (PGlite, in-process — no external database) and asserts
 * what it DOES, because a CHECK constraint that is written but not exercised is
 * indistinguishable from one that is subtly wrong.
 *
 * The rule this table serves is that every span of a generated document traces
 * to a source and records how that source was used. That rule is only worth
 * anything if the database refuses rows that fail it. The cases below are the
 * refusals, stated as tests:
 *
 *   • a citation of a Data Room source with no reference or checksum
 *   • an author assertion with no author or time
 *   • a span covering no characters
 *   • a usage verb outside the vocabulary
 *
 * Each of those, if accepted, would put a row in the lineage table that records
 * the existence of a claim while saying nothing about where it came from —
 * which reads as traceability in every report that counts rows, and is not.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = join(__dirname, '..', '..', 'db/migrations/20260803_document_span_lineage.sql');

const BASE_COLS =
  'document_table, document_id, char_start, char_end, span_text_sha256, usage, organization_id';

let db: PGlite;

/** Insert helper — returns a promise that rejects when the database refuses. */
function insert(cols: string, vals: string) {
  return db.query(`INSERT INTO document_span_lineage (${BASE_COLS}, ${cols}) VALUES (${vals})`);
}

beforeAll(async () => {
  db = new PGlite();
  // The only dependency the table has.
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await db.exec(`INSERT INTO organizations (name) VALUES ('acme');`);
  await db.exec(readFileSync(MIGRATION, 'utf8'));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('document_span_lineage — the migration applies', () => {
  it('applies twice without error', async () => {
    // The C2C applier is re-run against existing databases; a migration that
    // only works on an empty one breaks every subsequent deploy.
    await expect(db.exec(readFileSync(MIGRATION, 'utf8'))).resolves.toBeDefined();
  });
});

describe('document_span_lineage — rows that must be accepted', () => {
  it('accepts a span cited to a Data Room source', async () => {
    await expect(
      insert(
        'provenance_kind, source, reference_id, payload_sha256',
        `'coauthor_documents','doc-accept',0,10,'hash-a','quoted',1,` +
          `'cre_evidence_source','cre_evidence_source','42','sha-of-source'`
      )
    ).resolves.toBeDefined();
  });

  it("accepts a span attributed to its author's own analysis", async () => {
    // Original expert prose has no upstream document. Forcing one would be a
    // fabricated citation, so the author is the source of record instead.
    await expect(
      insert(
        'provenance_kind, asserted_by, asserted_at',
        `'coauthor_documents','doc-accept',10,20,'hash-b','asserted',1,` +
          `'author_assertion','user-7',NOW()`
      )
    ).resolves.toBeDefined();
  });
});

describe('document_span_lineage — rows that must be refused', () => {
  it('refuses a source citation carrying no reference or checksum', async () => {
    // Would record "this came from the Data Room" without saying from what.
    await expect(
      insert(
        'provenance_kind',
        `'coauthor_documents','doc-refuse',20,30,'hash-c','quoted',1,'cre_evidence_source'`
      )
    ).rejects.toThrow();
  });

  it('refuses an author assertion carrying no author or time', async () => {
    await expect(
      insert(
        'provenance_kind',
        `'coauthor_documents','doc-refuse',30,40,'hash-d','asserted',1,'author_assertion'`
      )
    ).rejects.toThrow();
  });

  it('refuses a span that covers no characters', async () => {
    await expect(
      insert(
        'provenance_kind, asserted_by, asserted_at',
        `'coauthor_documents','doc-refuse',50,50,'hash-e','asserted',1,` +
          `'author_assertion','user-7',NOW()`
      )
    ).rejects.toThrow();
  });

  it('refuses a usage verb outside the vocabulary', async () => {
    // "How was this source used" is a closed set; free text would make the
    // column unqueryable and the distinction between quoting and deriving
    // unenforceable.
    await expect(
      insert(
        'provenance_kind, asserted_by, asserted_at',
        `'coauthor_documents','doc-refuse',60,70,'hash-f','vibes',1,` +
          `'author_assertion','user-7',NOW()`
      )
    ).rejects.toThrow();
  });

  it('refuses a negative offset', async () => {
    await expect(
      insert(
        'provenance_kind, asserted_by, asserted_at',
        `'coauthor_documents','doc-refuse',-5,10,'hash-g','asserted',1,` +
          `'author_assertion','user-7',NOW()`
      )
    ).rejects.toThrow();
  });
});

describe('document_span_lineage — re-persisting reconciles', () => {
  it('does not duplicate when the same span→source link is written twice', async () => {
    // evidence_links carries ON CONFLICT DO NOTHING with no matching unique
    // constraint, so re-saving a document duplicates every link. The unique
    // index here is what makes the clause mean what it appears to mean.
    const row =
      `INSERT INTO document_span_lineage (${BASE_COLS}, provenance_kind, source, reference_id, payload_sha256) ` +
      `VALUES ('coauthor_documents','doc-dup',0,10,'hash-x','quoted',1,` +
      `'cre_evidence_source','cre_evidence_source','99','sha-99') ON CONFLICT DO NOTHING`;

    await db.query(row);
    await db.query(row);

    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM document_span_lineage WHERE document_id = 'doc-dup'`
    );
    expect(rows[0].n).toBe(1);
  });

  it('still distinguishes two different sources backing the same span', async () => {
    // Reconciliation must not collapse genuinely distinct provenance: a span
    // supported by two sources is two lineage facts, not one.
    const mk = (ref: string) =>
      `INSERT INTO document_span_lineage (${BASE_COLS}, provenance_kind, source, reference_id, payload_sha256) ` +
      `VALUES ('coauthor_documents','doc-multi',0,10,'hash-y','quoted',1,` +
      `'cre_evidence_source','cre_evidence_source','${ref}','sha-${ref}') ON CONFLICT DO NOTHING`;

    await db.query(mk('101'));
    await db.query(mk('102'));

    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM document_span_lineage WHERE document_id = 'doc-multi'`
    );
    expect(rows[0].n).toBe(2);
  });
});
