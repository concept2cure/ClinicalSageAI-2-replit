/**
 * license-manager reports what it read, and a failed read is a failure.
 *
 * What license-manager did until 2026-10-15:
 *   - checkProjectQuota / checkUserQuota ended in a catch returning
 *     { withinQuota: true, currentCount: 0, maxAllowed: 10 | 5 }: a database
 *     error displayed as "0 of 10 projects, 0 of 5 users, within quota".
 *   - `max_projects || 10`, `max_users || 5`, `max_storage || 5` turned a NULL
 *     (nothing recorded) AND a 0 (zero seats) into 10 / 5 / 5 GB, here and in
 *     getLicenseInfo.
 *   - getModuleCatalog ended in a catch returning [], and read the license
 *     through getLicenseInfo, whose own catch returns null, which also became
 *     []: an unreadable catalog read as an empty one.
 *   - isFeatureAvailable answered true for a feature key nobody packaged, and
 *     requireFeature then named 'professional' as its required tier.
 *   - canAccessModule denied an unreadable license with the reason
 *     'Organization not found'. The denial is right (moduleEntitlementGate lets
 *     a THROWN resolution through, so this must resolve, never reject); the
 *     reason was not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../auditService.js', () => ({ default: { logAction: vi.fn() } }));

import {
  canAccessModule,
  checkProjectQuota,
  checkUserQuota,
  getLicenseInfo,
  getModuleCatalog,
  isFeatureAvailable,
  requireFeature,
} from '../license-manager';

const ORG = {
  id: 3,
  tier: 'standard',
  industry_mode: 'biotech',
  max_users: 5,
  max_projects: 10,
  max_storage: 5,
};

interface Wiring {
  failing?: RegExp;
  org?: Record<string, unknown> | null;
  maxProjects?: unknown;
  maxUsers?: unknown;
  projects?: number;
  members?: number;
}

/** Answer each statement license-manager issues; `failing` rejects. */
function wire(w: Wiring = {}) {
  const answers: Array<[RegExp, () => unknown[]]> = [
    [/SELECT id, tier, industry_mode/, () => (w.org === null ? [] : [w.org ?? ORG])],
    [/FROM module_subscriptions\s+WHERE organization_id = \$1 AND enabled = true/, () => []],
    [/FROM available_modules am/, () => []],
    [/SELECT max_projects FROM organizations/, () => [{ max_projects: 'maxProjects' in w ? w.maxProjects : 10 }]],
    [/SELECT max_users FROM organizations/, () => [{ max_users: 'maxUsers' in w ? w.maxUsers : 5 }]],
    [/FROM projects WHERE organization_id/, () => [{ cnt: String(w.projects ?? 0) }]],
    [/FROM organization_users WHERE organization_id/, () => [{ cnt: String(w.members ?? 0) }]],
  ];
  query.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (w.failing?.test(s)) throw new Error('connection terminated unexpectedly');
    const hit = answers.find(([re]) => re.test(s));
    if (!hit) throw new Error(`unexpected statement in test: ${s.slice(0, 80)}`);
    return { rows: hit[1]() };
  });
}

beforeEach(() => {
  query.mockReset();
});

describe('usage quotas: a failed read is a failure, not "within quota"', () => {
  it('checkProjectQuota rejects when the organization row cannot be read', async () => {
    wire({ failing: /SELECT max_projects FROM organizations/ });
    await expect(checkProjectQuota(3)).rejects.toThrow('connection terminated');
  });

  it('checkUserQuota rejects when the member count cannot be read', async () => {
    wire({ failing: /FROM organization_users/ });
    await expect(checkUserQuota(3)).rejects.toThrow('connection terminated');
  });
});

describe('usage quotas: the limit is what the row records', () => {
  it('a recorded limit is reported as recorded', async () => {
    wire({ maxProjects: 25, projects: 14 });
    expect(await checkProjectQuota(3)).toEqual({ withinQuota: true, currentCount: 14, maxAllowed: 25 });
  });

  it('NULL max_projects is "not recorded", not 10', async () => {
    wire({ maxProjects: null, projects: 2 });
    expect(await checkProjectQuota(3)).toEqual({ withinQuota: null, currentCount: 2, maxAllowed: null });
  });

  it('0 max_users is zero seats, not 5', async () => {
    wire({ maxUsers: 0, members: 3 });
    expect(await checkUserQuota(3)).toEqual({ withinQuota: false, currentCount: 3, maxAllowed: 0 });
  });

  it('no organization row records no limit', async () => {
    query.mockImplementation(async (sql: string) =>
      /FROM organizations/.test(String(sql)) ? { rows: [] } : { rows: [{ cnt: '0' }] },
    );
    expect(await checkUserQuota(3)).toEqual({ withinQuota: null, currentCount: 0, maxAllowed: null });
  });
});

describe('getLicenseInfo: limits are what the row records', () => {
  it('NULL limits stay null', async () => {
    wire({ org: { ...ORG, max_users: null, max_projects: null, max_storage: null } });
    const info = await getLicenseInfo(3);
    expect(info).toMatchObject({ maxUsers: null, maxProjects: null, maxStorageGB: null });
  });

  it('zero limits stay zero', async () => {
    wire({ org: { ...ORG, max_users: 0, max_projects: 0, max_storage: 0 } });
    const info = await getLicenseInfo(3);
    expect(info).toMatchObject({ maxUsers: 0, maxProjects: 0, maxStorageGB: 0 });
  });

  it('still resolves null on a read failure: its existing callers read null as "no license"', async () => {
    wire({ failing: /SELECT id, tier, industry_mode/ });
    expect(await getLicenseInfo(3)).toBeNull();
  });
});

describe('getModuleCatalog: an unreadable catalog is not an empty one', () => {
  it('rejects when the catalog query fails', async () => {
    wire({ failing: /FROM available_modules am/ });
    await expect(getModuleCatalog(3)).rejects.toThrow('connection terminated');
  });

  it('rejects when the license read fails', async () => {
    wire({ failing: /SELECT id, tier, industry_mode/ });
    await expect(getModuleCatalog(3)).rejects.toThrow('connection terminated');
  });

  it('an organization with no row still has no catalog', async () => {
    wire({ org: null });
    expect(await getModuleCatalog(3)).toEqual([]);
  });
});

describe('access decisions stay closed', () => {
  it('canAccessModule denies an unreadable license, without rejecting, and says why', async () => {
    wire({ failing: /SELECT id, tier, industry_mode/ });
    const verdict = await canAccessModule(3, 'vault');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/could not be read/);
  });

  it('canAccessModule still says "Organization not found" when there is no row', async () => {
    wire({ org: null });
    expect(await canAccessModule(3, 'vault')).toEqual({ allowed: false, reason: 'Organization not found' });
  });

  it('isFeatureAvailable denies a feature key nobody packaged, at every tier', () => {
    expect(isFeatureAvailable('not_a_packaged_feature', 'enterprise')).toBe(false);
    expect(isFeatureAvailable('not_a_packaged_feature', 'free')).toBe(false);
    // Packaged features are unchanged.
    expect(isFeatureAvailable('chat', 'free')).toBe(true);
    expect(isFeatureAvailable('sso', 'professional')).toBe(false);
  });

  it('requireFeature refuses an unpackaged feature without inventing a required tier', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();
    const req = { licenseInfo: { tier: 'enterprise' } } as unknown as Request;
    await requireFeature('not_a_packaged_feature')(req, { status } as unknown as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ requiredTier: null }));
  });
});
