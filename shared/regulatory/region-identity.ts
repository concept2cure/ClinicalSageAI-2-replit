/**
 * Region identity — the single source of truth that reconciles the platform's
 * FOUR parallel "region/agency" vocabularies.
 *
 * Before this file, the same jurisdiction was named four different ways and code
 * translated between them with ad-hoc tables scattered across services:
 *
 *   • taxonomy `Region`        — 'US' | 'EU' | 'JP' …      (document-taxonomy, region-profiles, the 158-type registry)
 *   • gateway `Region`         — 'fda' | 'ema' | 'pmda' …  (submission-gateways — an agency slug, NOT a country code)
 *   • `RegulatoryMarket`       — 'FDA' | 'EMA' | 'PMDA' …  (regional-module1-requirements — agency name, 7 only)
 *   • `RuleRegion`             — 'ich' | 'fda' | 'eu' …    (validation-rule-corpus — a validation-framework code)
 *
 * This module makes the taxonomy `Region` (the most widely used) the canonical
 * key and provides explicit, single-source converters to the other three, plus
 * the agency, the default gateway, and the Module 1 regional backbone path. Adopt
 * its converters instead of hand-writing another mapping table.
 *
 * Every mapping here is verified against the existing vocabularies (see
 * tests/regulatory/region-identity.test.ts). Pure, no DB.
 *
 * @module shared/regulatory/region-identity
 */

import type { Region, Agency } from './document-taxonomy.js';

/** The 12 concrete jurisdictions the platform supports (taxonomy `Region` minus GLOBAL). */
export type CanonicalRegion =
  | 'US' | 'EU' | 'JP' | 'CA' | 'CN' | 'KR'
  | 'UK' | 'AU' | 'CH' | 'BR' | 'IN' | 'SG';

/** Agency-slug used by the submission-gateways registry (lowercase). */
export type GatewaySlug =
  | 'fda' | 'ema' | 'pmda' | 'ca' | 'cn' | 'kr'
  | 'uk' | 'au' | 'ch' | 'br' | 'in' | 'sg';

/** Default gateway implementation name per region (the submission-gateways `GatewayName`). */
export type DefaultGatewayName =
  | 'esg' | 'cesp' | 'pmda_gateway' | 'hc_cesg' | 'mhra_gateway' | 'nmpa_gateway'
  | 'tga_ebs' | 'swissmedic_egateway' | 'anvisa_gateway' | 'cdsco_sugam'
  | 'mfds_dbio' | 'hsa_prism';

/** Agency-name market key used by the Module 1 requirements registry (7 of 12). */
export type RegulatoryMarketName =
  | 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA' | 'MHRA' | 'TGA' | 'NMPA';

/** Validation-framework code used by the validation rule corpus (subset; 'ich' is cross-region). */
export type RuleRegionCode = 'fda' | 'eu' | 'jp' | 'ca' | 'au' | 'ch';

export interface RegionIdentity {
  /** Canonical key. */
  code: CanonicalRegion;
  /** Agency as named in region-profiles / the document taxonomy. */
  agency: Agency;
  /** Gateway registry region slug. */
  gatewaySlug: GatewaySlug;
  /** Default gateway implementation for the region. */
  defaultGateway: DefaultGatewayName;
  /** Module 1 requirements market key, when this region has a checklist (7 of 12). */
  market?: RegulatoryMarketName;
  /** Validation-corpus rule region, when this region has region-specific rules (6 of 12). */
  ruleRegion?: RuleRegionCode;
  /** Module 1 regional backbone path, relative (no leading slash): `m1/<code>/<code>-regional.xml`. */
  m1Backbone: string;
}

function m1(code: CanonicalRegion): string {
  const lower = code.toLowerCase();
  return `m1/${lower}/${lower}-regional.xml`;
}

