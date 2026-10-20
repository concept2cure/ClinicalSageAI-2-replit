/**
 * The document digest is comparable with the one the signatures store.
 *
 * THE DEFECT THIS PREVENTS. `computeDocHash`
 * (services/authoring/authoring-export.ts) read the section rows with
 * `ORDER BY order_index` and no tiebreaker, while everything it is compared
 * against was computed over `order_index, created_at, id`. It has exactly two
 * consumers, and each one compares it with, or claims it equals, the digest the
 * signing ceremony stores:
 *
 *  - `GET /api/authoring/docs/:docId/exports` answers
 *    `content_changed_since_last_export` by comparing it against the
 *    `doc_sha256` on the last export row — and both writers of that column
 *    (authoring-file-to-vault.ts, and the router's controlled export) compute
 *    it as `sectionsDigest` over a read in signing's total order. Two orders,
 *    one comparison: for a document with a tie the verdict is simply wrong, and
 *    the route's own comment names the harm — "a UI that renders the second for
 *    the first tells an author their stale file is current".
 *  - the document-delete audit row records it as, in its own words, "the same
 *    section digest the signatures store as content_hash". It was not.
 *
 * (The signing routes themselves do NOT call this function: /freeze, /e-sign
 * and /sign each compute `sectionsDigest` over `lockedSigningContent`'s rows,
 * which are already read on the transaction client in signing's total order. An
 * earlier reading of this lane had it the other way round; see
 * docs/evidence/ANA-REASONING/2026-10-05/r16/d29a-doc-hash-total-order/corrections.txt.)
 *
 * `order_index` is `INTEGER DEFAULT 0` with NO unique constraint
 * (db/migrations/20260725_authoring_document_loop_tables.sql:65), and
 * `placeNewSection` honours a client-supplied index exactly as given
 * (services/authoring/section-placement.ts) — so two sections of one document
 * sharing an order_index is reachable from the product, not a corruption. Over
 * such a tie group `ORDER BY order_index` is not a total order: PostgreSQL may
 * return the tied rows in any sequence, and it does change the sequence when a
 * row is rewritten. Two digests for one unchanged document means the stored
 * `content_hash` cannot be re-derived to show the record is unaltered — the
 * §11.10(a) "ability to discern invalid or altered records" is answered wrong
 * in both directions: a verification can report "altered" over text nobody
 * touched, and the only mechanism that would prove the opposite is the one that
 * drifted.
 *
 * IT IS THE ONE OUTLIER, AGAINST THE REPO'S OWN STATED CONTRACT.
 * `sectionsDigest` says it in its own docstring — "Rows are already in the
 * caller's recorded order … exports and release checks must recompute the
 * identical bytes" — and `fullVisibleAuthoringSnapshot` names that order:
 * "Rows use signing's total order" (services/authoring/authoring-content-digests.ts).
 * Signing's total order is `order_index, created_at, id`, which is what the
 * signing routes' own read uses (`lockedSigningContent`, authoring.router.ts),
 * what the vault filing uses (authoring-file-to-vault.ts), what the filing
 * projection uses (services/c2c/filing-section-target.ts), what the QMS
 * controlled-document read uses, and what the placement suite calls "the order
 * every reader of the document uses" (create-section-placement.pglite.test.ts).
 * `computeDocHash` was the only reader that omitted it.
 *
 * These cases run the real function against real PostgreSQL (PGlite), because
 * the defect IS the database's freedom over a tie — a stubbed executor would
 * return rows in whatever order the stub chose and could never show it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

import { computeDocHash } from '../authoring-export';
import { sectionsDigest } from '../authoring-content-digests';

const TENANT = 11;
const DOC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let pg: PGlite;

/** A pg-shaped executor over PGlite (node-postgres reports rowCount). */
function executor() {
  const query = async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  return { query } as unknown as Parameters<typeof computeDocHash>[0];
}

/**
 * The digest over signing's total order — what the signature's own read
 * produces, and therefore what `content_hash` has to equal.
 */
async function digestInSigningOrder(): Promise<string> {
  const r = await pg.query<{ code: string; content: string | null }>(
    `SELECT code, content FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY order_index, created_at, id`,
    [DOC, TENANT],
  );
  return sectionsDigest(r.rows);
}

/**
 * Seed one tie group: every section at the same `order_index`, with
 * `created_at` DESCENDING in insertion order — so signing's total order is the
 * reverse of the order the rows were written in, and a reader that drops the
 * tiebreaker cannot land on it by accident.
 */
async function seedTieGroup(codes: string[], orderIndex = 0) {
  for (const [i, code] of codes.entries()) {
    await pg.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW() - make_interval(mins => $7))`,
      [DOC, code, `Section ${code}`, `Text of ${code}.`, orderIndex, TENANT, i],
    );
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE authoring_sections (
      id UUID PRIMARY KEY, doc_id UUID NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT DEFAULT '', order_index INTEGER DEFAULT 0, track_changes BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), tenant_id INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX authoring_sections_doc_code_tenant_uq ON authoring_sections (doc_id, code, tenant_id);
  `);
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM authoring_sections;'); });

