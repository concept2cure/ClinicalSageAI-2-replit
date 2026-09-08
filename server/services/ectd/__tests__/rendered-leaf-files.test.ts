/**
 * storeRenderedLeafFile — bytes reach the store, the row records them, and a
 * failed row insert does not leave the bytes behind.
 *
 * The compensation matters: the row is the ONLY thing that makes a stored
 * object findable (the resolver looks it up by id). An object with no row is
 * unreachable litter that nothing would ever clean up, so a failed insert must
 * delete what it stored before propagating.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

const provider = vi.hoisted(() => ({
  puts: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<{ id: string; orgId: number }>,
}));
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    async put(opts: Record<string, unknown>) {
      provider.puts.push(opts);
      const bytes = opts.bytes as Buffer;
      return {
        vaultFileId: 'vf-1',
        vaultVersionId: 'vv-1',
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        provider: 'test',
      };
    },
    async delete(id: string, orgId: number) {
      provider.deletes.push({ id, orgId });
      return true;
    },
  }),
}));

const dbState = vi.hoisted(() => ({ failInsert: false }));
vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (dbState.failInsert) throw new Error('insert failed');
          return [{ id: 42 }];
        },
      }),
    }),
  },
}));

import { storeRenderedLeafFile, leafSourceFor } from '../rendered-leaf-files';

const PDF = Buffer.from('%PDF-1.4\n% report\n%%EOF\n', 'utf8');
const base = {
  organizationId: 3,
  userId: 9,
  bytes: PDF,
  mime: 'application/pdf',
  fileName: 'ind-annual-report.pdf',
  renderedFrom: 'ind_annual_report' as const,
  sectionCode: 'm1.13',
};

beforeEach(() => {
  provider.puts.length = 0;
  provider.deletes.length = 0;
  dbState.failInsert = false;
});

describe('storeRenderedLeafFile', () => {
  it('stores the bytes under the caller organization and returns the leaf source', async () => {
    const stored = await storeRenderedLeafFile(base);

    expect(provider.puts).toHaveLength(1);
    expect(provider.puts[0]).toMatchObject({ orgId: 3, mime: 'application/pdf' });
    expect(stored.md5).toBe(createHash('md5').update(PDF).digest('hex'));
    expect(leafSourceFor(stored)).toEqual({
      documentTable: 'rendered_leaf_files',
      documentId: 42,
      checksum: stored.md5,
    });
  });

  it('deletes the stored object when the row insert fails, so no unreachable bytes remain', async () => {
    dbState.failInsert = true;

    await expect(storeRenderedLeafFile(base)).rejects.toThrow('insert failed');
    // The bytes were stored, then removed — not left behind.
    expect(provider.puts).toHaveLength(1);
    expect(provider.deletes).toEqual([{ id: 'vv-1', orgId: 3 }]);
  });

  it('refuses a zero-length render rather than recording an empty document', async () => {
    await expect(storeRenderedLeafFile({ ...base, bytes: Buffer.alloc(0) })).rejects.toThrow(/zero-length/);
    expect(provider.puts).toHaveLength(0);
  });
});