export const REGION_IDENTITY: Record<CanonicalRegion, RegionIdentity> = {
  US: { code: 'US', agency: 'FDA',           gatewaySlug: 'fda',  defaultGateway: 'esg',                market: 'FDA',           ruleRegion: 'fda', m1Backbone: m1('US') },
  EU: { code: 'EU', agency: 'EMA',           gatewaySlug: 'ema',  defaultGateway: 'cesp',               market: 'EMA',           ruleRegion: 'eu',  m1Backbone: m1('EU') },
  JP: { code: 'JP', agency: 'PMDA',          gatewaySlug: 'pmda', defaultGateway: 'pmda_gateway',       market: 'PMDA',          ruleRegion: 'jp',  m1Backbone: m1('JP') },
  CA: { code: 'CA', agency: 'Health_Canada', gatewaySlug: 'ca',   defaultGateway: 'hc_cesg',            market: 'HEALTH_CANADA', ruleRegion: 'ca',  m1Backbone: m1('CA') },
  UK: { code: 'UK', agency: 'MHRA',          gatewaySlug: 'uk',   defaultGateway: 'mhra_gateway',       market: 'MHRA',                             m1Backbone: m1('UK') },
  CN: { code: 'CN', agency: 'NMPA',          gatewaySlug: 'cn',   defaultGateway: 'nmpa_gateway',       market: 'NMPA',                             m1Backbone: m1('CN') },
  AU: { code: 'AU', agency: 'TGA',           gatewaySlug: 'au',   defaultGateway: 'tga_ebs',            market: 'TGA',           ruleRegion: 'au',  m1Backbone: m1('AU') },
  CH: { code: 'CH', agency: 'Swissmedic',    gatewaySlug: 'ch',   defaultGateway: 'swissmedic_egateway',                        ruleRegion: 'ch',  m1Backbone: m1('CH') },
  BR: { code: 'BR', agency: 'ANVISA',        gatewaySlug: 'br',   defaultGateway: 'anvisa_gateway',                                                m1Backbone: m1('BR') },
  IN: { code: 'IN', agency: 'CDSCO',         gatewaySlug: 'in',   defaultGateway: 'cdsco_sugam',                                                   m1Backbone: m1('IN') },
  KR: { code: 'KR', agency: 'MFDS',          gatewaySlug: 'kr',   defaultGateway: 'mfds_dbio',                                                     m1Backbone: m1('KR') },
  SG: { code: 'SG', agency: 'HSA',           gatewaySlug: 'sg',   defaultGateway: 'hsa_prism',                                                     m1Backbone: m1('SG') },
};

/** True when a string is one of the 12 canonical region codes. */
export function isCanonicalRegion(code: string): code is CanonicalRegion {
  return Object.prototype.hasOwnProperty.call(REGION_IDENTITY, code);
}

/** The full identity for a region code, or undefined when unknown / GLOBAL. */
export function getRegionIdentity(code: string): RegionIdentity | undefined {
  return isCanonicalRegion(code) ? REGION_IDENTITY[code] : undefined;
}

/** Canonical region → gateway registry slug ('US' → 'fda'). */
export function toGatewaySlug(code: string): GatewaySlug | undefined {
  return getRegionIdentity(code)?.gatewaySlug;
}

/** Canonical region → agency name ('US' → 'FDA'). */
export function toAgency(code: string): Agency | undefined {
  return getRegionIdentity(code)?.agency;
}

/** Canonical region → Module 1 requirements market key, when present. */
export function toMarket(code: string): RegulatoryMarketName | undefined {
  return getRegionIdentity(code)?.market;
}

/** Canonical region → validation-corpus rule region, when present. */
export function toRuleRegion(code: string): RuleRegionCode | undefined {
  return getRegionIdentity(code)?.ruleRegion;
}

/** Canonical region → Module 1 regional backbone path (relative, no leading slash). */
export function m1BackbonePath(code: string): string | undefined {
  return getRegionIdentity(code)?.m1Backbone;
}

/** Reverse lookup: agency name → canonical region ('FDA' → 'US'). */
export function regionForAgency(agency: string): CanonicalRegion | undefined {
  for (const id of Object.values(REGION_IDENTITY)) {
    if (id.agency === agency) return id.code;
  }
  return undefined;
}

/** Reverse lookup: gateway slug → canonical region ('fda' → 'US'). */
export function regionForGatewaySlug(slug: string): CanonicalRegion | undefined {
  for (const id of Object.values(REGION_IDENTITY)) {
    if (id.gatewaySlug === slug) return id.code;
  }
  return undefined;
}

/** Every canonical region code, in registry order. */
export function listCanonicalRegions(): CanonicalRegion[] {
  return Object.keys(REGION_IDENTITY) as CanonicalRegion[];
}

export default {
  REGION_IDENTITY,
  getRegionIdentity,
  isCanonicalRegion,
  toGatewaySlug,
  toAgency,
  toMarket,
  toRuleRegion,
  m1BackbonePath,
  regionForAgency,
  regionForGatewaySlug,
  listCanonicalRegions,
};
