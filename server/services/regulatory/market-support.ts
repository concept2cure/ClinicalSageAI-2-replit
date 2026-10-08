/**
 * What the platform can carry for one market (docs/design/FILING_SPINE.md F19).
 *
 * A market is one agency and one application type. Whether the platform can
 * build and send a filing for it was decided in four places that never met,
 * and the submission resolver read none of them: it called a market
 * "buildable" whenever a Module 1 backbone file name existed, so EMA and PMDA
 * read buildable while their Module 1 is filed flat. Nothing on screen said
 * what a market cannot do.
 *
 * This module composes the four into one statement:
 *   1. the rule pack — is there a governed outline for (doc_type, agency)?
 *      (c2c_rule_packs through rule-pack-lookup.ts; the class through
 *      document-class.ts, so an unmapped agency is refused as at creation);
 *   2. the regional backbone — is Module 1 built to the agency's own headings,
 *      filed flat, or another region's placeholder?
 *      (module1ShapeOf, regional-backbone-readiness.ts);
 *   3. the region profile — does the gate check this region's Module 1?
 *      (getSubmissionRegionProfile, region-profile-service.ts);
 *   4. the channel — is there a way to send it, and does its adapter refuse?
 *      (submissionChannelFor, submittabilityCoverage.ts, judged here against
 *      the adapters' own refusals, transport-refusals.ts).
 *
 * No model writes any part of it. Every sentence comes from a fixed source, so
 * the market rows, the New submission options, the New project picker and the
 * resolver give one answer.
 *
 * Pure apart from `readMarketSupport`, which reads the active packs once.
 */
import {
  AGENCY_FALLBACKS,
  AGENCY_TO_CODE,
  PROGRAM_TO_DOC_TYPE,
  describeUnmappedClass,
} from '../c2c/document-class.js';
import { workstreamForFilingType } from '../../../shared/constants/domain/product-types.js';
import { listActiveRulePacks, type RulePackQueryable } from '../c2c/rule-pack-lookup.js';
import { module1ShapeOf, type Module1Shape } from '../ectd/regional-backbone-readiness.js';
import { pmdaEctdV4Fact } from '../ectd/dispatch-readiness.js';
import { getSubmissionRegionProfile } from '../region-profiles/region-profile-service.js';
import { submissionChannelFor } from './registry/submittabilityCoverage.js';
import {
  ADAPTER_UNSOURCED,
  FDA_ESG_NOT_PROVEN,
  PMDA_PROTOCOL_UNVERIFIED,
} from '../submission-gateways/transport-refusals.js';
import {
  REGION_IDENTITY,
  canonicalRegionOf,
  type CanonicalRegion,
} from '../../../shared/regulatory/region-identity.js';
import { getByAgency } from '../../../shared/regulatory/global-document-registry.js';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';
import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge.js';

/** The active rule packs, by (doc_type, agency code). Injected so the composition stays pure. */
export interface ActiveRulePacks {
  find(docType: string, agency: string): { version: string; label: string } | null;
}

export interface MarketInput {
  /** The application type as the submission or program records it ('nda', 'maa', 'NDS', …). */
  applicationType: string;
  /** The market: an agency ('EMA', 'Health_Canada'), a region code ('EU', 'CA') or a submission region ('eu', 'ca'). */
  market: string;
}

export type OutlineState = 'outline' | 'no_outline' | 'unmapped';
export type ChannelState =
  /** A gateway adapter exists and is wired; nothing has been accepted through it (D7). */
  | 'unproven'
  /** The agency's channel is one the platform has no connector for; the applicant transmits. */
  | 'applicant_uploads'
  /** A web portal the applicant uses (CTIS). */
  | 'portal'
  /** The adapter refuses every transmit (PMDA). */
  | 'refused'
  /** No channel: none on record, or an adapter written from no agency source. */
  | 'none';

