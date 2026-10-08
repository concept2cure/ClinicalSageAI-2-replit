/**
 * The governed transmit (package-ops spine) refuses a package whose document is
 * no longer approved — P-22's release side, held after Validated stopped
 * refusing an unapproved document (product decision 2026-10-08: "approval gates
 * the release, not the technical validation").
 *
 * The chain this pins the last link of: an artifact's approval is part of the
 * package's content fingerprint, so an approval revoked after assembly reads as
 * DRIFT (package-content-fingerprint.pglite.integration.test.ts, "reads an
 * approval revoked after assembly … as DRIFT"); here, a drifted package is
 * refused BUNDLE_CONTENT_DRIFT before any gateway is called. The sequence spine
 * (freeze, dispatch, transmitSequence) is pinned in
 * submission-service/__tests__/sequence-validated-honesty.pglite.test.ts.
 *
 * Runs the real executeGovernedTransmit; the database row, the fingerprint
 * assessment and the gateway are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ transmit: vi.fn(), assess: vi.fn() }));
const ASSEMBLED = vi.hoisted(() => `v4:${'a'.repeat(64)}`);

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string) =>
      /FROM c2c_submission_packages/.test(sql)
        ? { rows: [{ metadata: { bundle: { path: '/tmp/bundles/pkg-42.zip', sha256: 'c'.repeat(64), sizeBytes: 1234, format: 'ectd', validation: { errorCount: 0 }, contentFingerprint: ASSEMBLED } } }] }
        : { rows: [] }),
    connect: vi.fn(),
  },
}));
vi.mock('../../ectd/package-content-fingerprint', async (orig) => ({
  ...(await orig<typeof import('../../ectd/package-content-fingerprint')>()),
  assessPackageContent: h.assess,
}));
vi.mock('../index', () => ({ getGateway: () => ({ transmit: h.transmit }) }));
vi.mock('../fda-esg', () => ({ findActiveTransmittal: vi.fn().mockResolvedValue(null) }));
vi.mock('../../submission-bundle-storage', () => ({ getBundle: vi.fn() }));
vi.mock('fs', () => ({ promises: { stat: vi.fn().mockResolvedValue({ size: 1234 }), access: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() } }));

import { executeGovernedTransmit } from '../governed-transmit';

const input = () =>
  ({
    region: 'fda',
    gateway: 'esg',
    organizationId: 7,
    userId: 11,
    packageId: 42,
    environment: 'test',
    reason: 'RA and QA sign-off complete',
    meaning: 'release',
    authenticationMethod: 'password+totp',
    secondFactorVerified: true,
    reauthVerifiedAt: new Date('2026-10-08T09:59:00Z'),
    recordGovernedAction: vi.fn(),
  }) as any;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  h.transmit.mockReset();
  h.assess.mockReset();
});

describe('executeGovernedTransmit — a document not approved at transmit is refused (P-22, release side)', () => {
  it('refuses a package whose content, approval included, drifted since assembly, and sends nothing', async () => {
    h.assess.mockResolvedValue({ state: 'drift', assembled: ASSEMBLED, current: `v4:${'b'.repeat(64)}` });

    const err = await executeGovernedTransmit(input()).then(() => null, (e: any) => e);

    expect(err?.name).toBe('GovernedTransmitRefusal');
    expect(err.code).toBe('BUNDLE_CONTENT_DRIFT');
    expect(h.assess).toHaveBeenCalledWith(expect.anything(), 42, 7, ASSEMBLED);
    expect(err.message).toMatch(/its approval revoked/);
    expect(h.transmit).not.toHaveBeenCalled();
  });
});
