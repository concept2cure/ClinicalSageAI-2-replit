/**
 * The revision ledger against a REAL Postgres engine (in-process PGlite).
 *
 * The unit test proves verification catches tampering in the abstract; this
 * proves the DATABASE half: the 20260817 migration applies to a real engine,
 * the ledger columns land, and — the load-bearing fact — the append-only
 * trigger REFUSES UPDATE and DELETE on doc_revisions. The tamper is attempted
 * for real and shown refused, per the working agreement ("verify by making
 * the check fail": a gate only ever seen passing has not been tested).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeChainHash,
  sha256Hex,
  verifyLedger,
} from '../../services/authoring/revision-ledger';

const MIGRATIONS = path.join(__dirname, '../../../db/migrations');

// The canonical loop-tables file creates doc_revisions; the ledger file ALTERs
// it and installs the trigger — the same order the durable applier
// (scripts/db/authoring-subsystem.mjs) runs them in.
const FILES = [
  '20260725_authoring_document_loop_tables.sql',
  '20260817_doc_revisions_immutable_ledger.sql',
];

let db: PGlite;

const DOC = '00000000-2222-4333-8444-555555555555';

beforeAll(async () => {
  db = new PGlite();
  for (const f of FILES) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    await db.exec(sql);
  }
  // The composite tenant FKs demand real parents — same shape a live deploy has.
  await db.query(
    `INSERT INTO authoring_documents (id, title, status, created_by, tenant_id)
     VALUES ($1, 'Ledger test doc', 'draft', 'author@x.co', 7)`,
    [DOC],
  );
  await db.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, '2.7.3', 'Efficacy', 'live', 7),
            ($3, $2, '2.7.4', 'Safety', 'live', 7)`,
    [SEC, DOC, SEC2],
  );
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Insert one chained revision the way createRevision does. */
async function insertRevision(args: {
  id: string;
  sectionId: string;
  content: string;
  by: string;
  origin: string;
  prevChain: string | null;
  inputs?: unknown;
}): Promise<string> {
  const contentSha = sha256Hex(args.content);
  const chain = computeChainHash({
    prevChain: args.prevChain,
    contentSha256: contentSha,
    createdBy: args.by,
    origin: args.origin,
  });
  await db.query(
    `INSERT INTO doc_revisions
       (id, section_id, content, created_by, created_at, tenant_id,
        content_sha256, prev_chain_sha256, chain_sha256, origin, inputs)
     VALUES ($1, $2, $3, $4, NOW(), 7, $5, $6, $7, $8, $9)`,
    [
      args.id,
      args.sectionId,
      args.content,
      args.by,
      contentSha,
      args.prevChain,
      chain,
      args.origin,
      JSON.stringify(args.inputs ?? { citations: [] }),
    ],
  );
  return chain;
}

const SEC = '11111111-2222-4333-8444-555555555555';
const SEC2 = '99999999-2222-4333-8444-555555555555';
const R1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const R2 = 'aaaaaaaa-0000-4000-8000-000000000002';

describe('doc_revisions immutable ledger — real engine', () => {
  it('applies, and chained revisions land with their input manifests', async () => {
    const c1 = await insertRevision({
      id: R1,
      sectionId: SEC,
      content: 'Initial draft.',
      by: 'author@x.co',
      origin: 'genesis',
      prevChain: null,
      inputs: { citations: [{ citation_id: 'c-1', payload_sha256: 'abc123' }] },
    });
    await insertRevision({
      id: R2,
      sectionId: SEC,
      content: 'Tightened draft.',
      by: 'author@x.co',
      origin: 'human-edit',
      prevChain: c1,
    });

    const { rows } = await db.query<{
      id: string;
      content: string;
      created_by: string;
      origin: string;
      content_sha256: string;
      prev_chain_sha256: string | null;
      chain_sha256: string;
      inputs: unknown;
    }>(
      `SELECT id, content, created_by, origin, content_sha256, prev_chain_sha256, chain_sha256, inputs
         FROM doc_revisions WHERE section_id = $1 ORDER BY created_at ASC, id ASC`,
      [SEC],
    );
    expect(rows).toHaveLength(2);
    const manifest = rows[0].inputs as { citations: Array<{ payload_sha256: string }> };
    expect(manifest.citations[0].payload_sha256).toBe('abc123');

    // The rows the engine stored verify as an intact chain.
    const verdict = verifyLedger(rows);
    expect(verdict.intact).toBe(true);
    expect(verdict.chainedCount).toBe(2);
  });

  it('REFUSES the tamper: UPDATE on a revision is rejected by the engine', async () => {
    await expect(
      db.query(`UPDATE doc_revisions SET content = 'rewritten history' WHERE id = $1`, [R1]),
    ).rejects.toThrow(/append-only ledger/);
    // And the content is untouched.
    const { rows } = await db.query<{ content: string }>(
      `SELECT content FROM doc_revisions WHERE id = $1`,
      [R1],
    );
    expect(rows[0].content).toBe('Initial draft.');
  });

  it('REFUSES the erasure: DELETE on a revision is rejected by the engine', async () => {
    await expect(
      db.query(`DELETE FROM doc_revisions WHERE id = $1`, [R2]),
    ).rejects.toThrow(/append-only ledger/);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM doc_revisions WHERE section_id = $1`,
      [SEC],
    );
    expect(rows[0].n).toBe(2);
  });

  it('stays honest about pre-ledger rows: NULL chain columns are accepted history', async () => {
    // A row written before the ledger existed (no chain columns) inserts fine…
    await db.query(
      `INSERT INTO doc_revisions (id, section_id, content, created_by, created_at, tenant_id)
       VALUES ('aaaaaaaa-0000-4000-8000-00000000000e', $1, 'old state', 'author@x.co', NOW(), 7)`,
      [SEC2],
    );
    // …and is still protected from tampering like every other row.
    await expect(
      db.query(
        `DELETE FROM doc_revisions WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000e'`,
      ),
    ).rejects.toThrow(/append-only ledger/);
  });
});
