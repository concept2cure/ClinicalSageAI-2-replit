import { describe, it, expect, vi, beforeEach } from 'vitest';
import part11ComplianceService from '../part11ComplianceService';

/**
 * Unit tests for the 21 CFR Part 11 data-integrity verification path
 * (verifyDataIntegrity + getSubmissionData/getDocumentData).
 *
 * The record-fetch methods are stubbed so the test exercises the
 * hash/compare/fail-closed logic without a live database. createAuditTrail is
 * also stubbed because the real implementation persists to the DB.
 */
describe('Part11ComplianceService.verifyDataIntegrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The audit-trail write requires a DB; no-op it for these unit tests.
    vi.spyOn(part11ComplianceService as any, 'createAuditTrail').mockResolvedValue({});
  });

  it('returns valid:true when the computed hash matches the expected hash', async () => {
    const payload = { id: 1, organizationId: 7, data: 'canonical-submission-payload' };
    vi.spyOn(part11ComplianceService as any, 'getSubmissionData').mockResolvedValue(payload);

    const expectedHash = part11ComplianceService.calculateHash(payload);
    const result = await part11ComplianceService.verifyDataIntegrity('submission', 1, expectedHash);

    expect(result.valid).toBe(true);
  });

  it('returns valid:false when the record was tampered (hash mismatch)', async () => {
    const payload = { id: 1, organizationId: 7, data: 'tampered-submission-payload' };
    vi.spyOn(part11ComplianceService as any, 'getSubmissionData').mockResolvedValue(payload);

    const result = await part11ComplianceService.verifyDataIntegrity(
      'submission',
      1,
      'a'.repeat(64) // a plausible-looking but wrong sha256
    );

    expect(result.valid).toBe(false);
  });

  it('fails closed (valid:false) when the record does not exist', async () => {
    vi.spyOn(part11ComplianceService as any, 'getDocumentData').mockRejectedValue(
      new Error('Part 11 integrity check: document 99 not found')
    );

    const result = await part11ComplianceService.verifyDataIntegrity('document', 99, 'anyhash');

    expect(result.valid).toBe(false);
    expect((result as any).error).toContain('not found');
  });

  it('rejects unknown entity types (fails closed)', async () => {
    const result = await part11ComplianceService.verifyDataIntegrity('widget', 1, 'anyhash');
    expect(result.valid).toBe(false);
  });
});
