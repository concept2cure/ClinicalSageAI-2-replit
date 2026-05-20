/**
 * Submission gateways — public API. Returns the right gateway implementation
 * by region + gateway name, and exposes the regional packager so callers
 * can build a region-ready bundle in one call.
 *
 * Usage:
 *   const gw = getGateway('fda', 'esg');
 *   const result = await gw.transmit({ organizationId, bundle, environment, ... });
 */

import { FdaEsgGateway } from './fda-esg';
import { EmaCespGateway, EudamedGateway } from './ema-cesp';
import { PmdaGateway } from './pmda-gateway';
import type { GatewayName, Region, SubmissionGateway } from './types';

export * from './types';
export { packageEctdSubmission } from './regional-packager';
export type { EctdLeaf, PackagerInput } from './regional-packager';

const REGISTRY: Record<string, SubmissionGateway> = {
  'fda:esg':           new FdaEsgGateway(),
  'ema:cesp':          new EmaCespGateway(),
  'ema:eudamed':       new EudamedGateway(),
  'pmda:pmda_gateway': new PmdaGateway(),
};

/** Resolve the gateway implementation for (region, gateway). */
export function getGateway(region: Region, gateway: GatewayName): SubmissionGateway {
  const key = `${region}:${gateway}`;
  const impl = REGISTRY[key];
  if (!impl) {
    throw new Error(`No gateway registered for ${key}`);
  }
  return impl;
}

/** List every (region, gateway) implementation available. */
export function listGateways(): Array<{ region: Region; gateway: GatewayName; transport: string }> {
  return Object.values(REGISTRY).map((g) => ({
    region:    g.region,
    gateway:   g.gateway,
    transport: g.transport,
  }));
}

/** Report which gateways are configured for an organization. */
export async function gatewayConfigurationStatus(
  organizationId: number,
  environment: 'staging' | 'production',
): Promise<Array<{ region: Region; gateway: GatewayName; configured: boolean }>> {
  const out: Array<{ region: Region; gateway: GatewayName; configured: boolean }> = [];
  for (const gw of Object.values(REGISTRY)) {
    out.push({
      region: gw.region,
      gateway: gw.gateway,
      configured: await gw.isConfigured(organizationId, environment),
    });
  }
  return out;
}
