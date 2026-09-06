/**
 * A vault download refuses bytes it cannot prove are the bytes it recorded.
 *
 * The download route's own docblock states the contract: "The row's
 * content_hash is verified against the bytes on disk before they are sent — a
 * governed document store that serves a file it cannot prove is the file it
 * recorded is not a governed store, and a silent mismatch is how a superseded
 * or tampered copy leaves the building."
 *
 * That check had no test. It also lived as thirty lines inside a 115-line
 * handler, so there was nothing to test it THROUGH; it is now
 * readVerifiedVaultBytes, and this asserts the four outcomes it can produce.
 *
 * The load-bearing case is the tamper: a file whose bytes changed but whose
 * LENGTH did not, so nothing except the hash can catch it.
 *
 * Every refusal is 409, never 404, and that is deliberate — the vault RECORD
 * exists in all three failure cases, so "not found" would be a false statement
 * about the record rather than an honest one about the file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readVerifiedVaultBytes } from '../project-vault';

const BYTES = Buffer.from('the vault copy, as filed\n');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const dir = path.resolve(process.cwd(), 'uploads', `c2c-vault-integrity-${process.pid}`);
const key = path.join('uploads', path.basename(dir), 'doc.bin');
const abs = path.resolve(process.cwd(), key);

beforeAll(async () => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(abs, BYTES);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

describe('readVerifiedVaultBytes', () => {
  it('returns the bytes when they match the recorded hash', async () => {
    const r = await readVerifiedVaultBytes(key, sha(BYTES), 'doc-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes.equals(BYTES)).toBe(true);
  });

  it('returns the bytes when no hash was ever recorded, rather than refusing', async () => {
    // A row predating content hashing is unverifiable, not corrupt. Refusing it
    // would take a working download away on no evidence.
    const r = await readVerifiedVaultBytes(key, null, 'doc-1');
    expect(r.ok).toBe(true);
  });

  it('REFUSES bytes that no longer match the recorded hash', async () => {
    // Same length, different content — file_size cannot catch this.
    const tampered = Buffer.from('the vault copy, as FILED\n');
    expect(tampered.length).toBe(BYTES.length);
    await fs.writeFile(abs, tampered);
    try {
      const r = await readVerifiedVaultBytes(key, sha(BYTES), 'doc-1');
      expect(r.ok, 'a tampered file must not be served').toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(409);
        expect(r.error).toBe('CONTENT_HASH_MISMATCH');
      }
    } finally {
      await fs.writeFile(abs, BYTES);
    }
  });

  it('reports a missing file distinctly from a corrupt one', async () => {
    const r = await readVerifiedVaultBytes(path.join('uploads', 'nope', 'gone.bin'), null, 'doc-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toBe('STORED_FILE_MISSING');
    }
  });

  it('refuses a storage key that escapes the uploads root', async () => {
    const r = await readVerifiedVaultBytes('../../etc/passwd', null, 'doc-1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toBe('NO_STORED_FILE');
    }
  });
});
