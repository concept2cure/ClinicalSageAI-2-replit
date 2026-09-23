/**
 * The §11.70 content digest a QMS approval signature is bound to.
 *
 * The digest must cover the controlled content and NOT the approval stamps:
 * a signature bound to a digest that includes approved_at could never be
 * recomputed by an inspector from the row as it was when it was signed, and a
 * digest that included metadata.approval would be a digest of itself.
 */
import { describe, it, expect } from 'vitest';
import {
  computeQmsDocumentContentDigest,
  QMS_DOCUMENT_APPROVAL_MEANING,
  QMS_DOCUMENT_BINDING_BASIS,
  type QmsDocumentRow,
} from '../document-approval-signature';
import { TASK_SIGNATURE_MEANINGS } from '../../part11/signature-meanings';

const base: QmsDocumentRow = {
  id: 11, organization_id: 9, doc_number: 'SOP-001', title: 'Design control', doc_type: 'sop',
  category: 'design', version: '1.0', status: 'draft', effective_date: null, next_review_date: '2027-01-01',
  author_id: 3, approver_id: null, approved_at: null, superseded_by_id: null, artifact_id: null,
  metadata: { sections: [{ key: 'purpose', body: 'Controls design inputs.' }] },
};

describe('computeQmsDocumentContentDigest', () => {
  it('is a sha256 hex over the version content and is stable', () => {
    const d = computeQmsDocumentContentDigest(base);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(computeQmsDocumentContentDigest({ ...base })).toBe(d);
  });

  it('changes when the controlled content changes', () => {
    const d = computeQmsDocumentContentDigest(base);
    expect(computeQmsDocumentContentDigest({ ...base, title: 'Design control, rev B' })).not.toBe(d);
    expect(computeQmsDocumentContentDigest({ ...base, version: '2.0' })).not.toBe(d);
    expect(computeQmsDocumentContentDigest({ ...base, metadata: { sections: [] } })).not.toBe(d);
  });

  it('ignores the approval stamps the signature applies, and metadata.approval itself', () => {
    const d = computeQmsDocumentContentDigest(base);
    const afterApproval: QmsDocumentRow = {
      ...base,
      status: 'effective',
      approver_id: 7,
      approved_at: '2026-09-21T10:00:00.000Z',
      effective_date: '2026-09-21',
      updated_at: '2026-09-21T10:00:00.000Z',
      metadata: { ...base.metadata, approval: { reason: 'x', contentDigest: d } },
    };
    expect(computeQmsDocumentContentDigest(afterApproval)).toBe(d);
  });

  it('treats a Date and its YYYY-MM-DD string as the same review date', () => {
    const asDate = computeQmsDocumentContentDigest({ ...base, next_review_date: new Date('2027-01-01T00:00:00.000Z') });
    expect(asDate).toBe(computeQmsDocumentContentDigest(base));
  });
});

describe('the approval meaning and binding basis', () => {
  it('APPROVED is taken from the platform signature-meaning enum, not minted here', () => {
    expect(QMS_DOCUMENT_APPROVAL_MEANING).toBe('APPROVED');
    expect(TASK_SIGNATURE_MEANINGS).toContain(QMS_DOCUMENT_APPROVAL_MEANING);
  });

  it('states what the bound digest is a digest of', () => {
    expect(QMS_DOCUMENT_BINDING_BASIS).toBe('qms-document-version-content-sha256');
  });
});
