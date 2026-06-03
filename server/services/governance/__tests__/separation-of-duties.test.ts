import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query } }));

import {
  assertSignerIsNotAuthor,
  resolveTargetOwnerId,
  SeparationOfDutiesError,
} from '../separation-of-duties';

beforeEach(() => vi.clearAllMocks());

describe('resolveTargetOwnerId', () => {
  it('resolves a document owner', async () => {
    query.mockResolvedValue({ rows: [{ owner_id: 42 }] });
    expect(await resolveTargetOwnerId('document:doc-1', 2)).toBe(42);
    expect(query.mock.calls[0][0]).toContain('FROM c2c_documents');
  });

  it('resolves a section owner via the owning document', async () => {
    query.mockResolvedValue({ rows: [{ owner_id: 7 }] });
    expect(await resolveTargetOwnerId('section:doc-1:3.2.S', 2)).toBe(7);
    expect(query.mock.calls[0][0]).toContain('c2c_document_sections');
  });

  it('returns null for an unmodelled target type (degrades, no query)', async () => {
    expect(await resolveTargetOwnerId('submission:sub-1', 2)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns null (degrades) on a missing table/column', async () => {
    query.mockRejectedValue({ code: '42P01' });
    expect(await resolveTargetOwnerId('document:doc-1', 2)).toBeNull();
  });

  it('returns null when the row has no owner', async () => {
    query.mockResolvedValue({ rows: [{ owner_id: null }] });
    expect(await resolveTargetOwnerId('document:doc-1', 2)).toBeNull();
  });
});

describe('assertSignerIsNotAuthor', () => {
  it('throws when the signer owns/authored the target (SoD breach)', async () => {
    query.mockResolvedValue({ rows: [{ owner_id: 9 }] });
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 9)).rejects.toBeInstanceOf(
      SeparationOfDutiesError,
    );
  });

  it('allows when the signer differs from the author', async () => {
    query.mockResolvedValue({ rows: [{ owner_id: 9 }] });
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 10)).resolves.toBeUndefined();
  });

  it('degrades to allow when the author is unresolved (never blocks the whole surface)', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 9)).resolves.toBeUndefined();
  });
});
