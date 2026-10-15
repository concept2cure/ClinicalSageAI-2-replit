/**
 * FD5 (c): which Authoring sign-offs carry to a Vault rendition, decided over
 * rows already read (chooseCarriedSignOffs). The end-to-end proof, through the
 * router and the lifecycle store, is
 * server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { chooseCarriedSignOffs, type AuthoringSignatureRow } from '../authoring-approval-carryover';

const D = 'd'.repeat(64);
const sig = (id: string, meaning: string, email: string, at: string, content = D): AuthoringSignatureRow => ({
  id, meaning, signer_email: email, signer_name: email, content_hash: content, signed_at: at,
});

describe('chooseCarriedSignOffs', () => {
  it('carries the latest approval over this content and a review before it by someone else', () => {
    const out = chooseCarriedSignOffs('APPROVED', D, [
      sig('r1', 'REVIEWER', 'rae@x', '2026-10-01T09:00:00Z'),
      sig('a1', 'APPROVER', 'abe@x', '2026-10-01T10:00:00Z'),
    ]);
    expect(out).toMatchObject({ carry: true, review: { id: 'r1' }, approval: { id: 'a1' } });
  });

  it("passes over the approver's own review for an independent one, even when the approver's is later", () => {
    const out = chooseCarriedSignOffs('approved', D, [
      sig('r-rae', 'REVIEWER', 'rae@x', '2026-10-01T09:00:00Z'),
      sig('r-abe', 'REVIEWER', 'ABE@x', '2026-10-01T09:30:00Z'),
      sig('a1', 'APPROVER', 'abe@x', '2026-10-01T10:00:00Z'),
    ]);
    expect(out).toMatchObject({ carry: true, review: { id: 'r-rae' } });
  });

  it('takes the latest approval of this content, not an earlier one or one of other content', () => {
    const out = chooseCarriedSignOffs('APPROVED', D, [
      sig('r1', 'REVIEWER', 'rae@x', '2026-10-01T08:00:00Z'),
      sig('a-old', 'APPROVER', 'abe@x', '2026-10-01T09:00:00Z'),
      sig('a-new', 'APPROVER', 'abe@x', '2026-10-01T10:00:00Z'),
      sig('a-other', 'APPROVER', 'abe@x', '2026-10-01T11:00:00Z', 'e'.repeat(64)),
    ]);
    expect(out).toMatchObject({ carry: true, approval: { id: 'a-new' } });
  });

  it('carries nothing when no digest was computed for the rendering', () => {
    const out = chooseCarriedSignOffs('APPROVED', '', [
      sig('r1', 'REVIEWER', 'rae@x', '2026-10-01T09:00:00Z', ''),
      sig('a1', 'APPROVER', 'abe@x', '2026-10-01T10:00:00Z', ''),
    ]);
    expect(out.carry).toBe(false);
  });

  it('carries nothing from a signature with no recorded time', () => {
    const out = chooseCarriedSignOffs('APPROVED', D, [
      sig('r1', 'REVIEWER', 'rae@x', '2026-10-01T09:00:00Z'),
      { ...sig('a1', 'APPROVER', 'abe@x', ''), signed_at: null },
    ]);
    expect(out).toEqual({ carry: false, reason: 'No Authoring approval signature covers the content that was filed.' });
  });
});
