/**
 * The §11.70 immutability trigger on electronic_signatures and the governed
 * revocation must agree, on a real PostgreSQL engine (PGlite).
 *
 * Security audit 2026-09-24, DP-03: `persistGovernedSignatureRevocation`
 * (server/services/part11/signature-persistence.ts) marks the superseded row
 * with `superseded_by`, `is_valid = false`, `verification_status = 'revoked'`
 * and `verification_date`, exactly as its header says it must, so a superseded
 * signature can never be misread as one whose signing factors failed. The
 * trigger installed by db/migrations/20260730_esign_audit_db_level_immutability.sql
 * permitted only `superseded_by` and `updated_at` to change, so every revocation
 * raised IMMUTABILITY_VIOLATION (reproduced on PostgreSQL 16:
 * docs/evidence/D6/2026-09-24-security-audit/repro/DP-03-DP-04-postgres16-transcript.txt).
 *
 * The contract pinned here: the verification column group may change ONLY in
 * the same statement that performs the write-once supersession (superseded_by
 * NULL → id), and only to an invalid state; every other mutation and every
 * DELETE stays refused; a superseded row can never be touched again.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const MIGRATION = path.join(repoRoot, 'db/migrations/20260730_esign_audit_db_level_immutability.sql');
const BASELINE = path.join(repoRoot, 'migrations/0000_sweet_joseph.sql');
const PERSISTENCE = path.join(repoRoot, 'server/services/part11/signature-persistence.ts');

/** The table as the Drizzle baseline creates it, plus the three columns later migrations add. */
function electronicSignaturesDdl(): string {
  const src = fs.readFileSync(BASELINE, 'utf8');
  const m = src.match(/CREATE TABLE "electronic_signatures" \((.*?)\n\);/s);
  if (!m) throw new Error('electronic_signatures block not found in the baseline migration');
  return (
    m[0] +
    `\nALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS organization_id integer;` +
    `\nALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();` +
    `\nALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS superseded_by integer REFERENCES electronic_signatures(id);`
  );
}

/** The statement persistGovernedSignatureRevocation runs, taken from its source so the test cannot drift from it. */
function revocationUpdateFromSource(): string {
  const src = fs.readFileSync(PERSISTENCE, 'utf8');
  const m = src.match(/`(UPDATE electronic_signatures\s+SET superseded_by = \$1,[\s\S]*?RETURNING id)`/);
  if (!m) throw new Error('the revocation UPDATE was not found in signature-persistence.ts; update this test with it');
  return m[1];
}

let pg: PGlite;
const ORG = 7;

async function seed(): Promise<{ s1: number; s2: number }> {
  const insert = `INSERT INTO electronic_signatures
      (document_id, version_id, signature_type, signature_purpose, signer_id, signer_name, signer_email,
       authentication_method, authentication_timestamp, signature_hash, organization_id)
     VALUES (1, 1, 'approval', 'x', 1, 'x', 'x', 'x', now(), $1, ${ORG}) RETURNING id`;
  const a = await pg.query<{ id: number }>(insert, ['hash-a-' + Math.random()]);
  const b = await pg.query<{ id: number }>(insert, ['hash-b-' + Math.random()]);
  return { s1: a.rows[0].id, s2: b.rows[0].id };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(electronicSignaturesDdl());
  await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
});

afterAll(async () => {
  await pg.close();
});

describe('electronic_signatures immutability trigger vs the governed revocation', () => {
  it('the revocation statement from signature-persistence.ts succeeds (supersession + the verification column group in one statement)', async () => {
    const { s1, s2 } = await seed();
    const res = await pg.query<{ id: number }>(revocationUpdateFromSource(), [s2, 'revoked', new Date(), s1, ORG]);
    expect(res.rows.map((r) => r.id)).toEqual([s1]);
    const row = await pg.query<{ superseded_by: number; is_valid: boolean; verification_status: string }>(
      'SELECT superseded_by, is_valid, verification_status FROM electronic_signatures WHERE id = $1',
      [s1],
    );
    expect(row.rows[0]).toMatchObject({ superseded_by: s2, is_valid: false, verification_status: 'revoked' });
  });

  it('a superseded row can never be modified again', async () => {
    const { s1, s2 } = await seed();
    await pg.query(revocationUpdateFromSource(), [s2, 'revoked', new Date(), s1, ORG]);
    await expect(pg.query('UPDATE electronic_signatures SET updated_at = now() WHERE id = $1', [s1])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
  });

  it('the verification column group cannot change outside a supersession', async () => {
    const { s1 } = await seed();
    await expect(
      pg.query("UPDATE electronic_signatures SET is_valid = false, verification_status = 'revoked' WHERE id = $1", [s1]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('a supersession cannot restore validity or give the superseded signature a status other than revoked', async () => {
    const { s1, s2 } = await seed();
    // An invalid signature (e.g. one whose factors failed at signing) stays invalid through supersession.
    const invalid = await pg.query<{ id: number }>(
      `INSERT INTO electronic_signatures
         (document_id, version_id, signature_type, signature_purpose, signer_id, signer_name, signer_email,
          authentication_method, authentication_timestamp, signature_hash, organization_id, is_valid)
       VALUES (1, 1, 'approval', 'x', 1, 'x', 'x', 'x', now(), $1, ${ORG}, false) RETURNING id`,
      ['hash-invalid-' + Math.random()],
    );
    await expect(
      pg.query('UPDATE electronic_signatures SET superseded_by = $1, is_valid = true WHERE id = $2', [s2, invalid.rows[0].id]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(
      pg.query("UPDATE electronic_signatures SET superseded_by = $1, is_valid = false, verification_status = 'verified' WHERE id = $2", [s2, s1]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('the attested columns never change, even in the supersession statement', async () => {
    const { s1, s2 } = await seed();
    await expect(
      pg.query("UPDATE electronic_signatures SET superseded_by = $1, is_valid = false, verification_status = 'revoked', signature_hash = 'forged' WHERE id = $2", [s2, s1]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('a plain supersession (pointer only) still passes, and DELETE is refused', async () => {
    const { s1, s2 } = await seed();
    const res = await pg.query<{ id: number }>('UPDATE electronic_signatures SET superseded_by = $1, updated_at = now() WHERE id = $2 RETURNING id', [s2, s1]);
    expect(res.rows).toHaveLength(1);
    await expect(pg.query('DELETE FROM electronic_signatures WHERE id = $1', [s2])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });
});
