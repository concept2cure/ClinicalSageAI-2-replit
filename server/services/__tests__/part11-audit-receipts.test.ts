/**
 * The release-signature service exposes only the governed signing capability.
 * Its removed, unused validation/RBAC helpers must not return as an alternate
 * compliance authority. Actual signature/audit atomicity is exercised by
 * part11-release-signature-single-write-path.pglite.integration.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../auditService', () => ({ default: { logAction: vi.fn() }, writeChainedAuditRow: vi.fn() }));
import service from '../part11ComplianceService';

describe('Part 11 has one live signature capability and no unused compliance conclusions', () => {
  it.each([
    'generateSystemValidationReport', 'getSystemValidationStatus',
    'checkAccessControl', 'getRolePermissions', 'verifyDataIntegrity',
    'createAuditTrail', 'getAuditTrail', 'getSubmissionData', 'getDocumentData',
  ])('does not expose the retired %s path', method => {
    expect(service).not.toHaveProperty(method);
  });

  it('retains the content-bound release signature and binding verifier', () => {
    expect(service.createElectronicSignature).toBeTypeOf('function');
    expect(service.computeVersionBindingDigest).toBeTypeOf('function');
  });
});
