/**
 * resolveEntitlements never reports a license as accepted that nobody checked,
 * and never reports a usage limit that nobody recorded.
 *
 * What resolveEntitlements did until 2026-10-15:
 *   - `userId != null ? getOutstandingAgreements(...) : Promise.resolve([])`
 *     then `licenseAccepted: outstanding.length === 0`: a request with no user
 *     came back licenseAccepted: true, outstandingAgreements: [].
 *   - eula-service swallowed a failed agreements read into [], so an
 *     unreadable store ALSO came back licenseAccepted: true.
 *   - checkProjectQuota / checkUserQuota now report an unrecorded limit as
 *     null; the old mapping turned that into pct 0 plus a critical
 *     "limit reached ... of null" recommendation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const lm = vi.hoisted(() => ({
  getLicenseInfo: vi.fn(),
  readLicenseInfo: vi.fn(),
  getModuleCatalog: vi.fn(),
  checkProjectQuota: vi.fn(),
  checkUserQuota: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));
vi.mock('../../auditService.js', () => ({ default: { logAction: vi.fn() } }));
vi.mock('../../license-manager.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...lm,
}));

import { resolveEntitlements } from '../entitlements-service';

const LICENSE = {
  organizationId: 3,
  tier: 'standard',
  industryMode: 'biotech',
  enabledModules: [],
  maxUsers: 5,
  maxProjects: 10,
  maxStorageGB: 5,
};

const EULA_ROW = {
  id: 'a-eula',
  agreement_key: 'eula',
  version: '2026.06',
  title: 'End-User License Agreement',
  summary: null,
  body: 'Terms.',
  url: null,
  scope: 'user',
  required: true,
  status: 'active',
  effective_at: '2026-06-21T00:00:00.000Z',
};

/** The agreements store: every statement answers, except `failing`. */
function wireAgreements(opts: { failing?: RegExp; accepted?: string[] } = {}) {
  query.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (opts.failing?.test(s)) throw new Error('connection terminated unexpectedly');
    if (/CREATE TABLE|WHERE NOT EXISTS \(SELECT 1 FROM license_agreements/.test(s)) return { rows: [] };
    if (/FROM license_agreements WHERE status = 'active'/.test(s)) return { rows: [EULA_ROW] };
    // The EULA is user-scoped, so only the user-scoped acceptance read can
    // satisfy it; the organization-scoped read answers nothing for it.
    const acceptanceRead = /SELECT DISTINCT acceptance\.agreement_id\s+FROM license_acceptances acceptance\s+JOIN license_agreements agreement ON agreement\.id = acceptance\.agreement_id\s+WHERE acceptance\.(user_id|organization_id) = \$1 AND agreement\.scope = '(user|organization)'/.exec(s);
    if (acceptanceRead) {
      const [, keyColumn, scope] = acceptanceRead;
      if (keyColumn === 'user_id' && scope === 'user') {
        return { rows: (opts.accepted ?? []).map((agreement_id) => ({ agreement_id })) };
      }
      if (keyColumn === 'organization_id' && scope === 'organization') return { rows: [] };
    }
    throw new Error(`unexpected statement in test: ${s.slice(0, 80)}`);
  });
}

beforeEach(() => {
  query.mockReset();
  for (const fn of Object.values(lm)) fn.mockReset();
  lm.getLicenseInfo.mockResolvedValue(LICENSE);
  lm.readLicenseInfo.mockResolvedValue(LICENSE);
  lm.getModuleCatalog.mockResolvedValue([]);
  lm.checkProjectQuota.mockResolvedValue({ withinQuota: true, currentCount: 2, maxAllowed: 10 });
  lm.checkUserQuota.mockResolvedValue({ withinQuota: true, currentCount: 3, maxAllowed: 5 });
});

describe('license acceptance is reported only when it was read', () => {
  it('a request with no user is "not assessed", not "accepted"', async () => {
    wireAgreements();
    const summary = await resolveEntitlements(3);
    expect(summary?.licenseAccepted).toBeNull();
    expect(summary?.outstandingAgreements).toBeNull();
    expect(summary?.recommendations.some((r) => r.type === 'license_acceptance')).toBe(false);
  });

  it('an unreadable agreement store fails the summary instead of reporting the license accepted', async () => {
    wireAgreements({ failing: /FROM license_acceptances/ });
    await expect(resolveEntitlements(3, 7)).rejects.toThrow('connection terminated');
  });

  it('a readable store with an unaccepted required agreement: not accepted, listed, critical', async () => {
    wireAgreements();
    const summary = await resolveEntitlements(3, 7);
    expect(summary?.licenseAccepted).toBe(false);
    expect(summary?.outstandingAgreements?.map((a) => a.id)).toEqual(['a-eula']);
    expect(summary?.recommendations[0]).toMatchObject({ type: 'license_acceptance', severity: 'critical' });
  });

  it('a readable store with everything accepted: accepted', async () => {
    wireAgreements({ accepted: ['a-eula'] });
    const summary = await resolveEntitlements(3, 7);
    expect(summary?.licenseAccepted).toBe(true);
    expect(summary?.outstandingAgreements).toEqual([]);
  });
});

describe('usage limits are reported only when recorded', () => {
  it('a limit the organization row does not record is null, with no warning invented about it', async () => {
    wireAgreements({ accepted: ['a-eula'] });
    lm.checkProjectQuota.mockResolvedValue({ withinQuota: null, currentCount: 2, maxAllowed: null });
    const summary = await resolveEntitlements(3, 7);
    expect(summary?.quotas.find((q) => q.key === 'projects')).toEqual({
      key: 'projects',
      label: 'Projects',
      current: 2,
      max: null,
      pct: null,
      withinQuota: null,
    });
    expect(summary?.recommendations.filter((r) => r.type === 'quota_warning')).toEqual([]);
  });

  it('a failed quota read fails the summary', async () => {
    wireAgreements({ accepted: ['a-eula'] });
    lm.checkUserQuota.mockRejectedValue(new Error('connection terminated unexpectedly'));
    await expect(resolveEntitlements(3, 7)).rejects.toThrow('connection terminated');
  });
});
