/**
 * Region + gateway taxonomy — the RUNTIME half of the `Region` and
 * `GatewayName` union types.
 *
 * THE DEFECT THIS CLOSES. `Region` names twelve regions and `GatewayName`
 * thirteen gateways, and the registry in ./index.ts binds a real gateway
 * implementation to all thirteen region:gateway pairs. But the two AnA tools
 * that reach them — `package_ectd_for_region` and `transmit_submission` —
 * advertised `enum: ['fda','ema','pmda','ca']` and five gateway names in their
 * input schemas. A model can only call a tool with a value the schema admits,
 * so MHRA, NMPA, TGA, Swissmedic, ANVISA, CDSCO, MFDS and HSA were shipped,
 * registered, reachable from the HTTP routes — and unreachable through AnA.
 * The handlers themselves already accepted all twelve, in two hand-maintained
 * inline arrays that had drifted from the advertised schema in exactly the way
 * a second copy always does.
 *
 * So: ONE source of truth, consumed by the tool definitions and by the
 * handlers, with a compile-time proof that it enumerates the unions completely
 * and a test (../ana/__tests__/gateway-region-enum-parity.test.ts) binding the
 * advertised enums to it so the two cannot drift again.
 *
 * This module deliberately has NO runtime imports — only `import type` — so it
 * can be imported by tool definitions, handlers and tests without pulling in
 * the gateway implementations (./index.ts imports all twelve of them).
 *
 * NOTE ON CONFORMANCE. Being listed here means a gateway is bound and the
 * packager will build a bundle for the region. It does NOT mean the region's
 * Module 1 backbone is agency-conformant — see ../ectd/regional-backbone-readiness.ts,
 * which classifies each region honestly and stamps the result on the bundle.
 * Advertising the region and stating its conformance are separate jobs; this
 * module does the first and must not be read as doing the second.
 *
 * @module server/services/submission-gateways/region-constants
 */

import type { GatewayName, Region } from './types';

/**
 * `true` when `Listed` covers every member of `Union`. When a member is added
 * to the union and not to the list, this resolves to a tuple naming the
 * missing member instead of `true`, and the assignment below stops compiling.
 */
type Exhaustive<Union, Listed extends Union> = [Exclude<Union, Listed>] extends [never]
  ? true
  : ['MISSING FROM LIST', Exclude<Union, Listed>];

/** Every region the gateway layer knows, in registry order. */
export const ALL_REGIONS = [
  'fda',
  'ema',
  'pmda',
  'ca',
  'uk',
  'cn',
  'au',
  'ch',
  'br',
  'in',
  'kr',
  'sg',
] as const satisfies readonly Region[];

/** Every gateway the registry binds, in registry order. */
export const ALL_GATEWAY_NAMES = [
  'esg',
  'cesp',
  'eudamed',
  'pmda_gateway',
  'hc_cesg',
  'mhra_gateway',
  'nmpa_gateway',
  'tga_ebs',
  'swissmedic_egateway',
  'anvisa_gateway',
  'cdsco_sugam',
  'mfds_dbio',
  'hsa_prism',
] as const satisfies readonly GatewayName[];

/**
 * Compile-time proof that the two arrays above are COMPLETE. `as const
 * satisfies readonly Region[]` only proves every listed value is a Region; it
 * says nothing about a Region that was never listed. These do.
 */
export const REGIONS_EXHAUSTIVE: Exhaustive<Region, (typeof ALL_REGIONS)[number]> = true;
export const GATEWAY_NAMES_EXHAUSTIVE: Exhaustive<
  GatewayName,
  (typeof ALL_GATEWAY_NAMES)[number]
> = true;

/**
 * The agency behind each region, for tool descriptions and user-facing copy.
 * Tool selection ranks on description text, so a region the description never
 * names is effectively unselectable even once its enum admits it.
 */
export const REGION_AGENCY: Readonly<Record<Region, string>> = {
  fda: 'FDA (United States)',
  ema: 'EMA / EUDAMED (European Union)',
  pmda: 'PMDA (Japan)',
  ca: 'Health Canada',
  uk: 'MHRA (United Kingdom)',
  cn: 'NMPA / CDE (China)',
  au: 'TGA (Australia)',
  ch: 'Swissmedic (Switzerland)',
  br: 'ANVISA (Brazil)',
  in: 'CDSCO / SUGAM (India)',
  kr: 'MFDS (South Korea)',
  sg: 'HSA (Singapore)',
};

/** `true` when `value` is a region the gateway layer knows. */
export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && (ALL_REGIONS as readonly string[]).includes(value);
}

/** `true` when `value` is a gateway the registry binds. */
export function isGatewayName(value: unknown): value is GatewayName {
  return typeof value === 'string' && (ALL_GATEWAY_NAMES as readonly string[]).includes(value);
}

/** "fda / ema / pmda / …" — the shape the handlers' refusal messages use. */
export function regionList(): string {
  return ALL_REGIONS.join(' / ');
}

/** "esg / cesp / eudamed / …" — the shape the handlers' refusal messages use. */
export function gatewayList(): string {
  return ALL_GATEWAY_NAMES.join(' / ');
}

/** "FDA (United States), EMA / EUDAMED (European Union), …" — for descriptions. */
export function agencyList(): string {
  return ALL_REGIONS.map((r) => REGION_AGENCY[r]).join(', ');
}
