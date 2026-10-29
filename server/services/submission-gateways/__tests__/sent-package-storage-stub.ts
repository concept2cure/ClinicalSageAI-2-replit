/**
 * The storage the guarded transmit keeps a sent package in
 * (sent-package-archive.ts), held in memory for suites that drive the guard to
 * the wire and are not about the archive. Unstubbed, each such run wrote the
 * package under storage/vault/ in the working tree.
 *
 *   vi.mock('../../storage', async () => (await import('./sent-package-storage-stub')).storageModule);
 */
import { createHash } from 'crypto';

export const storageModule = {
  getStorageProvider: () => ({
    name: 'test',
    put: async (o: { bytes: Buffer }) => ({
      vaultFileId: 'vault://test/sent-packages/package.zip',
      vaultVersionId: 'sent-package-test',
      sizeBytes: o.bytes.length,
      sha256: createHash('sha256').update(o.bytes).digest('hex'),
      provider: 'test',
    }),
  }),
};