export interface MarketSupport {
  applicationType: string;
  /** The market as given. */
  market: string;
  /** Canonical region code, or null when the market names no region the platform knows. */
  region: CanonicalRegion | null;
  /** The agency, as the platform names it, or null. */
  agency: string | null;
  outline: { state: OutlineState; pack: { version: string; label: string } | null; detail: string };
  module1: { state: Module1Shape | null; detail: string };
  /** True when the gate checks this region's Module 1 against a region profile. */
  regionProfile: boolean;
  channel: { state: ChannelState; detail: string };
  /** The short statement: "Structured Module 1", "Flat Module 1, no channel", "No outline, no channel",
   *  "Outline only, no package" (a device filing), "Not supported", "Not offered". */
  summary: string;
  /** The sentence a market row says (FILING_SPINE.md §3, "Market row says"). */
  line: string;
  /** A region-correct dossier can be built: an outline, and Module 1 to the agency's own headings. */
  buildable: boolean;
  /** False when the platform maps no outline or channel for the market, or the agency has no such application. */
  offered: boolean;
}

const MODULE1_DETAIL: Record<Module1Shape, string> = {
  structured: "Module 1 is built to the agency's own headings",
  flat: "Module 1 leaves are filed flat under the agency's root element, not under its headings",
  placeholder: "Module 1 reuses another region's backbone structure as a placeholder",
};

const MODULE1_LABEL: Record<Module1Shape, string> = {
  structured: 'Structured Module 1',
  flat: 'Flat Module 1',
  placeholder: 'Placeholder Module 1',
};

/** The region profile's key for a canonical region (region-profile-service.ts REGION_MAP). */
const PROFILE_KEY: Partial<Record<CanonicalRegion, string>> = { US: 'fda', EU: 'eu', JP: 'jp' };

/** The registered filing for (agency, application type), or null. */
function registryEntryFor(agency: string, applicationType: string): RegulatoryApplicationType | null {
  const want = applicationType.trim().toUpperCase();
  const bridged = resolveToRegistryEntry(want as never) as RegulatoryApplicationType | null | undefined;
  if (bridged && bridged.agency === agency) return bridged;
  return getByAgency(agency as never).find((e) => e.applicationType.toUpperCase() === want) ?? null;
}

/** The channel, judged against the adapters' own refusals. */
export function channelSupportFor(entry: RegulatoryApplicationType | null): { state: ChannelState; detail: string; channel: string | null } {
  if (!entry) return { state: 'none', detail: 'no filing of this type is registered for this agency, so no channel is on record', channel: null };
  const ch = submissionChannelFor(entry);
  switch (ch.kind) {
    case 'portal':
      return { state: 'portal', detail: `${ch.channel}: a web portal the applicant uses`, channel: ch.channel };
    case 'unconnected':
      return { state: 'applicant_uploads', detail: `${ch.reason}. ${ch.applicantStep}`, channel: ch.channel };
    case 'none':
      return { state: 'none', detail: 'its region has no gateway identity, so no channel is on record', channel: null };
    case 'gateway': {
      const name = `${ch.region}:${ch.name}`;
      if (ch.region === 'pmda') return { state: 'refused', detail: PMDA_PROTOCOL_UNVERIFIED, channel: name };
      if (ch.region === 'fda' && ch.name === 'esg') return { state: 'unproven', detail: FDA_ESG_NOT_PROVEN, channel: name };
      if (ch.region === 'ema') return { state: 'unproven', detail: 'the EMA gateway is connected and no submission has been accepted through it', channel: name };
      return { state: 'none', detail: ADAPTER_UNSOURCED, channel: name };
    }
  }
}

/** The canonical region a market names: an agency, a region code or a submission
 *  region, with 'Health Canada' and 'health-canada' read as 'Health_Canada'. */
function regionOfMarket(market: string): CanonicalRegion | null {
  return canonicalRegionOf(market) ?? canonicalRegionOf(market.trim().replace(/[\s-]+/g, '_')) ?? null;
}

/** How Module 1 is built for an agency or region, or null when it names no region. */
export function module1ShapeForAgency(market: string): Module1Shape | null {
  const region = regionOfMarket(market);
  return region ? module1ShapeOf(REGION_IDENTITY[region].gatewaySlug) : null;
}

/** How Module 1 is built for an agency, with the sentence that says so, or null. */
export function module1StatementForAgency(market: string): { shape: Module1Shape; detail: string } | null {
  const shape = module1ShapeForAgency(market);
  return shape ? { shape, detail: MODULE1_DETAIL[shape] } : null;
}

