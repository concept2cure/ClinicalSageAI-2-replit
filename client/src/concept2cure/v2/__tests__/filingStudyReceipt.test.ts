// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { matchingLeafReceipt, placementAuditWarning } from '../surfaces/filingTarget';

const pointer = { sequenceId: 11, sectionCode: '5.3.5.1', lifecycleOp: 'new', documentTable: 'vault_documents' as const, documentUuid: 'doc-101' };
const expected = { ...pointer, studyId: 'STUDY-101', stfFileTag: 'study-report-body' };
const row = { ...expected, id: 41, auditTrail: { persisted: true, chained: true } };
describe('existing placement receipt with expected study metadata', () => {
  it('requires the exact fields when metadata was sent', () => {
    expect(matchingLeafReceipt(row, expected)).toBe(true);
    expect(matchingLeafReceipt({ ...row, studyId: undefined }, expected)).toBe(false);
    expect(matchingLeafReceipt({ ...row, stfFileTag: undefined }, expected)).toBe(false);
    expect(matchingLeafReceipt({ ...row, studyId: 'STUDY-102' }, expected)).toBe(false);
    expect(matchingLeafReceipt({ ...row, stfFileTag: 'protocol' }, expected)).toBe(false);
  });
  it('checks explicit null metadata and preserves receipt compatibility when no metadata was sent', () => {
    expect(matchingLeafReceipt({ ...row, studyId: null, stfFileTag: null }, { ...expected, studyId: null, stfFileTag: null })).toBe(true);
    expect(matchingLeafReceipt({ ...row, studyId: undefined }, { ...expected, studyId: null })).toBe(false);
    expect(matchingLeafReceipt({ ...row, studyId: undefined, stfFileTag: undefined }, pointer)).toBe(true);
  });
  it('still refuses absent bodies, wrong pointers, sections and sequences', () => {
    for (const bad of [null, undefined, {}, { ...row, documentUuid: 'other' }, { ...row, sequenceId: 12 }, { ...row, sectionCode: '5.3.5.2' }]) {
      expect(matchingLeafReceipt(bad, expected)).toBe(false);
    }
  });
  it('reports sequence transition audit uncertainty alongside the placement audit', () => {
    expect(placementAuditWarning({ ...row, sequenceStatusChanged: { from: 'validated', to: 'assembling', auditTrail: { persisted: false } } }))
      .toMatch(/sequence.*audit.*not confirmed/i);
    expect(placementAuditWarning({ ...row, sequenceStatusChanged: { from: 'validated', to: 'assembling', auditTrail: { persisted: true, chained: false } } }))
      .toMatch(/sequence.*audit.*retrievable/i);
    expect(placementAuditWarning(row)).toBe('');
  });
});
