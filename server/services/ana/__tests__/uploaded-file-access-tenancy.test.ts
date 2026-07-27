/**
 * Tenancy contract for chat attachments.
 *
 * These tests pin the rule that `loadUploadedFileMetadata` is the single place
 * an upload id becomes a tenant-visible file. Before this contract existed the
 * three chat paths disagreed: two filtered on an `organization_id` column that
 * the upload INSERT never wrote (so every attachment silently vanished), and
 * chat-context-builder applied no tenant filter at all (so any upload id
 * returned any organization's file metadata).
 *
 * The rule enforced here is symmetric — a tenant sees only its own rows, and an
 * unscoped caller sees only ownerless rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();

vi.mock('../../../db.js', () => ({
  getPool: () => ({ query }),
  pool: { query },
}));

/** Shape of a `file_uploads` row as the batch lookup selects it. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file_1',
    original_name: 'protocol.pdf',
    mime_type: 'application/pdf',
    storage_path: 'uploads/org-7/file_1',
    organization_id: 7,
    ...overrides,
  };
}

async function lookup(rows: unknown[], orgId: number | null, ids = ['file_1']) {
  query.mockResolvedValueOnce({ rows });
  const { loadUploadedFileMetadata } = await import('../uploaded-file-access');
  return loadUploadedFileMetadata(ids, orgId);
}

describe('loadUploadedFileMetadata — tenancy', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns a file the caller\'s organization owns', async () => {
    const out = await lookup([row()], 7);
    expect(out).toEqual([
      {
        fileId: 'file_1',
        fileName: 'protocol.pdf',
        mimeType: 'application/pdf',
        storagePath: 'uploads/org-7/file_1',
      },
    ]);
  });

  it('hides another organization\'s file even when the id is known', async () => {
    // The exact cross-tenant read chat-context-builder used to allow.
    const out = await lookup([row({ organization_id: 7 })], 9);
    expect(out).toEqual([]);
  });

  it('denies a row whose org column and storage path disagree', async () => {
    // Defense in depth: neither signal alone is trusted, so a row that claims
    // org 9 but is stored under org 7's prefix is refused for both orgs.
    const mismatched = row({ organization_id: 9, storage_path: 'uploads/org-7/file_1' });
    expect(await lookup([mismatched], 9)).toEqual([]);
    expect(await lookup([mismatched], 7)).toEqual([]);
  });

  it('does not let a tenant claim an ownerless upload', async () => {
    const unscoped = row({ organization_id: null, storage_path: 'uploads/unscoped/file_1' });
    expect(await lookup([unscoped], 7)).toEqual([]);
  });

  it('lets an unscoped caller read only ownerless uploads', async () => {
    const unscoped = row({ organization_id: null, storage_path: 'uploads/unscoped/file_1' });
    expect(await lookup([unscoped], null)).toHaveLength(1);

    // …but never a tenant's file.
    expect(await lookup([row()], null)).toEqual([]);
  });

  it('treats legacy flat paths as ownerless rather than tenant-owned', async () => {
    const legacy = row({ organization_id: null, storage_path: 'uploads/file_1' });
    expect(await lookup([legacy], 7)).toEqual([]);
    expect(await lookup([legacy], null)).toHaveLength(1);
  });

  it('falls back to the path prefix on a database without the org column', async () => {
    // Pre-migration row: SELECT yields no `organization_id` key at all. The
    // path prefix must still decide, rather than failing every read closed.
    const preMigration = {
      id: 'file_1',
      original_name: 'protocol.pdf',
      mime_type: 'application/pdf',
      storage_path: 'uploads/org-7/file_1',
    };
    expect(await lookup([preMigration], 7)).toHaveLength(1);
    expect(await lookup([preMigration], 9)).toEqual([]);
  });

  it('returns only the owned subset of a mixed batch', async () => {
    const out = await lookup(
      [
        row({ id: 'mine', storage_path: 'uploads/org-7/mine', organization_id: 7 }),
        row({ id: 'theirs', storage_path: 'uploads/org-9/theirs', organization_id: 9 }),
      ],
      7,
      ['mine', 'theirs'],
    );
    expect(out.map(f => f.fileId)).toEqual(['mine']);
  });

  it('never queries for an empty or non-string id list', async () => {
    const { loadUploadedFileMetadata } = await import('../uploaded-file-access');
    expect(await loadUploadedFileMetadata([], 7)).toEqual([]);
    expect(await loadUploadedFileMetadata([null as any, '', undefined as any], 7)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