/** A channel the platform cannot send through. Only an unproven, wired gateway is not this. */
export const NO_CHANNEL_STATES: ReadonlySet<ChannelState> = new Set(['applicant_uploads', 'portal', 'refused', 'none']);

function channelLine(channel: { state: ChannelState; detail: string; channel: string | null }): string {
  switch (channel.state) {
    case 'unproven': return `Transmit not proven: ${channel.detail}`;
    case 'applicant_uploads': return `Applicant uploads through the ${channel.channel}`;
    case 'portal': return `${(channel.channel ?? 'Portal').split(' — ')[0]} portal only`;
    case 'refused': return `Not sent: ${channel.detail}`;
    case 'none': return 'No channel';
  }
}

type Base = Pick<MarketSupport, 'applicationType' | 'market' | 'region' | 'agency'>;
type Identity = (typeof REGION_IDENTITY)[CanonicalRegion];
type JudgedChannel = ReturnType<typeof channelSupportFor>;

/** The market's region, identity and agency code, from whatever the caller named it. */
function identify(input: MarketInput): { base: Base; identity: Identity | null; agencyCode: string | null } {
  const applicationType = String(input.applicationType ?? '').trim();
  const market = String(input.market ?? '').trim();
  const region = regionOfMarket(market);
  const identity = region ? REGION_IDENTITY[region] : null;
  const agencyCode = identity ? AGENCY_TO_CODE[identity.agency.toUpperCase().replace(/[\s-]+/g, '_')] ?? null : null;
  return { base: { applicationType, market, region, agency: identity?.agency ?? null }, identity, agencyCode };
}

/**
 * A market the platform maps to no governed document class: no outline and no
 * channel. A project created for it gets no outline (scaffold-project-documents
 * declines the binding); creating a submission for it is not refused, so the
 * line states what is missing and claims no refusal (design review, 2026-10-08).
 */
function unmappedSupport(base: Base, identity: Identity | null): MarketSupport {
  const reason = describeUnmappedClass(base.applicationType, identity?.agency ?? base.market);
  const named = identity?.agency ?? (base.market || 'this market');
  const shape = identity ? module1ShapeOf(identity.gatewaySlug) : null;
  return {
    ...base,
    outline: { state: 'unmapped', pack: null, detail: reason },
    module1: { state: shape, detail: shape ? MODULE1_DETAIL[shape] : 'no region' },
    regionProfile: false,
    channel: { state: 'none', detail: 'the platform maps no channel for this market' },
    summary: 'Not supported',
    line: `Not supported: the platform has no filing outline or channel for ${named}`,
    buildable: false,
    offered: false,
  };
}

/** The agency's own pack, else the ICH-harmonised one, never another agency's:
 *  the order scaffold-project-documents.ts takes, so the outline stated is the
 *  one a project created for this market gets (a DMF's is mod3:ich). */
function outlineFor(docType: string | null, agencyCode: string, applicationType: string, packs: ActiveRulePacks): MarketSupport['outline'] {
  const pack = docType
    ? [agencyCode, ...AGENCY_FALLBACKS].map((agency) => packs.find(docType, agency)).find(Boolean) ?? null
    : null;
  if (pack) return { state: 'outline', pack, detail: `governed outline ${pack.label} (${pack.version})` };
  return {
    state: 'no_outline',
    pack: null,
    detail: docType
      ? `no rule pack defines '${docType}' for '${agencyCode}'`
      : `the application type '${applicationType}' has no governed document class`,
  };
}

/**
 * A device filing (510(k), De Novo, PMA, IDE, MDR, IVDR, CER) is not eCTD, and
 * the platform builds no device package or transmit yet (FILING_SPINE.md §4).
 * Its outline is stated and nothing more is claimed: it read "Structured
 * Module 1. Transmit not proven…" and buildable (design review, 2026-10-08).
 */
function deviceSupport(shared: Omit<MarketSupport, 'outline' | 'summary' | 'line' | 'buildable' | 'offered'>, outline: MarketSupport['outline']): MarketSupport {
  const lead = outline.state === 'outline' ? 'Outline only' : 'No outline';
  return {
    ...shared,
    outline,
    module1: { state: null, detail: 'a device filing is not eCTD, so it has no Module 1' },
    channel: { state: 'none', detail: 'the platform transmits no device filing yet' },
    summary: `${lead}, no package`,
    line: `${lead}: device filings are not eCTD, and the platform builds no device package or transmit yet`,
    buildable: false,
    offered: true,
  };
}

