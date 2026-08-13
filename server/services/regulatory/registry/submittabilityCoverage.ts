/**
 * Submittability coverage — can a filing type actually reach an agency?
 *
 * ── The half that was not measured ────────────────────────────────────────────
 * `registryCoverage` answers the AUTHORING question: does this filing type have a
 * real section blueprint, a real task plan, and the forms it requires? Its
 * readiness tiers (`production_ready` / `buildable` / `catalog_only`) are
 * computed entirely from those three inputs.
 *
 * That is the front half of "project initiation → submission". It says nothing
 * about the back half: whether the thing you authored can be PACKAGED into a
 * regional bundle, VALIDATED, and TRANSMITTED to a gateway. A filing type can be
 * `production_ready` by the authoring definition and have no path off the
 * platform at all.
 *
 * Today the back half happens to be complete — every registry region except
 * GLOBAL resolves through `region-identity` to a registered gateway pair. That
 * is the point. It holds by diligence, and nothing asserts it keeps holding: add
 * a region to `GLOBAL_REGISTRY` and its filing types become selectable at project
 * initiation immediately, with no gateway, and no test notices. The customer
 * discovers it at the end of a submission.
 *
 * This module makes the back half measurable on the same terms as the front, so
 * the two can be reported together and gated together.
 *
 * ── Why GLOBAL is not a gap ───────────────────────────────────────────────────
 * The 22 `GLOBAL` (ICH) entries are document COMPONENTS — CSR, protocol, IB,
 * ICF, SAP, the CTD module definitions, QMS manuals — not filings. They are
 * authored into a regional dossier and travel inside it. A DSUR reaches FDA
 * inside an IND sequence over ESG; it has no gateway of its own and should not.
 * They are classified `not_a_filing` rather than counted as failures, because a
 * coverage number that treats them as gaps is a number people learn to ignore.
 *
 * Pure and synchronous — static catalogs only, no DB — so it backs both a CI gate
 * and an operator report, exactly like `registryCoverage`.
 *
 * @module server/services/regulatory/registry/submittabilityCoverage
 */

import { GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry.js';
import {
  REGION_IDENTITY,
  type CanonicalRegion,
} from '../../../../shared/regulatory/region-identity.js';
import { listGateways } from '../../submission-gateways/index.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  Segment,
} from '../../../../shared/regulatory/document-taxonomy.js';

/**
 * Why a filing type can or cannot be transmitted.
 *
 *  `submittable`    — resolves to a registered (gatewaySlug, defaultGateway) pair.
 *  `not_a_filing`   — a document component, not something filed on its own.
 *  `no_identity`    — the region has no `region-identity` entry, so nothing can
 *                     map it to a gateway, a rules region, or an M1 backbone.
 *  `no_gateway`     — identity exists but names a gateway that is not registered.
 */
export type SubmittabilityTier = 'submittable' | 'not_a_filing' | 'no_identity' | 'no_gateway';

export interface SubmittabilityCoverage {
  id: string;
  displayName: string;
  region: Region;
  agency: Agency;
  segment?: Segment;
  /** Gateway registry slug the region maps to, e.g. 'fda'. */
  gatewaySlug?: string;
  /** Gateway the region defaults to, e.g. 'esg'. */
  defaultGateway?: string;
  /** The (slug, gateway) pair is present in the gateway registry. */
  gatewayRegistered: boolean;
  /** A regional M1 backbone is declared for the region. */
  hasM1Backbone: boolean;
  tier: SubmittabilityTier;
}

/**
 * Application families that are document components rather than filings.
 *
 * Deliberately keyed on FAMILY, not on a list of ids: a new ICH clinical
 * document added next year should classify correctly without anyone remembering
 * to extend a hardcoded set — the same reasoning that made the tenant export
 * catalog-driven rather than hand-listed.
 */
const NON_FILING_FAMILIES = new Set([
  'clinical_document',
  'dossier_module',
  'quality_system',
  'software_documentation',
]);

/**
 * `quality_cmc` and `safety_report` are ambiguous: an ICH QOS is a component,
 * but a regional safety report IS filed. Region decides — a GLOBAL/ICH entry in
 * these families is a component; a regional one is a filing.
 */
const REGION_DEPENDENT_FAMILIES = new Set(['quality_cmc', 'safety_report']);