describe('computeDocHash is the digest of signing’s total order', () => {
  it('agrees with the signing read over a tie group whose created_at order is the reverse of insertion', async () => {
    await seedTieGroup(['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6', '2.5.7']);
    expect(await computeDocHash(executor(), DOC, TENANT)).toBe(await digestInSigningOrder());
  });

  it('agrees with the signing read when created_at ties as well — the genesis shape', async () => {
    // The document shape the product produces MOST often, and the one where
    // `created_at` settles nothing: the genesis seed loop inserts every section
    // of a new document inside ONE transaction (services/authoring/
    // authoring-section-seed.ts, called from authoring-documents.ts), so
    // `NOW()` is identical across them. If apply-template's `order_idx || 0`
    // fallback or a client-supplied index also ties the order_index, `id` is
    // the only column left that can settle the sequence — so the tiebreaker
    // has to carry it, and a pair of columns is not enough.
    //
    // The ids are written explicitly, ascending in the REVERSE of insertion
    // order, so a reader that stops before `id` cannot land on the signed
    // sequence by following the rows as they were written.
    const codes = ['2.5.1', '2.5.2', '2.5.3', '2.5.4'];
    const stamp = '2026-03-04T05:06:07Z';
    for (const [i, code] of codes.entries()) {
      const n = codes.length - i; // 4, 3, 2, 1 → id order reverses insertion
      await pg.query(
        `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7::timestamptz)`,
        [`cccccccc-cccc-4ccc-8ccc-cccccccccc0${n}`, DOC, code, code, `Text of ${code}.`, TENANT, stamp],
      );
    }
    expect(await computeDocHash(executor(), DOC, TENANT)).toBe(await digestInSigningOrder());
  });

  it('is led by order_index, not by when the section was written', async () => {
    // The ordinary case, and the one that says which column leads: a section
    // added to the middle of a document later (`createSection` →
    // `placeNewSection`) has a LATER created_at and an EARLIER order_index. The
    // document reads, and signs, in outline order — so the digest must follow
    // order_index first and use the rest only to settle a tie.
    await pg.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, '2.5.3', '2.5.3', 'Text of 2.5.3.', 300, $2, NOW() - interval '2 hours')`,
      [DOC, TENANT],
    );
    await pg.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, created_at)
       VALUES (gen_random_uuid(), $1, '2.5.1', '2.5.1', 'Text of 2.5.1.', 100, $2, NOW())`,
      [DOC, TENANT],
    );
    expect(await computeDocHash(executor(), DOC, TENANT)).toBe(await digestInSigningOrder());
  });

  it('agrees with the signing read when the document has no ties at all', async () => {
    // The control: the fix must not move the hash of any document whose
    // order_index values are already distinct, which is every document the
    // template seeder and the placement path produce.
    for (const [i, code] of ['2.5.1', '2.5.2', '2.5.3'].entries()) {
      await pg.query(
        `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [DOC, code, code, `Text of ${code}.`, (i + 1) * 100, TENANT],
      );
    }
    expect(await computeDocHash(executor(), DOC, TENANT)).toBe(await digestInSigningOrder());
  });
});

/**
 * These two PASS before the fix as well as after — PGlite's sort happened to
 * keep the tied rows in place across a tuple rewrite on this build. They are
 * recorded as pins, not as the red: the ordering PostgreSQL is free to change
 * is exactly what no test can force, which is why the case above asserts the
 * invariant (the stored digest IS the signed read's digest) rather than hunting
 * a reordering. What these two add is the consequence stated in the product's
 * own terms, so a later reader can see what the invariant is protecting.
 */
describe('the hash does not move while the signed text stands still', () => {
  it('survives a rewrite of a tied row that changes nothing the digest covers', async () => {
    // Touching `updated_at` writes a new tuple version, which moves the row in
    // the heap and so in an untiebroken scan. Nothing `sectionsDigest` reads
    // (code, content) changed, so the signature's hash must not change either.
    await seedTieGroup(['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5']);
    const before = await computeDocHash(executor(), DOC, TENANT);
    await pg.query(
      `UPDATE authoring_sections SET updated_at = NOW() WHERE doc_id = $1 AND code = $2`,
      [DOC, '3.2.S.1'],
    );
    expect(await computeDocHash(executor(), DOC, TENANT)).toBe(before);
  });

  it('is unchanged by a rewrite of every tied row in turn', async () => {
    const codes = ['A.1', 'A.2', 'A.3', 'A.4'];
    await seedTieGroup(codes);
    const before = await computeDocHash(executor(), DOC, TENANT);
    for (const code of codes) {
      await pg.query(
        `UPDATE authoring_sections SET updated_at = NOW() WHERE doc_id = $1 AND code = $2`,
        [DOC, code],
      );
      expect(await computeDocHash(executor(), DOC, TENANT)).toBe(before);
    }
  });
});
