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
import type {
  GatewayName,
  GatewayTransmitRequest,
  Region,
  SubmissionGateway,
  TransmitAuthorization,
} from './types';
import { TransmitAuthorizationError } from './types';

export * from './types';
export { platformTransmittalRecord, acknowledgementFilename } from './acknowledgement';
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

/**
 * Runtime half of the transmit authorization gate.
 *
 * The type system already requires `authorization` on every transmit request,
 * but the caller that made this necessary — a tool handler dispatching on
 * model-supplied JSON — is exactly the kind of caller that reaches these
 * gateways through `any`. So the check is enforced here as well, at the one
 * point every caller passes through.
 */
function assertTransmitAuthorized(
  region: Region,
  gateway: GatewayName,
  auth: TransmitAuthorization | undefined,
): void {
  if (!auth || typeof auth !== 'object') {
    throw new TransmitAuthorizationError(
      `Refusing to transmit to ${region.toUpperCase()} ${gateway}: no human authorization was supplied. ` +
        'Transmission is irreversible — the platform cannot un-send bytes to an agency — so it is ' +
        'reachable only from a caller that has verified a human, via the governed HTTP route ' +
        '(POST /api/mdx/gateways/:region/:gateway/transmit) or a Part 11 sequence signature.',
    );
  }

  if (auth.kind === 'governed-http') {
    if (!Number.isFinite(auth.actorUserId) || auth.actorUserId <= 0) {
      throw new TransmitAuthorizationError('Refusing to transmit: governed-http authorization names no actor.');
    }
    if (typeof auth.reason !== 'string' || auth.reason.trim().length < 8) {
      throw new TransmitAuthorizationError('Refusing to transmit: governed-http authorization carries no reason.');
    }
    if (!(auth.reauthVerifiedAt instanceof Date) || Number.isNaN(auth.reauthVerifiedAt.getTime())) {
      throw new TransmitAuthorizationError(
        'Refusing to transmit: governed-http authorization has no verified re-authentication time.',
      );
    }
    return;
  }

  if (auth.kind === 'governed-signature') {
    if (typeof auth.signatureActionId !== 'string' || auth.signatureActionId.trim() === '') {
      throw new TransmitAuthorizationError('Refusing to transmit: governed-signature authorization has no signature id.');
    }
    if (!Number.isFinite(auth.actorUserId) || auth.actorUserId <= 0) {
      throw new TransmitAuthorizationError('Refusing to transmit: governed-signature authorization names no actor.');
    }
    return;
  }

  throw new TransmitAuthorizationError(
    `Refusing to transmit: unrecognised authorization kind ${JSON.stringify((auth as { kind?: unknown }).kind)}.`,
  );
}

/**
 * Resolve the gateway implementation for (region, gateway).
 *
 * Returns the implementation behind a thin guard rather than the implementation
 * itself, so the authorization check cannot be skipped by any caller — every
 * one of them obtains its gateway here. `checkStatus` and
 * `downloadAcknowledgment` are read-only and pass straight through.
 */
export function getGateway(region: Region, gateway: GatewayName): SubmissionGateway {
  const key = `${region}:${gateway}`;
  const impl = REGISTRY[key];
  if (!impl) {
    throw new Error(`No gateway registered for ${key}`);
  }
  return {
    region: impl.region,
    gateway: impl.gateway,
    transport: impl.transport,
    isConfigured: (organizationId: number, environment: 'staging' | 'production') =>
      impl.isConfigured(organizationId, environment),
    // `async` deliberately: the guard must REJECT rather than throw
    // synchronously, so every caller sees one failure mode from a method whose
    // signature promises a Promise. A sync throw out of an async-shaped API
    // slips past `.catch()` handlers that are otherwise correct.
    transmit: async (req: GatewayTransmitRequest) => {
      assertTransmitAuthorized(impl.region, impl.gateway, req?.authorization);
      return impl.transmit(req);
    },
    checkStatus: (transmittalId: number) => impl.checkStatus(transmittalId),
    downloadAcknowledgment: (transmittalId: number) => impl.downloadAcknowledgment(transmittalId),
  };
}

/**
 * The unguarded implementation, for tests that drive a gateway directly.
 * Production code must use getGateway.
 */
export function getGatewayUnguarded(region: Region, gateway: GatewayName): SubmissionGateway {
  const impl = REGISTRY[`${region}:${gateway}`];
  if (!impl) throw new Error(`No gateway registered for ${region}:${gateway}`);
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
