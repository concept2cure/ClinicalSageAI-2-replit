import { describe, it, expect } from 'vitest';
import { computeRedirect } from '../client/src/concept2cure/auth/redirectUtils';

describe('computeRedirect', () => {
  it('allows internal next param', () => {
    const redirect = computeRedirect('?next=/client-portal/dashboard');
    expect(redirect).toBe('/client-portal/dashboard');
  });

  it('rejects external next param', () => {
    const redirect = computeRedirect('?next=https://evil.com');
    expect(redirect).toBe('/concept2cure');
  });

  it('rejects protocol-relative next param starting with //', () => {
    const redirect = computeRedirect('?next=//evil.com');
    expect(redirect).toBe('/concept2cure');
  });

  it('prefers organization membership to client portal', () => {
    const user = { organizationId: 'org_123' } as any;
    const redirect = computeRedirect('', user);
    expect(redirect).toBe('/client-portal');
  });

  it('uses role-based client redirect for client_user/client_admin', () => {
    const user = { roles: ['client_user'] } as any;
    const redirect = computeRedirect('', user);
    expect(redirect).toBe('/client-portal');
  });
});
