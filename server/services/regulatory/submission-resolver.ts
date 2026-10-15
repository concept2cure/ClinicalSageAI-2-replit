/**
 * Multi-region submission resolver.
 *
 * The codebase BUILDS region-correct dossiers for FDA, EMA, and PMDA — region
 * Module 1 backbones (regional-packager) and region validation profiles
 * (ectd-regional-rules) — and transmits through the registered gateways
 * (fda-esg / pmda-gateway; ema-cesp for EU national, MRP and DCP procedures).
 * This resolver answers, for a given filing in a given region: which regional
 * application applies, what dossier standard + Module 1 + validation profile it
 * uses, and which channel carries it — and reports, cell by cell, where build or
 * submit is not supported.
 *
 * It does not decide channels. `submissionChannelFor`
 * (server/services/regulatory/registry/submittabilityCoverage.ts) is the one
 * channel function; this file only reads it. A centralised EMA filing is
 * therefore build-only here (eSubmission Gateway / Web Client, no connector),
 * and an EU CTA goes to the CTIS portal — never CESP.
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
import { REGION_IDENTITY } from '../../../shared/regulatory/region-identity';
import { submissionChannelFor, type SubmissionChannel } from './registry/submittabilityCoverage';
import { channelSupportFor, module1StatementForAgency } from './market-support';

/** The three regions the build+submit stack has region-correct support for. */
export const CORE_REGIONS: Region[] = ['US', 'EU', 'JP'];

// Module 1 backbone comes from the canonical region-identity registry — no
// hand-typed paths. The KEYS pin the agencies this resolver has region-correct
// build+submit support for today (US/EU/JP); the VALUES are the single source of
// truth. The channel for a filing is NOT read from here or from the region — it
// comes from `submissionChannelFor`, the one channel function.
const AGENCY_MODULE1: Partial<Record<Agency, string>> = {
  FDA:  `/${REGION_IDENTITY.US.m1Backbone}`,
  EMA:  `/${REGION_IDENTITY.EU.m1Backbone}`,
  PMDA: `/${REGION_IDENTITY.JP.m1Backbone}`,
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
  /**
   * The channel `submissionChannelFor` names for this filing — a gateway pair, a
   * portal (CTIS), or an `unconnected` agency channel such as the EMA eSubmission
   * Gateway / Web Client. Null when no filing resolved or the agency is outside
   * this resolver's scope.
   */
  channel: SubmissionChannel | null;
  /** A region-correct dossier can be assembled: Module 1 built to the agency's own headings (market-support.ts). */
  buildSupported: boolean;
  /** A configured gateway exists to transmit to this region, and its adapter does not refuse. */
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
  'The channel comes from submissionChannelFor (submittabilityCoverage): a centralised-procedure EMA eCTD filing (MAA, variation, renewal, PSUR/RMP, ASMF) is unconnected (EMA eSubmission Gateway / Web Client — CESP is not accepted for it, and there is no connector); orphan designation, scientific advice, PIP and PRIME requests are unconnected (EMA IRIS); any other EMA filing is unconnected with its channel not modelled; a CTIS filing is portal-only; otherwise the registered gateway.',
  'buildSupported = Module 1 is built to the agency\'s own headings (market-support.ts; today FDA only — EMA and PMDA are filed flat); submitSupported = the channel is a registered gateway whose adapter does not refuse.',
];

function availableGatewaySet(): Set<string> {
  return new Set(listGateways().map((g) => `${g.region}:${g.gateway}`));
}

interface ResolvedChannel {
  channel: SubmissionChannel | null;
  gateway: { region: GatewayRegion; name: GatewayName } | null;
  submitSupported: boolean;
  /** Why it cannot be submitted from here, naming where it goes instead. Null when it can. */
  note: string | null;
}

/** The plan-level gap for a filing that cannot be submitted, naming its channel. */
function channelGap(channel: SubmissionChannel | null): string {
  if (channel?.kind === 'portal') return `portal-only (${channel.channel})`;
  if (channel?.kind === 'unconnected') return `not connected (${channel.channel})`;
  return 'no gateway';
}

