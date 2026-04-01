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

  it('handles percent-encoded next param', () => {
    const redirect = computeRedirect('?next=%2Fclient-portal%2Fdashboard');
    expect(redirect).toBe('/client-portal/dashboard');
  });

  it('rejects next param with leading whitespace', () => {
    const redirect = computeRedirect('?next= /client-portal');
    expect(redirect).toBe('/concept2cure');
  });

  it('handles double-encoded next param', () => {
    const redirect = computeRedirect('?next=%252Fclient-portal%252Fdashboard');
    expect(redirect).toBe('/client-portal/dashboard');
  });

  it('sends org members without client role to concept2cure dashboard', () => {
    const user = { organizationId: 'org_123' } as any;
    const redirect = computeRedirect('', user);
    expect(redirect).toBe('/concept2cure');
  });



  it('rejects non-canonical internal routes outside allowed beta prefixes', () => {
    const redirect = computeRedirect('?next=/admin');
    expect(redirect).toBe('/concept2cure');
  });

  it('rejects traversal-style redirect payloads', () => {
    const redirect = computeRedirect('?next=/concept2cure/../../etc/passwd');
    expect(redirect).toBe('/concept2cure');
  });

  it('rejects backslash path payloads', () => {
    const redirect = computeRedirect('?next=%2Fconcept2cure%5Cevil');
    expect(redirect).toBe('/concept2cure');
  });



  it('preserves canonical query/hash in allowed paths', () => {
    const redirect = computeRedirect('?next=/concept2cure/project/p1?tab=work#editor');
    expect(redirect).toBe('/concept2cure/project/p1?tab=work#editor');
  });

  it('rejects control-character payloads', () => {
    const redirect = computeRedirect('?next=%2Fconcept2cure%2Fproject%2Fp1%00');
    expect(redirect).toBe('/concept2cure');
  });

  it('uses role-based client redirect for client_user/client_admin', () => {
    const user = { roles: ['client_user'] } as any;
    const redirect = computeRedirect('', user);
    expect(redirect).toBe('/client-portal');
  });
});
