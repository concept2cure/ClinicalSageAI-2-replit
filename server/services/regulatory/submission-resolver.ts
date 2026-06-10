/**
 * Multi-region submission resolver.
 *
 * The codebase already BUILDS and SUBMITS to FDA, EMA, and PMDA — region Module 1
 * backbones (regional-packager), region validation profiles (ectd-regional-rules),
 * and live gateways (fda-esg / ema-cesp / pmda-gateway). What was missing is a
 * single place that answers, for a given filing in a given region: which regional
 * application applies, what dossier standard + Module 1 + validation profile it
 * uses, and which gateway transmits it — and an assertion that every core filing
 * is supported in each region.
 *
 * This resolver composes the existing registry + gateways; it does not duplicate
 * the packager or the gateway implementations.
 *
 * @module server/services/regulatory/submission-resolver
 */

import type { Agency, ApplicationFamily, ProductClass, Region, DossierStandard, RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy';
import {
  getApplicationType,
  getByRegion,
  resolveFromLegacy,
  search,
} from '../../../shared/regulatory/global-document-registry';
import { listGateways, type GatewayName, type Region as GatewayRegion } from '../submission-gateways';

/** The three regions the build+submit stack has region-correct support for. */
export const CORE_REGIONS: Region[] = ['US', 'EU', 'JP'];

const AGENCY_GATEWAY: Partial<Record<Agency, { region: GatewayRegion; name: GatewayName }>> = {
  FDA: { region: 'fda', name: 'esg' },
  EMA: { region: 'ema', name: 'cesp' },
  PMDA: { region: 'pmda', name: 'pmda_gateway' },
};

const AGENCY_MODULE1: Partial<Record<Agency, string>> = {
  FDA: '/m1/us/us-regional.xml',
  EMA: '/m1/eu/eu-regional.xml',
  PMDA: '/m1/jp/jp-regional.xml',
};

export interface SubmissionPlanRegion {
  region: Region;
  agency: Agency;
  filing: {
    id: string;
    code: string;
    displayName: string;
    family: ApplicationFamily;
    dossierStandard: DossierStandard;
  } | null;
  module1Path: string | null;
  validationProfile: string | null;
  sectionBlueprint: string | null;
  taskBlueprint: string | null;
  gateway: { region: GatewayRegion; name: GatewayName } | null;
  /** A region-correct dossier can be assembled (region Module 1 backbone exists). */
  buildSupported: boolean;
  /** A configured gateway exists to transmit to this region. */
  submitSupported: boolean;
  notes: string[];
}

export interface SubmissionPlan {
  intent: {
    filingType: string | null;
    applicationFamily: ApplicationFamily;
    productClass: ProductClass;
    regions: Region[];
  };
  perRegion: SubmissionPlanRegion[];
  coverage: 'complete' | 'partial';
  gaps: string[];
  methodology: string[];
}

export interface ResolveInput {
  /** Legacy filing string (IND/NDA/BLA/MAA/JNDA/…) or a registry id. */
  filingType?: string;
  /** Override the family when no filingType is given. */
  applicationFamily?: ApplicationFamily;
  /** Drives the regional equivalent (e.g. biologic → US BLA, small_molecule → US NDA). */
  productClass?: ProductClass;
  /** Target regions (default US, EU, JP). */
  regions?: Region[];
}

const METHODOLOGY = [
  'The anchor filing resolves through the global document registry (resolveFromLegacy / id / synonym search).',
  'For each target region the regional equivalent is the registry entry matching the same applicationFamily and the product class (e.g. a biologic marketing application maps to US BLA, EU MAA, JP JNDA).',
  'Module 1 path + validation profile come from the regional packager / validation profiles; the gateway from the submission-gateways registry.',
  'buildSupported = a region Module 1 backbone exists (FDA/EMA/PMDA); submitSupported = a registered gateway exists for the agency.',
];

function availableGatewaySet(): Set<string> {
  return new Set(listGateways().map((g) => `${g.region}:${g.gateway}`));
}

function gatewayFor(entry: RegulatoryApplicationType): { region: GatewayRegion; name: GatewayName } | null {
  if (
    entry.agency === 'EMA' &&
    (entry.applicationFamily === 'device_approval' || entry.applicationFamily === 'device_clearance')
  ) {
    return { region: 'ema', name: 'eudamed' };
  }
  return AGENCY_GATEWAY[entry.agency] ?? null;
}

/** Pick the regional registry entry matching a family + product class. */
export function pickRegionalEntry(
  region: Region,
  family: ApplicationFamily,
  productClass: ProductClass,
): RegulatoryApplicationType | undefined {
  const candidates = getByRegion(region).filter((e) => e.applicationFamily === family);
  if (candidates.length === 0) return undefined;
  // Prefer an exact product-class match, then 'any', then anything.
  const exact = candidates.find((e) => e.productClass.includes(productClass));
  if (exact) return exact;
  const generic = candidates.find((e) => e.productClass.includes('any'));
  return generic ?? candidates[0];
}

function anchorEntry(input: ResolveInput): RegulatoryApplicationType | undefined {
  if (input.filingType) {
    return (
      resolveFromLegacy(input.filingType) ||
      getApplicationType(input.filingType) ||
      search(input.filingType)[0]
    );
  }
  return undefined;
}

export function resolveSubmissionPlan(input: ResolveInput): SubmissionPlan {
  const anchor = anchorEntry(input);
  const family: ApplicationFamily = anchor?.applicationFamily ?? input.applicationFamily ?? 'marketing_authorization';
  // Infer product class from the anchor if it is specific; else from input; else 'any'.
  const anchorClass = anchor?.productClass.find((c) => c !== 'any');
  const productClass: ProductClass = input.productClass ?? anchorClass ?? 'any';
  const regions = input.regions && input.regions.length ? input.regions : CORE_REGIONS;
  const gateways = availableGatewaySet();

  const perRegion: SubmissionPlanRegion[] = regions.map((region) => {
    const entry = pickRegionalEntry(region, family, productClass);
    const notes: string[] = [];
    if (!entry) {
      notes.push(`No ${family} application registered for ${region}.`);
      return {
        region,
        agency: 'ICH' as Agency,
        filing: null,
        module1Path: null,
        validationProfile: null,
        sectionBlueprint: null,
        taskBlueprint: null,
        gateway: null,
        buildSupported: false,
        submitSupported: false,
        notes,
      };
    }
    const gw = gatewayFor(entry);
    const buildSupported = AGENCY_MODULE1[entry.agency] != null;
    const submitSupported = gw != null && gateways.has(`${gw.region}:${gw.name}`);
    if (!buildSupported) notes.push(`No region Module 1 backbone for ${entry.agency}; build uses the common CTD layout.`);
    if (!submitSupported) notes.push(`No registered gateway for ${entry.agency}.`);
    return {
      region,
      agency: entry.agency,
      filing: {
        id: entry.id,
        code: entry.applicationType,
        displayName: entry.displayName,
        family: entry.applicationFamily,
        dossierStandard: entry.dossierStandard,
      },
      module1Path: AGENCY_MODULE1[entry.agency] ?? null,
      validationProfile: entry.validationProfile,
      sectionBlueprint: entry.defaultSectionBlueprint,
      taskBlueprint: entry.defaultTaskBlueprint,
      gateway: gw,
      buildSupported,
      submitSupported,
      notes,
    };
  });

  const gaps: string[] = [];
  for (const r of perRegion) {
    if (!r.filing) gaps.push(`${r.region}: no ${family} application`);
    else if (!r.buildSupported) gaps.push(`${r.region}: build not region-correct`);
    else if (!r.submitSupported) gaps.push(`${r.region}: no gateway`);
  }
  const coverage = gaps.length === 0 ? 'complete' : 'partial';

  return {
    intent: { filingType: input.filingType ?? null, applicationFamily: family, productClass, regions },
    perRegion,
    coverage,
    gaps,
    methodology: METHODOLOGY,
  };
}

export interface CoverageCell {
  region: Region;
  agency: Agency | null;
  filingId: string | null;
  filingCode: string | null;
  buildSupported: boolean;
  submitSupported: boolean;
}

export interface CoverageMatrix {
  regions: Region[];
  families: ApplicationFamily[];
  productClasses: ProductClass[];
  rows: Array<{
    family: ApplicationFamily;
    productClass: ProductClass;
    cells: CoverageCell[];
    fullyCovered: boolean;
  }>;
  summary: string;
}

/**
 * Prove "all our filings support each region": for the core biopharma filing
 * families × product classes × {US, EU, JP}, report whether each can be built
 * region-correct and submitted to its gateway.
 */
export function submissionCoverageMatrix(
  regions: Region[] = CORE_REGIONS,
  families: ApplicationFamily[] = ['clinical_trial', 'marketing_authorization'],
  productClasses: ProductClass[] = ['small_molecule', 'biologic'],
): CoverageMatrix {
  const gateways = availableGatewaySet();
  let coveredCount = 0;
  let total = 0;

  const rows = families.flatMap((family) =>
    productClasses.map((productClass) => {
      const cells: CoverageCell[] = regions.map((region) => {
        const entry = pickRegionalEntry(region, family, productClass);
        if (!entry) {
          total += 1;
          return { region, agency: null, filingId: null, filingCode: null, buildSupported: false, submitSupported: false };
        }
        const gw = gatewayFor(entry);
        const buildSupported = AGENCY_MODULE1[entry.agency] != null;
        const submitSupported = gw != null && gateways.has(`${gw.region}:${gw.name}`);
        total += 1;
        if (buildSupported && submitSupported) coveredCount += 1;
        return {
          region,
          agency: entry.agency,
          filingId: entry.id,
          filingCode: entry.applicationType,
          buildSupported,
          submitSupported,
        };
      });
      const fullyCovered = cells.every((c) => c.buildSupported && c.submitSupported);
      return { family, productClass, cells, fullyCovered };
    }),
  );

  return {
    regions,
    families,
    productClasses,
    rows,
    summary: `${coveredCount}/${total} (filing × region) combinations support both region-correct build and gateway submission.`,
  };
}