function planGap(r: SubmissionPlanRegion, family: ApplicationFamily): string | null {
  if (!r.filing) return `${r.region}: no ${family} application`;
  if (!r.buildSupported) return `${r.region}: build not region-correct`;
  if (!r.submitSupported) return `${r.region}: ${channelGap(r.channel)}`;
  return null;
}

/**
 * Reads the one channel function. Agencies outside this resolver's region-correct
 * scope (no AGENCY_MODULE1 backbone) get no channel claim at all — fail closed,
 * as before — rather than inheriting a region default the resolver cannot vouch for.
 */
function channelFor(entry: RegulatoryApplicationType, gateways: Set<string>): ResolvedChannel {
  if (AGENCY_MODULE1[entry.agency] == null) {
    return {
      channel: null,
      gateway: null,
      submitSupported: false,
      note: `${entry.agency} is outside this resolver's region-correct scope (FDA, EMA, PMDA); no submission channel is claimed.`,
    };
  }
  const channel = submissionChannelFor(entry);
  if (channel.kind === 'portal') {
    return {
      channel,
      gateway: null,
      submitSupported: false,
      note: `Submitted through ${channel.channel} — a portal, not a gateway. The platform builds the content; the applicant submits it there.`,
    };
  }
  if (channel.kind === 'unconnected') {
    return {
      channel,
      gateway: null,
      submitSupported: false,
      note: `Not connected: ${channel.channel}. ${channel.reason}. ${channel.applicantStep}`,
    };
  }
  if (channel.kind === 'none') {
    return { channel, gateway: null, submitSupported: false, note: `No registered gateway for ${entry.agency}.` };
  }
  const gateway = { region: channel.region, name: channel.name };
  /* A registered gateway whose adapter refuses every transmit (PMDA) is not a
     way to submit: market-support.ts judges the channel against the adapters'
     own refusals (FILING_SPINE.md F19). */
  const judged = channelSupportFor(entry);
  if (judged.state === 'refused') {
    return { channel, gateway, submitSupported: false, note: `Not sent: ${judged.detail}` };
  }
  const submitSupported = gateways.has(`${gateway.region}:${gateway.name}`);
  return {
    channel,
    gateway,
    submitSupported,
    note: submitSupported ? null : `No registered gateway for ${entry.agency}.`,
  };
}

/** Region-correct build: Module 1 built to the agency's own headings
 *  (market-support.ts, FILING_SPINE.md F19). A backbone file name is not that:
 *  EMA's and PMDA's Module 1 leaves are filed flat. */
function buildSupportFor(agency: string): { buildSupported: boolean; note: string | null } {
  const m1 = module1StatementForAgency(agency);
  if (m1?.shape === 'structured') return { buildSupported: true, note: null };
  return {
    buildSupported: false,
    note: m1 ? `Build not region-correct for ${agency}: ${m1.detail}.` : `No region Module 1 backbone for ${agency}.`,
  };
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
        channel: null,
        buildSupported: false,
        submitSupported: false,
        notes,
      };
    }
    const ch = channelFor(entry, gateways);
    const { buildSupported, note: buildNote } = buildSupportFor(entry.agency);
    const submitSupported = ch.submitSupported;
    if (buildNote) notes.push(buildNote);
    if (ch.note) notes.push(ch.note);
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
      gateway: ch.gateway,
      channel: ch.channel,
      buildSupported,
      submitSupported,
      notes,
    };
  });

  const gaps = perRegion.map((r) => planGap(r, family)).filter((g): g is string => g != null);
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
 * For the core biopharma filing families × product classes × {US, EU, JP},
 * report whether each can be built region-correct and submitted to its gateway.
 * EU cells are build-only today: a centralised MAA's channel (eSubmission
 * Gateway / Web Client) has no connector, and an EU CTA goes to the CTIS portal.
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
        const { buildSupported } = buildSupportFor(entry.agency);
        const submitSupported = channelFor(entry, gateways).submitSupported;
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
