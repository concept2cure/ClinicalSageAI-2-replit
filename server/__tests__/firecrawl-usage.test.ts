import { evaluateFirecrawlPolicy } from '../integrations/firecrawl/policy';
import { usageDateForTenant } from '../integrations/firecrawl/usage';

describe('firecrawl policy + quota helpers', () => {
  test('policy blocks non-allowlisted domain', () => {
    const res = evaluateFirecrawlPolicy({
      enabled: true,
      requestedUrl: 'https://example.com/path',
      domainAllowlist: ['nih.gov'],
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('policy_blocked');
  });

  test('policy allows subdomain of allowlisted host', () => {
    const res = evaluateFirecrawlPolicy({
      enabled: true,
      requestedUrl: 'https://sub.nih.gov/path',
      domainAllowlist: ['nih.gov'],
    });
    expect(res.allowed).toBe(true);
  });

  test('usageDate returns YYYY-MM-DD', () => {
    const date = usageDateForTenant(new Date('2026-03-27T10:00:00Z'));
    expect(date).toBe('2026-03-27');
  });

  test('policy blocks auth/private style paths', () => {
    const res = evaluateFirecrawlPolicy({
      enabled: true,
      requestedUrl: 'https://example.com/login?next=/account',
    });
    expect(res.allowed).toBe(false);
  });

  test('policy blocks non-http protocols', () => {
    const res = evaluateFirecrawlPolicy({
      enabled: true,
      requestedUrl: 'ftp://example.com/public-file',
    });
    expect(res.allowed).toBe(false);
  });

  test('policy blocks domains in category policy', () => {
    const res = evaluateFirecrawlPolicy({
      enabled: true,
      requestedUrl: 'https://disallowed.example/path',
      categoryPolicy: { blockedDomains: ['disallowed.example'] },
    });
    expect(res.allowed).toBe(false);
  });
});
