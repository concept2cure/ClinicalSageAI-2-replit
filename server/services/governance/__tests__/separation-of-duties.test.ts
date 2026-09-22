import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query } }));

import {
  assertSignerIsNotAuthor,
  resolveTargetOwnerId,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
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

  // Was: "returns null (degrades) on a missing table/column". That carve-out is
  // what let the c2c_blockers org_id/organization_id typo (42703, above)
  // silently switch the check off. A failed lookup is not an answer.
  it('throws, rather than returning null, when the owner lookup fails', async () => {
    query.mockRejectedValue({ code: '42P01' });
    await expect(resolveTargetOwnerId('document:doc-1', 2)).rejects.toMatchObject({ code: '42P01' });
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

  it('degrades to allow when the row records no owner (never blocks the whole surface)', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 9)).resolves.toBeUndefined();
  });

  it('degrades to allow for an un-modelled target type, without querying', async () => {
    await expect(assertSignerIsNotAuthor('submission:sub-1', 2, 9)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  /* The defect: every lookup error returned null, null read as "allow", and an
     author could sign their own record during any database blip. Each of these
     must refuse, with the error that says the check did not run. */
  it.each([
    ['a statement timeout', { code: '57014', message: 'canceling statement due to statement timeout' }],
    ['a dropped connection', new Error('Connection terminated unexpectedly')],
    ['an RLS / permission refusal', { code: '42501', message: 'permission denied for table c2c_documents' }],
    ['an undefined column (the c2c_blockers org_id typo)', { code: '42703', message: 'column "organization_id" does not exist' }],
    ['an undefined table', { code: '42P01', message: 'relation "ectd_sequences" does not exist' }],
  ])('refuses to sign when the owner lookup fails with %s', async (_label, failure) => {
    query.mockRejectedValue(failure);
    const attempt = assertSignerIsNotAuthor('ectd-sequence:42', 7, 11);
    await expect(attempt).rejects.toBeInstanceOf(SeparationOfDutiesUnverifiedError);
    // Not the "you are the author" refusal: the check did not run, and the
    // route answers these two differently (503 vs 403).
    await expect(assertSignerIsNotAuthor('ectd-sequence:42', 7, 11)).rejects.not.toBeInstanceOf(
      SeparationOfDutiesError,
    );
  });

  it('names the target and says nothing was signed', async () => {
    query.mockRejectedValue({ code: '57014', message: 'timeout' });
    await expect(assertSignerIsNotAuthor('document:doc-1', 2, 9)).rejects.toThrow(
      /could not be verified for "document:doc-1" \(database error 57014\)\. Nothing was signed/,
    );
  });
});
