/**
 * Integrity gate for assembled submission bundles. The transmit signer attests
 * to a specific sha256; readVerifiedBundle guarantees the bytes about to be
 * sent to the agency still match that descriptor, and refuses otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { readVerifiedBundle } from '../server/services/submission-gateways/bundle-integrity';
import { ValidationError } from '../server/services/submission-gateways/types';

let dir: string;
let bundlePath: string;
const bytes = Buffer.from('PK fake-but-stable eCTD zip payload', 'utf8');
const sha256 = createHash('sha256').update(bytes).digest('hex');

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c2c-bundle-'));
  bundlePath = path.join(dir, 'pkg-0000.zip');
  await fs.writeFile(bundlePath, bytes);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('readVerifiedBundle', () => {
  it('returns the buffer when sha256 and size match the descriptor', async () => {
    const buf = await readVerifiedBundle({ path: bundlePath, sha256, sizeBytes: bytes.length });
    expect(buf.equals(bytes)).toBe(true);
  });

  it('rejects a sha256 mismatch (drifted/corrupt bytes)', async () => {
    await expect(
      readVerifiedBundle({ path: bundlePath, sha256: 'a'.repeat(64), sizeBytes: bytes.length }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a size mismatch even when the file exists', async () => {
    await expect(
      readVerifiedBundle({ path: bundlePath, sha256, sizeBytes: bytes.length + 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a missing or unreadable bundle file', async () => {
    await expect(
      readVerifiedBundle({ path: path.join(dir, 'does-not-exist.zip'), sha256, sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
