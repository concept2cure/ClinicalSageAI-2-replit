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

  it('resolves an eCTD sequence owner from ectd_sequences.created_by, org-scoped', async () => {
    // The target the Part 11 freeze/dispatch/transmit chain signs had no case,
    // so no owner resolved and the preparer could sign their own sequence.
    query.mockResolvedValue({ rows: [{ created_by: 11 }] });
    expect(await resolveTargetOwnerId('ectd-sequence:42', 7)).toBe(11);
    expect(query.mock.calls[0][0]).toContain('FROM ectd_sequences');
    expect(query.mock.calls[0][0]).toContain('organization_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['42', 7]);
  });

  it('resolves a section owner via the owning document', async () => {
    query.mockResolvedValue({ rows: [{ owner_id: 7 }] });
    expect(await resolveTargetOwnerId('section:doc-1:3.2.S', 2)).toBe(7);
    expect(query.mock.calls[0][0]).toContain('c2c_document_sections');
  });

  it('resolves a blocker owner scoped by the REAL org column (org_id, not organization_id)', async () => {
    query.mockResolvedValue({ rows: [{ owner_user_id: 13 }] });
    expect(await resolveTargetOwnerId('blocker:BLK-204-1', 2)).toBe(13);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM c2c_blockers');
    // c2c_blockers has `org_id`, NOT `organization_id` — the wrong name silently
    // 42703'd and degraded the un-disableable SoD check to allow. Guard it.
    expect(sql).toMatch(/\borg_id\b/);
    expect(sql).not.toContain('organization_id');
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
