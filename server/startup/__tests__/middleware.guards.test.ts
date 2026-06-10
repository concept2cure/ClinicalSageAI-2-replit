import { describe, expect, it } from 'vitest';
import {
  isConcept2cureApiRoute,
  isDestructiveAuditMutation,
  isImmutableAuditPath,
  shouldLogRequestBody,
} from '../middleware';

describe('startup middleware guard helpers', () => {
  it('detects Concept2Cure API routes from originalUrl/path/url', () => {
    expect(isConcept2cureApiRoute({ originalUrl: '/api/concept2cure/projects', path: '', url: '' })).toBe(true);
    expect(isConcept2cureApiRoute({ originalUrl: '', path: '/api/concept2cure/artifacts', url: '' })).toBe(true);
    expect(isConcept2cureApiRoute({ originalUrl: '', path: '', url: '/api/concept2cure/upload' })).toBe(true);
    expect(isConcept2cureApiRoute({ originalUrl: '/api/health', path: '', url: '' })).toBe(false);
    expect(isConcept2cureApiRoute({ originalUrl: '/api/concept2curex', path: '', url: '' })).toBe(
      false
    );
  });

  it('does not log body for concept2cure or safe HTTP methods', () => {
    expect(shouldLogRequestBody({ method: 'GET' }, false)).toBe(false);
    expect(shouldLogRequestBody({ method: 'HEAD' }, false)).toBe(false);
    expect(shouldLogRequestBody({ method: 'OPTIONS' }, false)).toBe(false);
    expect(shouldLogRequestBody({ method: 'POST' }, true)).toBe(false);
    expect(shouldLogRequestBody({ method: 'POST' }, false)).toBe(true);
  });

  it('blocks only destructive audit mutations and precise bulk-delete paths', () => {
    expect(isDestructiveAuditMutation({ method: 'DELETE', path: '/api/audit/events/1' })).toBe(true);
    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/bulk-delete' })).toBe(true);
    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/v2/bulk-delete/run' })).toBe(true);

    expect(isDestructiveAuditMutation({ method: 'POST', path: '/api/audit/not-bulk-delete-ish' })).toBe(false);
    expect(isDestructiveAuditMutation({ method: 'PATCH', path: '/api/audit/bulk-delete' })).toBe(false);
  });

  it('protects the full audit and e-signature trail surface (Part 11 immutability)', () => {
    // Previously-guarded paths still match.
    expect(isImmutableAuditPath('/api/audit/events/1')).toBe(true);
    expect(isImmutableAuditPath('/api/audit/bulk-delete')).toBe(true);
    // Broadened coverage: the whole audit namespace + e-signature records.
    expect(isImmutableAuditPath('/api/audit/logs')).toBe(true);
    expect(isImmutableAuditPath('/api/audit/signatures/9')).toBe(true);
    expect(isImmutableAuditPath('/api/audit')).toBe(true);
    expect(isImmutableAuditPath('/api/audit-logs')).toBe(true);
    expect(isImmutableAuditPath('/api/audit-services/export')).toBe(true);
    expect(isImmutableAuditPath('/api/mdx/audit')).toBe(true);
    expect(isImmutableAuditPath('/api/esignature/42')).toBe(true);
    // Unrelated routes are not affected (no false-positive blocking).
    expect(isImmutableAuditPath('/api/auditorium')).toBe(false);
    expect(isImmutableAuditPath('/api/coauthor/documents/5')).toBe(false);
    expect(isImmutableAuditPath('/api/submissions')).toBe(false);
  });
});
