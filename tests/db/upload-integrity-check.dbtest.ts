/**
 * A stored upload's bytes are checked against the digest recorded when it
 * arrived — and a mismatch is refused, not annotated (GA ledger L25).
 *
 * ── What was missing ───────────────────────────────────────────────────────
 * The ledger records this as "the byte reader never loads the checksum". It was
 * one level worse: `file_uploads` had no digest column at all, so nothing about
 * an uploaded document was verifiable after the fact. Bytes altered on disk, a
 * truncated write, or a restore from a bad backup would all be handed to a
 * regulatory user as the original, and keeping `file_size` consistent was the
 * only thing needed to hide it.
 *
 * ── Why the tamper case is the test ────────────────────────────────────────
 * Asserting that an untouched file reads back fine proves nothing: it passed
 * before the change too. The load-bearing assertion is that CHANGED bytes are
 * refused, and that the refusal is a throw rather than a flag on a returned
 * Buffer — a caller holding bytes will use them.
 *
 * Three states, deliberately distinct: verified, unverifiable (a row written
 * before checksums existed, left NULL on purpose because hashing today's bytes
 * would record corruption as authentic), and mismatch (refused).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { loadUploadedFile, sha256Hex } from '../../server/services/ana/uploaded-file-access';
import { runWithTenantScope } from '../../server/db/tenantStore';

const ORG = 90911;
const TAG = `c2c-integrity-${process.pid}-${Date.now().toString(36)}`;
const BYTES = Buffer.from('the original document bytes, as received\n');

let owner: Pool;
const written: string[] = [];

/**
 * Call the loader the way a request does — inside a tenant scope. The
 * instrumented pool fails closed on an unscoped query under RLS_ENFORCE=on, so
 * calling it bare would test that guard rather than the integrity check.
 */
function asTenant<T>(orgId: number, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid: null, role: null, source: 'test', caller: 'upload-integrity' },
    fn,
  );
}

/** Write real bytes under uploads/ and a matching row; returns the file id. */
async function seed(id: string, checksum: string | null, bytes: Buffer): Promise<string> {
  const storagePath = path.join('uploads', `org-${ORG}`, id);
  const resolved = path.resolve(process.cwd(), storagePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, bytes);
  written.push(resolved);
  await owner.query(
    `INSERT INTO file_uploads
       (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
     VALUES ($1, NULL, $2, $3, 'text/plain', $4, $5, $6, 'uploaded', NOW())`,
    [id, ORG, `${TAG}.txt`, bytes.length, storagePath, checksum],
  );
  return id;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  // The column this whole behaviour depends on must actually be deployed.
  const { rows } = await owner.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='file_uploads' AND column_name='checksum_sha256'`,
  );
  expect(rows.length, 'file_uploads.checksum_sha256 must exist').toBe(1);
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM file_uploads WHERE original_name = $1', [`${TAG}.txt`]).catch(() => {});
    await owner.end();
  }
  for (const f of written) await fs.rm(f, { force: true }).catch(() => {});
});

describe('uploaded-file integrity', () => {
  it('serves a file whose bytes still match, and says so', async () => {
    const id = await seed(`${TAG}-ok`, sha256Hex(BYTES), BYTES);
    const file = await asTenant(ORG, () => loadUploadedFile(id, ORG));
    expect(file.buffer.equals(BYTES)).toBe(true);
    expect(file.integrity).toBe('verified');
  });

  it('REFUSES a file whose bytes changed on disk', async () => {
    const id = await seed(`${TAG}-tampered`, sha256Hex(BYTES), BYTES);

    // Same length, different content — so file_size alone cannot catch it.
    const tampered = Buffer.from('the ORIGINAL document bytes, as received\n');
    expect(tampered.length).toBe(BYTES.length);
    await fs.writeFile(path.resolve(process.cwd(), 'uploads', `org-${ORG}`, id), tampered);

    await expect(asTenant(ORG, () => loadUploadedFile(id, ORG))).rejects.toThrow(/integrity check/i);
  });

  it('reports a pre-checksum row as unverifiable rather than verified', async () => {
    const id = await seed(`${TAG}-legacy`, null, BYTES);
    const file = await asTenant(ORG, () => loadUploadedFile(id, ORG));
    expect(file.integrity).toBe('unverifiable');
    expect(file.buffer.equals(BYTES)).toBe(true);
  });

  it('still refuses another tenant, integrity aside', async () => {
    const id = await seed(`${TAG}-tenant`, sha256Hex(BYTES), BYTES);
    await expect(asTenant(ORG + 1, () => loadUploadedFile(id, ORG + 1))).rejects.toThrow(/not found/i);
  });
});