/** PMDA takes only eCTD v4.0 for new applications from the dated fact's effective date. */
function pmdaNewApplicationsBlocked(code: CanonicalRegion, asOf: string): boolean {
  if (code !== 'JP') return false;
  const fact = pmdaEctdV4Fact(asOf);
  return !!fact && fact.status === 'in_force' && asOf >= fact.effectiveDate;
}

function lineFor(outline: MarketSupport['outline'], ch: JudgedChannel, pmdaBlocked: boolean): string {
  if (pmdaBlocked) return 'New applications blocked: eCTD v4.0 required';
  if (outline.state === 'outline') return channelLine(ch);
  return `No outline; ${NO_CHANNEL_STATES.has(ch.state) ? 'no channel' : channelLine(ch)}`;
}

function summaryFor(outline: MarketSupport['outline'], shape: Module1Shape, ch: JudgedChannel): string {
  const noChannel = NO_CHANNEL_STATES.has(ch.state) ? ', no channel' : '';
  return outline.state === 'outline' ? `${MODULE1_LABEL[shape]}${noChannel}` : `No outline${noChannel}`;
}

/**
 * The statement for one market. `asOf` (YYYY-MM-DD) dates the facts that change
 * with time, today PMDA's end of eCTD v3.2.2 for new applications.
 */
export function marketSupport(input: MarketInput, packs: ActiveRulePacks, asOf: string = new Date().toISOString().slice(0, 10)): MarketSupport {
  const { base, identity, agencyCode } = identify(input);
  if (!identity || !agencyCode) return unmappedSupport(base, identity);
  const { applicationType } = base;

  const docType = PROGRAM_TO_DOC_TYPE[applicationType.toLowerCase()] ?? null;
  const shape = module1ShapeOf(identity.gatewaySlug);
  const regionProfile = getSubmissionRegionProfile(PROFILE_KEY[identity.code] ?? identity.code.toLowerCase()) != null;
  const ch = channelSupportFor(registryEntryFor(identity.agency, applicationType));
  const shared = { ...base, module1: { state: shape, detail: MODULE1_DETAIL[shape] }, regionProfile, channel: { state: ch.state, detail: ch.detail } };

  // The UK has no IND. The ind:mhra pack exists and is mislabelled (FILING_SPINE.md §3).
  if (agencyCode === 'mhra' && docType === 'ind') {
    return {
      ...shared,
      outline: { state: 'no_outline', pack: null, detail: 'the ind:mhra rule pack is mislabelled: the UK has no IND' },
      summary: 'Not offered',
      line: 'Not offered: the UK has no IND application type',
      buildable: false,
      offered: false,
    };
  }

  const outline = outlineFor(docType, agencyCode, applicationType, packs);
  if (workstreamForFilingType(applicationType) === 'MDX') return deviceSupport(shared, outline);
  return {
    ...shared,
    outline,
    summary: summaryFor(outline, shape, ch),
    line: lineFor(outline, ch, pmdaNewApplicationsBlocked(identity.code, asOf)),
    buildable: outline.state === 'outline' && shape === 'structured',
    offered: true,
  };
}

/** The statement for each market, with the active packs read once. */
export async function readMarketSupport(
  client: RulePackQueryable,
  inputs: MarketInput[],
  asOf?: string,
): Promise<MarketSupport[]> {
  const rows = await listActiveRulePacks(client);
  /* No active pack at all is a store that was not read (unseeded, or emptied),
     not a platform with no outline for any market: said as a failure, it
     reaches the caller's error state instead of "No outline" on every row. */
  if (rows.length === 0) throw new Error('No active rule pack could be read, so no market can be judged.');
  const byKey = new Map(rows.map((r) => [`${r.doc_type}:${r.agency}`, { version: r.version, label: r.label }]));
  const packs: ActiveRulePacks = { find: (docType, agency) => byKey.get(`${docType}:${agency}`) ?? null };
  return inputs.map((input) => marketSupport(input, packs, asOf));
}
