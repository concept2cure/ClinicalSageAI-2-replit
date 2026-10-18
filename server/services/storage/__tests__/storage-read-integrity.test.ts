/**
 * D2: a successful storage read must be the bytes whose identity was recorded.
 * Same-size corruption defeats a size-only check; metadata defects must not
 * become an apparently verified read or an ordinary missing-object result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeSha256, type IStorageProvider, type StoragePutResult } from '../storage-provider';

const s3 = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
vi.mock('../s3-client', () => ({
  createS3Client: () => ({
    send: async (command: { input: { Key: string; Body: Buffer } }) => {
      s3.objects.set(command.input.Key, Buffer.from(command.input.Body));
      return {};
    },
  }),
  readS3Object: async (_client: unknown, _bucket: string, key: string) => {
    const bytes = s3.objects.get(key);
    if (!bytes) throw Object.assign(new Error('Missing object'), { name: 'NoSuchKey' });
    return Buffer.from(bytes);
  },
  listS3Keys: async (_client: unknown, _bucket: string, prefix: string) =>
    [...s3.objects.keys()].filter(key => key.startsWith(prefix)),
}));

import { LocalStorageProvider } from '../local-provider';
import { S3StorageProvider } from '../s3-provider';

const ORG = 901031;
const PROJECT = 'storage-integrity-test';
const FILE = 'record.txt';
const ROOT = path.resolve(process.cwd(), 'storage', 'vault', String(ORG));

interface StoredFixture {
  result: StoragePutResult;
  replaceBytes: (bytes: Buffer) => void;
  replaceMetadata: (meta: Record<string, unknown>) => void;
  corruptMetadataJson: () => void;
  metadata: Record<string, unknown>;
}

async function stored(provider: IStorageProvider, body = Buffer.from('ORIGINAL')): Promise<StoredFixture> {
  const result = await provider.put({ orgId: ORG, projectId: PROJECT, filename: FILE, bytes: body, mime: 'text/plain' });
  const localDir = path.join(ROOT, PROJECT, 'versions', result.vaultVersionId);
  const s3Dir = `${ORG}/${PROJECT}/versions/${result.vaultVersionId}`;
  const index = `${ORG}/_index/versions/${result.vaultVersionId}.json`;
  const readMeta = () => provider.name === 'local'
    ? fs.readFileSync(path.join(localDir, '_meta.json'), 'utf8')
    : s3.objects.get(index)!.toString('utf8');
  const replaceRawMetadata = (raw: string) => {
    if (provider.name === 'local') fs.writeFileSync(path.join(localDir, '_meta.json'), raw);
    else {
      s3.objects.set(index, Buffer.from(raw));
      s3.objects.set(`${s3Dir}/_meta.json`, Buffer.from(raw));
    }
  };
  return {
    result,
    metadata: JSON.parse(readMeta()),
    replaceBytes: bytes => {
      if (provider.name === 'local') fs.writeFileSync(path.join(localDir, FILE), bytes);
      else s3.objects.set(`${s3Dir}/${FILE}`, bytes);
    },
    replaceMetadata: meta => replaceRawMetadata(JSON.stringify(meta)),
    corruptMetadataJson: () => replaceRawMetadata('{ not json'),
  };
}

for (const backend of ['local', 's3'] as const) {
  describe(`${backend} storage read integrity`, () => {
    let provider: IStorageProvider;
    beforeEach(() => {
      s3.objects.clear();
      vi.stubEnv('AWS_S3_BUCKET', 'storage-read-integrity-test');
      provider = backend === 'local' ? new LocalStorageProvider() : new S3StorageProvider();
    });
    afterEach(() => {
      fs.rmSync(ROOT, { recursive: true, force: true });
      s3.objects.clear();
      vi.unstubAllEnvs();
    });

    it.each([Buffer.from('ORIGINAL'), Buffer.alloc(0)])('reads unchanged bytes, including an empty file', async bytes => {
      const f = await stored(provider, bytes);
      await expect(provider.get(f.result.vaultVersionId, ORG)).resolves.toMatchObject({
        bytes, sizeBytes: bytes.length, sha256: computeSha256(bytes), filename: FILE, mime: 'text/plain',
      });
    });

    it('refuses changed bytes even when their size is unchanged', async () => {
      const f = await stored(provider);
      f.replaceBytes(Buffer.from('CORRUPT!'));
      await expect(provider.get(f.result.vaultVersionId, ORG)).rejects.toMatchObject({
        name: 'StorageIntegrityError', code: 'STORAGE_INTEGRITY_FAILED', reason: 'digest_mismatch',
      });
    });

    it('refuses bytes whose size no longer matches the record', async () => {
      const f = await stored(provider);
      f.replaceBytes(Buffer.from('ORIGINAL with trailing corruption'));
      await expect(provider.get(f.result.vaultVersionId, ORG)).rejects.toMatchObject({
        name: 'StorageIntegrityError', code: 'STORAGE_INTEGRITY_FAILED', reason: 'size_mismatch',
      });
    });

    it('refuses a changed recorded size even when the content digest matches', async () => {
      const f = await stored(provider);
      f.replaceMetadata({ ...f.metadata, sizeBytes: 9 });
      await expect(provider.get(f.result.vaultVersionId, ORG)).rejects.toMatchObject({
        name: 'StorageIntegrityError', code: 'STORAGE_INTEGRITY_FAILED', reason: 'size_mismatch',
      });
    });

    it('refuses a different recorded digest even when the size matches', async () => {
      const f = await stored(provider);
      f.replaceMetadata({ ...f.metadata, sha256: '0'.repeat(64) });
      await expect(provider.get(f.result.vaultVersionId, ORG)).rejects.toMatchObject({
        name: 'StorageIntegrityError', code: 'STORAGE_INTEGRITY_FAILED', reason: 'digest_mismatch',
      });
    });

    it.each([
      ['missing digest', 'sha256', undefined],
      ['malformed digest', 'sha256', 'sha256:wrong'],
      ['missing size', 'sizeBytes', undefined],
      ['string size', 'sizeBytes', '8'],
      ['negative size', 'sizeBytes', -1],
      ['fractional size', 'sizeBytes', 8.5],
      ['unsafe integer size', 'sizeBytes', Number.MAX_SAFE_INTEGER + 1],
    ])('refuses %s rather than claiming integrity', async (_label, key, value) => {
      const f = await stored(provider);
      f.replaceMetadata({ ...f.metadata, [key as string]: value });
      await expect(provider.get(f.result.vaultVersionId, ORG)).rejects.toMatchObject({
        name: 'StorageIntegrityError', code: 'STORAGE_INTEGRITY_FAILED', reason: 'invalid_metadata',
      });
    });

    it('preserves the existing malformed-JSON outcome without returning bytes', async () => {
      const f = await stored(provider);
      f.corruptMetadataJson();
      if (backend === 'local') await expect(provider.get(f.result.vaultVersionId, ORG)).resolves.toBeNull();
      else await expect(provider.get(f.result.vaultVersionId, ORG)).rejects.toBeInstanceOf(SyntaxError);
    });

    it('keeps foreign version IDs indistinguishable from genuinely absent ones', async () => {
      const f = await stored(provider);
      expect(await provider.get(f.result.vaultVersionId, ORG + 1)).toBeNull();
      expect(await provider.get('00000000-0000-4000-8000-000000000000', ORG)).toBeNull();
    });
  });
}
