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
import { HealthCanadaGateway } from './health-canada-gateway';
import { MhraGateway } from './mhra-gateway';
import { NmpaGateway } from './nmpa-gateway';
import { TgaEbsGateway } from './tga-ebs-gateway';
import { SwissmedicEgatewayGateway } from './swissmedic-egateway';
import { AnvisaGateway } from './anvisa-gateway';
import { CdscoSugamGateway } from './cdsco-sugam-gateway';
import { MfdsGateway } from './mfds-gateway';
import { HsaPrismGateway } from './hsa-prism-gateway';
import type { GatewayName, Region, SubmissionGateway } from './types';

export * from './types';
export { packageEctdSubmission } from './regional-packager';
export type { EctdLeaf, PackagerInput } from './regional-packager';
export { readVerifiedBundle } from './bundle-integrity';

const REGISTRY: Record<string, SubmissionGateway> = {
  'fda:esg':                       new FdaEsgGateway(),
  'ema:cesp':                      new EmaCespGateway(),
  'ema:eudamed':                   new EudamedGateway(),
  'pmda:pmda_gateway':             new PmdaGateway(),
  'ca:hc_cesg':                    new HealthCanadaGateway(),
  'uk:mhra_gateway':               new MhraGateway(),
  'cn:nmpa_gateway':               new NmpaGateway(),
  'au:tga_ebs':                    new TgaEbsGateway(),
  'ch:swissmedic_egateway':        new SwissmedicEgatewayGateway(),
  'br:anvisa_gateway':             new AnvisaGateway(),
  'in:cdsco_sugam':                new CdscoSugamGateway(),
  'kr:mfds_dbio':                  new MfdsGateway(),
  'sg:hsa_prism':                  new HsaPrismGateway(),
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
