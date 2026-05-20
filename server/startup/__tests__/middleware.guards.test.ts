import { describe, expect, it } from 'vitest';
import {
  isConcept2cureApiRoute,
  isDestructiveAuditMutation,
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
});