function isNonFiling(entry: RegulatoryApplicationType): boolean {
  const family = String(entry.applicationFamily);
  if (NON_FILING_FAMILIES.has(family)) return true;
  if (REGION_DEPENDENT_FAMILIES.has(family) && entry.region === 'GLOBAL') return true;
  return false;
}

/** The registered (slug, gateway) pairs, read once per call. */
function registeredGatewayPairs(): Set<string> {
  return new Set(listGateways().map((g) => `${g.region}:${g.gateway}`));
}

/** Submittability for one registry entry. */
export function getSubmittability(
  entry: RegulatoryApplicationType,
  pairs: Set<string> = registeredGatewayPairs()
): SubmittabilityCoverage {
  const identity = (REGION_IDENTITY as Record<string, any>)[entry.region as CanonicalRegion];
  const gatewaySlug: string | undefined = identity?.gatewaySlug;
  const defaultGateway: string | undefined = identity?.defaultGateway;
  const gatewayRegistered = Boolean(
    gatewaySlug && defaultGateway && pairs.has(`${gatewaySlug}:${defaultGateway}`)
  );

  const base = {
    id: entry.id,
    displayName: entry.displayName,
    region: entry.region,
    agency: entry.agency,
    segment: entry.segment,
    gatewaySlug,
    defaultGateway,
    gatewayRegistered,
    hasM1Backbone: Boolean(identity?.m1Backbone),
  };

  // Component-vs-filing is decided FIRST. A CSR has no gateway and that is
  // correct, not a gap; reporting it as one trains people to ignore the number.
  if (isNonFiling(entry)) return { ...base, tier: 'not_a_filing' };
  if (!identity) return { ...base, tier: 'no_identity' };
  if (!gatewayRegistered) return { ...base, tier: 'no_gateway' };
  return { ...base, tier: 'submittable' };
}

export interface SubmittabilityReport {
  total: number;
  byTier: Record<SubmittabilityTier, number>;
  /** Entries that SHOULD be submittable but are not — the actionable list. */
  gaps: SubmittabilityCoverage[];
  /** Region-level rollup, which is where a gap is actually fixed. */
  byRegion: Array<{
    region: Region;
    filings: number;
    components: number;
    submittable: number;
    gatewaySlug?: string;
    defaultGateway?: string;
    reachable: boolean;
  }>;
}

export function computeSubmittability(): SubmittabilityCoverage[] {
  const pairs = registeredGatewayPairs();
  return GLOBAL_REGISTRY.map((entry) => getSubmittability(entry, pairs));
}

export function buildSubmittabilityReport(): SubmittabilityReport {
  const all = computeSubmittability();
  const byTier: Record<SubmittabilityTier, number> = {
    submittable: 0,
    not_a_filing: 0,
    no_identity: 0,
    no_gateway: 0,
  };
  for (const c of all) byTier[c.tier] += 1;

  const regions = [...new Set(all.map((c) => c.region))];
  const byRegion = regions.map((region) => {
    const inRegion = all.filter((c) => c.region === region);
    const components = inRegion.filter((c) => c.tier === 'not_a_filing').length;
    const submittable = inRegion.filter((c) => c.tier === 'submittable').length;
    const sample = inRegion[0];
    return {
      region,
      filings: inRegion.length - components,
      components,
      submittable,
      gatewaySlug: sample?.gatewaySlug,
      defaultGateway: sample?.defaultGateway,
      reachable: inRegion.length - components === 0 || submittable > 0,
    };
  });

  return {
    total: all.length,
    byTier,
    gaps: all.filter((c) => c.tier === 'no_identity' || c.tier === 'no_gateway'),
    byRegion,
  };
}

/**
 * The gate. Returns the filing types that a customer could select at project
 * initiation and then be unable to submit.
 *
 * Empty is the required state. A non-empty result means someone added filing
 * types for a region without wiring its identity or its gateway, and the failure
 * would otherwise surface to the customer at the end of a submission rather than
 * to us at the start of a pull request.
 */
export function getUnsubmittableFilings(): SubmittabilityCoverage[] {
  return computeSubmittability().filter(
    (c) => c.tier === 'no_identity' || c.tier === 'no_gateway'
  );
}
