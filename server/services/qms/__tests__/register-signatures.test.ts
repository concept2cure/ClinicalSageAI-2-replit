/**
 * The register's signature block (MR-12 Stage 5 step 4; 21 CFR 11.50): the
 * batched read judges each release exactly as the single reader training and
 * periodic review use (readCurrentQmsReleaseApproval), carries who, when and
 * as what, keeps each document's rows to itself, and reads a failure as
 * unavailable, never unsigned.
 */
import { describe, expect, it, vi } from 'vitest';
import { manifestSignatureHash } from '../../part11/signature-persistence';
import { computeQmsDocumentContentDigest, QMS_DOCUMENT_BINDING_BASIS, type QmsDocumentRow } from '../document-approval-signature';
import { readCurrentQmsReleaseApproval, readQmsReleaseApprovals, readQmsRetirementSignatures } from '../current-release-approval';

const AT = '2026-09-01T14:02:09.000Z';

function effective(id: number, title = 'Complaint handling'): QmsDocumentRow {
  return {
    id, organization_id: 9, doc_number: `SOP-${id}`, title, doc_type: 'sop', category: null, version: '1.0',
    status: 'effective', effective_date: '2026-09-01', next_review_date: '2027-09-01', author_id: 3, approver_id: 7,
    approved_at: AT, superseded_by_id: null, artifact_id: null,
    metadata: { approval: { by: 7, at: AT, meaning: 'APPROVED' } },
  };
}

/** The electronic_signatures row approveQmsDocumentSigned writes for `doc`, hashed to its manifest. */
function approvalRow(doc: QmsDocumentRow, id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const digest = computeQmsDocumentContentDigest(doc);
  const manifest = { ...extra,
    kind: 'governed-sign', command: 'approve', target: `qms-document:${doc.id}`, organizationId: 9, signerId: 7,
    signerName: 'Dana Whitfield', signerEmail: 'dana@example.com', meaning: 'APPROVED', reason: 'Reviewed and approved.',
    bindingBasis: QMS_DOCUMENT_BINDING_BASIS, boundPayloadDigest: digest, docNumber: doc.doc_number, version: doc.version,
    signedAt: AT,
  };
  return {
    id, organization_id: 9, signed_target: `qms-document:${doc.id}`, signature_type: 'qms-document-approval',
    signer_id: 7, signer_name: 'Dana Whitfield', signer_email: 'dana@example.com', signed_at: AT,
    signature_meaning: 'APPROVED', signature_purpose: 'Reviewed and approved.', signature_manifest: manifest,
    signature_hash: manifestSignatureHash(manifest), binding_basis: QMS_DOCUMENT_BINDING_BASIS,
    bound_payload_digest: digest, is_valid: true, superseded_by: null, verification_status: 'valid',
  };
}

/** A client that answers the batch with every row, and the single read with the rows for its target. */
function clientOf(rows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (/ANY\(\$2::text\[\]\)/.test(sql)) return { rows };
      return { rows: rows.filter((r) => r.signed_target === params?.[1]) };
    }),
  };
}

describe('readQmsReleaseApprovals', () => {
  it('judges each release as the single reader does, with who signed it, when and as what', async () => {
    const a = effective(5);
    const b = effective(6, 'Supplier controls');
    const client = clientOf([approvalRow(a, 41), approvalRow(b, 42)]);
    const batched = await readQmsReleaseApprovals(client, 9, [a, b]);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(batched.get(5)).toEqual(await readCurrentQmsReleaseApproval(client, a));
    expect(batched.get(5)).toMatchObject({ state: 'valid', signatureId: 41, signer: { signerName: 'Dana Whitfield', signedAt: AT, meaning: 'APPROVED' } });
    expect(batched.get(6)).toMatchObject({ state: 'valid', signatureId: 42 });
  });

  it('reads a release whose content changed after approval as changed, and a withdrawn approval as withdrawn', async () => {
    const signedAs = effective(5);
    const edited = { ...signedAs, title: 'Complaint handling (edited)' };
    const withdrawn = { ...approvalRow(effective(6), 43), verification_status: 'revoked', is_valid: false };
    const batched = await readQmsReleaseApprovals(clientOf([approvalRow(signedAs, 41), withdrawn]), 9, [edited, effective(6)]);
    expect(batched.get(5)).toMatchObject({ state: 'changed', signer: { signerName: 'Dana Whitfield' } });
    expect(batched.get(6)).toMatchObject({ state: 'withdrawn', signatureId: 43 });
  });

  it('is unverified with no exact row, and unavailable on every release when the read fails', async () => {
    expect((await readQmsReleaseApprovals(clientOf([]), 9, [effective(5)])).get(5)).toMatchObject({ state: 'unverified' });
    const failing = { query: vi.fn(async () => { throw new Error('connection reset'); }) };
    const out = await readQmsReleaseApprovals(failing, 9, [effective(5), effective(6)]);
    expect([out.get(5)?.state, out.get(6)?.state]).toEqual(['unavailable', 'unavailable']);
  });
});

describe('the effective date bound in the approval (CAT2-19)', () => {
  it('stands while the row carries the signed effective date, and does not once the date is changed', async () => {
    const doc = effective(5);
    const signedFor = approvalRow(doc, 41, { effectiveDate: '2026-09-01' });
    expect((await readQmsReleaseApprovals(clientOf([signedFor]), 9, [doc])).get(5)).toMatchObject({ state: 'valid' });
    const moved = { ...doc, effective_date: '2026-08-01' };
    expect((await readQmsReleaseApprovals(clientOf([signedFor]), 9, [moved])).get(5)).toMatchObject({ state: 'unverified' });
    // A signature from before the binding carries no date, and is read as it was.
    expect((await readQmsReleaseApprovals(clientOf([approvalRow(moved, 42)]), 9, [moved])).get(5)).toMatchObject({ state: 'valid' });
  });
});

describe('readQmsRetirementSignatures', () => {
  it('shows the standing retirement, says unsigned when none was taken, and unavailable when the read fails', async () => {
    const rows = [{ id: 51, signed_target: 'qms-document:5', signer_name: 'Q. Lead', signed_at: AT, signature_meaning: 'retirement',
      is_valid: true, superseded_by: null, verification_status: 'valid' }];
    const out = await readQmsRetirementSignatures({ query: async () => ({ rows }) }, 9, [5, 6]);
    expect(out.get(5)).toEqual({ state: 'signed', signatureId: 51, signer: { signerName: 'Q. Lead', signedAt: AT, meaning: 'retirement' } });
    expect(out.get(6)).toEqual({ state: 'unsigned' });
    const failing = await readQmsRetirementSignatures({ query: async () => { throw new Error('down'); } }, 9, [5]);
    expect(failing.get(5)).toEqual({ state: 'unavailable' });
  });
});
