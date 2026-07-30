import { describe, it, expect } from 'vitest';
import {
  isFirecrawlEnabled,
  firecrawlAllowlist,
  evaluateScrapeGuards,
} from '../guards';

describe('isFirecrawlEnabled (fail closed)', () => {
  it('is enabled ONLY for an explicit true', () => {
    expect(isFirecrawlEnabled({ firecrawl_enabled: true })).toBe(true);
  });

  it.each([
    ['false', { firecrawl_enabled: false }],
    ['null', { firecrawl_enabled: null }],
    ['undefined', {}],
    ['missing settings', undefined],
  ])('treats %s as DISABLED', (_label, settings) => {
    expect(isFirecrawlEnabled(settings as any)).toBe(false);
  });
});

describe('firecrawlAllowlist', () => {
  it('returns the array when present', () => {
    expect(firecrawlAllowlist({ firecrawl_domain_allowlist_json: ['fda.gov'] })).toEqual(['fda.gov']);
  });
  it('tolerates a non-array / missing column', () => {
    expect(firecrawlAllowlist({ firecrawl_domain_allowlist_json: 'oops' as any })).toEqual([]);
    expect(firecrawlAllowlist({})).toEqual([]);
    expect(firecrawlAllowlist(undefined)).toEqual([]);
  });
});

describe('evaluateScrapeGuards', () => {
  const url = 'https://clinicaltrials.gov/study/NCT00000000';

  it('denies when the tenant is not explicitly enabled (admin_disabled)', () => {
    const r = evaluateScrapeGuards({
      settings: { firecrawl_domain_allowlist_json: ['clinicaltrials.gov'] },
      requestedUrl: url,
      requestRole: 'admin',
    });
    expect(r).toEqual({ ok: false, status: 403, code: 'policy_blocked', reason: 'admin_disabled' });
  });

  it('denies an enabled tenant that has NO allowlist (allowlist_required)', () => {
    const r = evaluateScrapeGuards({
      settings: { firecrawl_enabled: true },
      requestedUrl: url,
      requestRole: 'admin',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason).toBe('allowlist_required');
    }
  });

  it('denies a domain outside the allowlist', () => {
    const r = evaluateScrapeGuards({
      settings: { firecrawl_enabled: true, firecrawl_domain_allowlist_json: ['fda.gov'] },
      requestedUrl: url,
      requestRole: 'admin',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('policy_blocked');
  });

  it('denies a role outside a configured role allowlist (role_blocked)', () => {
    const r = evaluateScrapeGuards({
      settings: {
        firecrawl_enabled: true,
        firecrawl_domain_allowlist_json: ['clinicaltrials.gov'],
        firecrawl_role_policy_json: { allowedRoles: ['admin'] },
      },
      requestedUrl: url,
      requestRole: 'viewer',
    });
    expect(r).toEqual({ ok: false, status: 403, code: 'policy_blocked', reason: 'role_blocked' });
  });

  it('allows an enabled tenant, allowlisted domain, permitted role', () => {
    const r = evaluateScrapeGuards({
      settings: {
        firecrawl_enabled: true,
        firecrawl_domain_allowlist_json: ['clinicaltrials.gov'],
        firecrawl_role_policy_json: { allowedRoles: ['admin', 'viewer'] },
      },
      requestedUrl: url,
      requestRole: 'viewer',
    });
    expect(r).toEqual({ ok: true });
  });

  it('allows when no role policy is configured', () => {
    const r = evaluateScrapeGuards({
      settings: { firecrawl_enabled: true, firecrawl_domain_allowlist_json: ['clinicaltrials.gov'] },
      requestedUrl: url,
      requestRole: 'anyone',
    });
    expect(r).toEqual({ ok: true });
  });
});
