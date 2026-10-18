import { describe, expect, it, vi } from 'vitest';

const capability = vi.hoisted(() => ({
  transport: 'as2', implemented: true, reason: 'Offline CMS implemented; agency UAT not verified.',
  missingDependencies: ['Environment-specific agency UAT and verified receipt evidence'],
}));
vi.mock('../../../db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, db: {} }));
vi.mock('../fda-esg', () => ({
  fdaEsgTransportImplementation: () => capability,
  FdaEsgGateway: class {
    region = 'fda'; gateway = 'esg'; transport = 'as2';
    isConfigured = async () => true;
  },
}));

import { gatewayConfigurationStatus, gatewayTransportReadiness, getGateway, getGatewayUnguarded, refusedBeforeWire } from '../index';
import { UnverifiedTransportError, TransmitAuthorizationError } from '../types';

describe('gateway credentials and qualification are independent', () => {
  it('configured FDA credentials plus implemented offline transport never establish agency acceptance', async () => {
    const gateways = await gatewayConfigurationStatus(42, 'staging');
    expect(gateways.find((g) => g.region === 'fda')).toMatchObject({
      configured: true,
      transportReadiness: { transport: 'as2', implementation: 'implemented', qualification: 'not_verified', qualified: false, reason: capability.reason },
    });
  });

  it('regional generic protocol adapters remain unverified rather than becoming qualified by discovery', async () => {
    const readiness = await gatewayTransportReadiness('uk', 'mhra_gateway', 'production');
    expect(readiness).toMatchObject({ implementation: 'unavailable', qualification: 'not_verified', qualified: false });
    expect(readiness.missingDependencies).toContain('Verified current agency protocol contract');
  });

  it('a missing runtime implementation is reported unavailable even if the same account has credentials', async () => {
    capability.implemented = false;
    try {
      const readiness = await gatewayTransportReadiness('fda', 'esg', 'production');
      expect(readiness).toMatchObject({ implementation: 'unavailable', qualified: false });
    } finally {
      capability.implemented = true;
    }
  });

  it.each([
    { organizationId: 8 }, { signatureActionId: 'another-signature' }, { bundleSha256: 'another-bundle' },
  ])('refuses a sequence binding that disagrees with verified request facts: %j', async (mismatch) => {
    const error = await getGateway('fda', 'esg').transmit({
      authorization: { kind: 'governed-signature', signatureActionId: 'actual-signature', actorUserId: 3 },
      organizationId: 7, environment: 'staging', bundle: { sha256: 'actual-bundle' },
      dispatchBinding: { attemptId: '00000000-0000-4000-8000-000000000001', organizationId: 7, sequenceId: 41, signatureActionId: 'actual-signature', bundleSha256: 'actual-bundle', ...mismatch },
    } as any).then(() => null, (err) => err);
    expect(error).toBeInstanceOf(TransmitAuthorizationError);
    expect(refusedBeforeWire(error)).toBe(true);
  });

  it.each([
    ['uk', 'mhra_gateway'], ['cn', 'nmpa_gateway'], ['au', 'tga_ebs'], ['ch', 'swissmedic_egateway'],
    ['br', 'anvisa_gateway'], ['in', 'cdsco_sugam'], ['kr', 'mfds_dbio'], ['sg', 'hsa_prism'],
  ] as const)('refuses the unsourced %s adapter before package/database/wire work and makes the claim releasable', async (region, gateway) => {
    const transmit = vi.spyOn(getGatewayUnguarded(region, gateway), 'transmit');
    try {
      const failure = await getGateway(region, gateway).transmit({
        authorization: { kind: 'governed-signature', signatureActionId: 'sig', actorUserId: 3 },
        organizationId: 7, environment: 'staging',
        // A refused protocol must never inspect or open a package, regardless of credentials.
      } as any).then(() => null, (err) => err);
      expect(failure).toBeInstanceOf(UnverifiedTransportError);
      expect(refusedBeforeWire(failure)).toBe(true);
      expect(transmit).not.toHaveBeenCalled();
    } finally {
      transmit.mockRestore();
    }
  });
});
