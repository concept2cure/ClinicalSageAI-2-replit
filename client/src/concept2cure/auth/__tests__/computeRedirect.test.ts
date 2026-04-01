import { computeRedirect } from '../redirectUtils';

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
    expect(redirect).toBe('/concept2cure');
  });

  it('uses canonical Concept2Cure redirect for client_user/client_admin', () => {
    const user = { roles: ['client_user'] } as any;
    const redirect = computeRedirect('', user);
    expect(redirect).toBe('/concept2cure');
  });

  it('allows internal returnTo parameter', () => {
    const redirect = computeRedirect('?returnTo=/concept2cure/project/proj-123');
    expect(redirect).toBe('/concept2cure/project/proj-123');
  });

  it('decodes encoded returnTo parameter', () => {
    const redirect = computeRedirect('?returnTo=%2Fconcept2cure%2Fproject%2Fproj-123');
    expect(redirect).toBe('/concept2cure/project/proj-123');
  });

  it('allows internal redirect parameter', () => {
    const redirect = computeRedirect('?redirect=/concept2cure/billing');
    expect(redirect).toBe('/concept2cure/billing');
  });

  it('rejects external redirect parameter', () => {
    const redirect = computeRedirect('?redirect=https://evil.example/phish');
    expect(redirect).toBe('/concept2cure');
  });
});
