/**
 * Runtime constants for the submission-gateway region and gateway unions.
 *
 * `Region` and `GatewayName` in ./types are compile-time only, so every runtime
 * consumer that needs to validate or advertise the set had to hand-maintain its
 * own copy. They drifted: the AnA tool DEFINITIONS advertised only
 * `fda|ema|pmda|ca` while their HANDLERS accepted all twelve regions and the
 * regional packager built Module 1 backbones for all twelve. The model was told
 * it could not do something the code fully supported.
 *
 * These arrays are the single runtime source of truth. The type-only import is
 * erased at build time, so this module stays dependency-free and is safe to
 * import from eagerly-loaded tool-definition modules.
 *
 * The assertions below fail to compile if a member is added to `Region` or
 * `GatewayName` without being added here, so the lists cannot silently fall
 * behind the types again.
 */

import type { Region, GatewayName } from './types';

/** Every region the gateway layer supports, in canonical order. */
export const ALL_REGIONS = [
  'fda', // US — FDA
  'ema', // EU — EMA / EUDAMED
  'pmda', // JP — PMDA
  'ca', // Canada — Health Canada
  'uk', // UK — MHRA
  'cn', // China — NMPA / CDE
  'au', // Australia — TGA
  'ch', // Switzerland — Swissmedic
  'br', // Brazil — ANVISA
  'in', // India — CDSCO / SUGAM
  'kr', // South Korea — MFDS / dBio
  'sg', // Singapore — HSA / PRISM
] as const satisfies readonly Region[];

/** Every named gateway transport, in canonical order. */
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

// Exhaustiveness: `satisfies` proves every listed member is a valid union member,
// but not the converse — that every union member is listed. `AssertNever` closes
// that direction: its parameter is constrained to `never`, so if `Exclude` leaves
// any union member unlisted, the argument is a real string literal, fails the
// constraint, and the build breaks with the missing member named in the error.
//
// Note the obvious-looking alternative does NOT work:
//   const _check: Exclude<Region, (typeof ALL_REGIONS)[number]>[] = [];
// an empty array satisfies `'sg'[]` just as happily as `never[]`, so it compiles
// clean while catching nothing.
type AssertNever<T extends never> = T;
type _RegionsExhaustive = AssertNever<Exclude<Region, (typeof ALL_REGIONS)[number]>>;
type _GatewaysExhaustive = AssertNever<Exclude<GatewayName, (typeof ALL_GATEWAY_NAMES)[number]>>;
export type { _RegionsExhaustive, _GatewaysExhaustive };
