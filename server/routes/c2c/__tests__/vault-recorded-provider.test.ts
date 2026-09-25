/**
 * A vault document is read from the store that holds it.
 *
 * Every `vault.documents` row records the provider its bytes were written
 * through (`storage_provider`, vault-ingest.service.ts). No reader consulted
 * it. Each asked whichever provider the server is configured with today, so
 * the day a deployment moves from local disk to S3, every document stored
 * before the move reads as STORED_FILE_MISSING: a record that exists, with
 * bytes that exist, reported as gone.
 *
 * Specified by the vault re-baseline (…01KnUGoX, docs/work-orders/README.md,
 * "→ W2 (D1)"): mint with the real LocalStorageProvider, configure S3 with no
 * bucket (so the S3 provider cannot even be built), and read a row recorded
 * `local`. It must serve the bytes, still refuse another organization, and
 * refuse a recorded name this server does not implement, rather than ask the
 * configured store.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LocalStorageProvider } from '../../../services/storage/local-provider';
import { resetStorageProvider } from '../../../services/storage';
import { readVerifiedVaultBytes } from '../project-vault';

const ORG = 900311;
const OTHER_ORG = 900312;
const BYTES = Buffer.from('%PDF-1.7\nrecorded-provider fixture\n');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let versionId: string;
const saved = { provider: process.env.STORAGE_PROVIDER, bucket: process.env.AWS_S3_BUCKET };

beforeAll(async () => {
  delete process.env.STORAGE_PROVIDER;
  resetStorageProvider();
  const written = await new LocalStorageProvider().put({
    orgId: ORG,
    projectId: 'prog-recorded',
    filename: 'protocol.pdf',
    bytes: BYTES,
    mime: 'application/pdf',
  });
  versionId = written.vaultVersionId;

  // The deployment has since moved to S3, and this process names no bucket.
  process.env.STORAGE_PROVIDER = 's3';
  delete process.env.AWS_S3_BUCKET;
  resetStorageProvider();
});

afterAll(async () => {
  if (saved.provider === undefined) delete process.env.STORAGE_PROVIDER;
  else process.env.STORAGE_PROVIDER = saved.provider;
  if (saved.bucket === undefined) delete process.env.AWS_S3_BUCKET;
  else process.env.AWS_S3_BUCKET = saved.bucket;
  resetStorageProvider();
  await fs.rm(path.resolve(process.cwd(), 'storage', 'vault', String(ORG)), { recursive: true, force: true });
});

const source = (organizationId: number, storageProvider: string | null) => ({
  storageVersionId: versionId,
  storageKey: null,
  organizationId,
  storageProvider,
});

describe('readVerifiedVaultBytes reads from the recorded store', () => {
  it('serves a document recorded `local` while the server is configured for S3', async () => {
    const r = await readVerifiedVaultBytes(source(ORG, 'local'), sha(BYTES), 'doc-local');
    expect(r).toEqual({ ok: true, bytes: BYTES });
  });

  it("still refuses another organization's read of it", async () => {
    const r = await readVerifiedVaultBytes(source(OTHER_ORG, 'local'), sha(BYTES), 'doc-local');
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.error).toBe('STORED_FILE_MISSING');
  });

  it('refuses a recorded store this server does not implement, without asking the configured one', async () => {
    const r = await readVerifiedVaultBytes(source(ORG, 'gcs'), sha(BYTES), 'doc-gcs');
    expect(r.ok).toBe(false);
    // Distinct from STORED_FILE_MISSING: the bytes may well exist. This server
    // cannot open the store they are in, and it says that.
    expect(r.ok ? null : r.error).toBe('STORED_FILE_UNREADABLE');
    expect(JSON.stringify(r), 'no infrastructure name in a user-facing refusal').not.toMatch(/gcs/);
  });

  it('refuses, as unreadable, a recorded store this server cannot currently open', async () => {
    const r = await readVerifiedVaultBytes(source(ORG, 's3'), sha(BYTES), 'doc-s3');
    expect(r.ok ? null : r.error).toBe('STORED_FILE_UNREADABLE');
  });
});
